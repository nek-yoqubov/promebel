/* ============================================================
   PRO MEBEL · CRM — общее ядро
   Клиент Supabase, авторизация, каркас навигации, пуши, Telegram,
   esc(), даты, тема, иконки. Подключается на каждой странице.
   Схема в базе — crm. Права держит RLS, фронт их не дублирует.
   ============================================================ */

const SUPABASE_URL = 'https://mtvjnkklzyplbxaxwszm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rM3r9_o443Ij_8ISr-nE7Q_BxKWNnnO';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'crm' } });

const BOT_USERNAME = 'pro_organaizer_bot';

/* ============================================================
   ЭКРАНИРОВАНИЕ — через это идёт весь текст из базы
   ============================================================ */
function esc(v){
  if(v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

/* ============================================================
   СЛОВАРИ
   ============================================================ */
const STATUS_RU = {
  new:'Новая', in_progress:'В работе', review:'На проверке',
  done:'Выполнена', canceled:'Отменена'
};
const PRIORITY_RU = { low:'Низкий', normal:'Обычный', high:'Высокий', critical:'Критический' };
const ROLE_RU = {
  admin:'Администратор',
  director:'Директор',
  head:'Главный менеджер',
  regional:'Региональный менеджер',
  sales:'Менеджер',
  brand:'Бренд-менеджер',
  hr:'HR',
  callcenter:'Колл-центр',
  production:'Раскрой',
  cashier:'Касса',
  auditor:'Ревизор'
};
const EVENT_RU = { created:'Задача создана', status_changed:'Смена статуса', escalated:'Эскалация руководителю' };
const DOC_TYPE_RU = {
  passport:'Паспорт', contract:'Договор', nda:'Положение о конфиденциальности',
  diploma:'Диплом', other:'Другое'
};
const LINK_CAT_RU = { kpi:'KPI', plan:'Планы', doc:'Документы', other:'Прочее' };
const LINK_CAT_ORDER = ['kpi','plan','doc','other'];

/* Роль — это только права. Как должность зовётся в компании, пишут текстом в position. */
function roleOptions(sel){
  return Object.keys(ROLE_RU).map(k =>
    '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(ROLE_RU[k]) + '</option>'
  ).join('');
}
/* Цветная точка статуса — цветом обозначаем только статус и просрочку */
function statusDot(t){
  const late = t.is_overdue && t.status !== 'done' && t.status !== 'canceled';
  return '<span class="dot ' + (late ? 'late' : 'st-' + esc(t.status)) + '"></span>';
}

/* ============================================================
   ДАТЫ
   ============================================================ */
function plural(n, one, few, many){
  const a = Math.abs(n) % 100, b = a % 10;
  if(a > 10 && a < 20) return many;
  if(b > 1 && b < 5) return few;
  if(b === 1) return one;
  return many;
}
function p2(n){ return String(n).padStart(2,'0'); }
const MONTHS = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];

function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return p2(d.getDate())+'.'+p2(d.getMonth()+1)+'.'+d.getFullYear();
}
function fmtTime(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return p2(d.getHours())+':'+p2(d.getMinutes());
}
function fmtDateTime(iso){
  if(!iso) return '—';
  return fmtDate(iso)+' '+fmtTime(iso);
}
/* «сегодня 14:30» / «вчера 09:05» / «12 сен 14:30» */
function fmtWhen(iso){
  if(!iso) return '—';
  const diff = dayDiff(new Date(iso), new Date());
  if(diff === 0) return 'сегодня '+fmtTime(iso);
  if(diff === -1) return 'вчера '+fmtTime(iso);
  const d = new Date(iso);
  return d.getDate()+' '+MONTHS[d.getMonth()]+' '+fmtTime(iso);
}
/* Короткий срок для строки списка: «сегодня 18:00», «вчера», «14 сен» */
function shortDue(iso){
  if(!iso) return '';
  const d = new Date(iso), dd = dayDiff(d, new Date());
  if(dd === 0) return 'сегодня '+fmtTime(iso);
  if(dd === 1) return 'завтра '+fmtTime(iso);
  if(dd === -1) return 'вчера';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.getDate()+' '+MONTHS[d.getMonth()]+(sameYear ? '' : ' '+d.getFullYear());
}
function dayDiff(a, b){
  const x = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const y = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((x - y) / 86400000);
}
function span(ms){
  const min = Math.round(ms / 60000);
  if(min < 60) return Math.max(min,1)+' '+plural(min,'минуту','минуты','минут');
  const h = Math.round(min / 60);
  if(h < 24) return h+' '+plural(h,'час','часа','часов');
  const d = Math.round(h / 24);
  return d+' '+plural(d,'день','дня','дней');
}
/* Остаток времени по дедлайну: {text, cls} */
function dueInfo(t){
  if(!t.due_at) return { text:'без срока', cls:'muted' };
  if(t.status === 'done' || t.status === 'canceled') return { text:fmtDateTime(t.due_at), cls:'muted' };
  const d = new Date(t.due_at), now = new Date(), ms = d - now;
  if(ms < 0) return { text:'просрочено на '+span(-ms), cls:'late' };
  const dd = dayDiff(d, now);
  if(dd === 0) return { text:'сегодня в '+fmtTime(t.due_at), cls:'warn' };
  if(dd === 1) return { text:'завтра в '+fmtTime(t.due_at), cls:'warn' };
  return { text:'через '+span(ms), cls:'ok' };
}
function localToISO(v){
  if(!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}
/* Значение для <input type="datetime-local"> из Date */
function isoToLocalInput(d){
  return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())+'T'+p2(d.getHours())+':'+p2(d.getMinutes());
}
function startOfToday(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
function endOfToday(){ const d = new Date(); d.setHours(23,59,59,999); return d; }
function endOfWeek(){ const d = endOfToday(); d.setDate(d.getDate()+6); return d; }

/* ============================================================
   ФОРМАТЫ
   ============================================================ */
function fmtMoney(v, currency){
  if(v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if(isNaN(n)) return '—';
  return n.toLocaleString('ru-RU', { maximumFractionDigits:2 }) + ' ' + (currency || 'TJS');
}
const TRANSLIT = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',
  ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
function translit(str){
  return String(str || '').split('').map(ch => {
    const low = ch.toLowerCase(), t = TRANSLIT[low];
    if(t === undefined) return ch;
    return ch === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
  }).join('');
}
function safeFileName(name){
  const t = translit(name).replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return (t || 'file').slice(-80);
}
function fmtSize(bytes){
  const b = Number(bytes) || 0;
  if(b < 1024) return b + ' Б';
  if(b < 1048576) return Math.round(b / 1024) + ' КБ';
  return (b / 1048576).toFixed(1).replace('.', ',') + ' МБ';
}
function fmtDateOnly(d){
  if(!d) return '—';
  const p = String(d).split('-');
  return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : String(d);
}
function initials(name){
  return String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

/* ============================================================
   ОШИБКИ
   Сообщения триггеров базы написаны по-русски — показываем как есть.
   ============================================================ */
function errText(e, ctx){
  if(!e) return 'Неизвестная ошибка';
  const m = e.message || e.error_description || e.msg || String(e);
  if(/row-level security/i.test(m)){
    if(ctx === 'task-add') return 'База отказала: задачу можно поставить только себе или своему подчинённому.';
    if(ctx === 'task-edit') return 'База отказала: у вас нет прав менять эту задачу.';
    if(ctx === 'insert') return 'База отказала: у вас нет прав добавлять такие записи.';
    if(ctx === 'update') return 'База отказала: у вас нет прав менять эту запись.';
    return 'База отказала: у вас нет прав на это действие.';
  }
  if(/Invalid login credentials/i.test(m)) return 'Неверная почта или пароль';
  if(/already.*registered|already exists|email_exists|User already/i.test(m))
    return 'Сотрудник с такой почтой уже заведён';
  if(/duplicate key|unique constraint|23505/i.test(m)) return 'Такое название уже занято';
  if(/[Pp]assword should be at least|password.*too short/i.test(m))
    return 'Пароль слишком короткий — нужно не меньше 8 символов';
  if(/invalid format|Unable to validate email|email.*invalid/i.test(m)) return 'Почта указана неверно';
  if(/Email not confirmed/i.test(m)) return 'Почта не подтверждена — обратитесь к администратору';
  if(/Email rate limit|Too many requests|rate limit/i.test(m)) return 'Слишком много попыток, подождите минуту';
  if(/Failed to fetch|NetworkError|fetch failed/i.test(m)) return 'Нет связи с сервером. Проверьте интернет.';
  if(/violates foreign key/i.test(m)) return 'Ссылка на несуществующую запись — обновите страницу.';
  if(/JWT|token is expired/i.test(m)) return 'Сессия истекла, войдите заново';
  return m;
}

/* ============================================================
   АВТОРИЗАЦИЯ И ПРОФИЛЬ
   ============================================================ */
let ME = null;

async function requireAuth(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session){ location.replace('login.html'); return null; }
  const { data, error } = await sb.from('employees')
    .select('id, full_name, role, position, branch_id, manager_id, telegram_chat_id')
    .eq('id', session.user.id).maybeSingle();
  if(error){ fatal('Не удалось загрузить профиль', errText(error)); return null; }
  if(!data){
    await sb.auth.signOut();
    location.replace('login.html?nouser=1');
    return null;
  }
  ME = data;
  ME.email = session.user.email || '';
  return ME;
}
async function logout(){
  try{
    if('serviceWorker' in navigator){
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      if(sub){
        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
    }
  }catch(e){}
  await sb.auth.signOut();
  location.replace('login.html');
}
function isBossRole(){ return ME && (ME.role === 'admin' || ME.role === 'director'); }
function isHrRole(){ return ME && (ME.role === 'admin' || ME.role === 'director' || ME.role === 'hr'); }

function fatal(title, detail){
  document.body.innerHTML =
    '<div class="fatal">'+logoMark(44)+
    '<div class="t">'+esc(title)+'</div>'+
    '<div class="d">'+esc(detail||'')+'</div>'+
    '<button class="btn ghost" onclick="logout()">Выйти</button></div>';
}

/* ============================================================
   EDGE FUNCTION crm-users
   ============================================================ */
async function callUsersFn(payload){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session) return { error:'Сессия истекла, войдите заново' };
  try{
    const r = await fetch(SUPABASE_URL + '/functions/v1/crm-users', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        apikey: SUPABASE_KEY,
        Authorization:'Bearer ' + session.access_token
      },
      body: JSON.stringify(payload)
    });
    let res;
    try{ res = await r.json(); }
    catch(e){ return { error:'Сервер вернул непонятный ответ (' + r.status + ')' }; }
    if(!r.ok && !res.error) return { error:'Ошибка сервера (' + r.status + ')' };
    return res;
  }catch(e){
    return { error:'Нет связи с сервером. Проверьте интернет.' };
  }
}

/* ============================================================
   СПРАВОЧНИКИ (кэш на страницу)
   ============================================================ */
let EMPS = [], EMP_BY_ID = {}, BRANCHES = [], BRANCH_BY_ID = {};

async function loadEmployees(){
  if(EMPS.length) return EMPS;
  const { data, error } = await sb.from('employees')
    .select('id, full_name, role, position, branch_id, manager_id')
    .eq('is_active', true).order('full_name');
  if(error){ console.error('employees', error); return []; }
  EMPS = data || [];
  EMP_BY_ID = {};
  EMPS.forEach(e => EMP_BY_ID[e.id] = e);
  return EMPS;
}
async function loadBranches(){
  if(BRANCHES.length) return BRANCHES;
  const { data, error } = await sb.from('branches')
    .select('id, name').eq('is_active', true).order('name');
  if(error){ console.error('branches', error); return []; }
  BRANCHES = data || [];
  BRANCH_BY_ID = {};
  BRANCHES.forEach(b => BRANCH_BY_ID[b.id] = b);
  return BRANCHES;
}
function empName(id){
  if(!id) return '—';
  const e = EMP_BY_ID[id];
  return e ? e.full_name : 'сотрудник удалён';
}
/* Повторяет crm.is_manager_of(): идём вверх по manager_id от исполнителя. */
function isManagerOf(targetId){
  if(!ME || !targetId) return false;
  let cur = targetId;
  for(let i = 0; i < 20 && cur; i++){
    const e = EMP_BY_ID[cur];
    if(!e) return false;
    if(e.manager_id === ME.id) return true;
    cur = e.manager_id;
  }
  return false;
}
function canBoss(t){
  if(!ME || !t) return false;
  return isBossRole() || t.author_id === ME.id || isManagerOf(t.assignee_id);
}
function isAssignee(t){ return !!(ME && t && t.assignee_id === ME.id); }
function canAssignTo(id){ return isBossRole() || id === ME.id || isManagerOf(id); }

/* ============================================================
   ИКОНКИ (inline SVG, feather-стиль)
   ============================================================ */
const ICONS = {
  check:'<svg class="i" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  checkCircle:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12 11 14.5 16 9.5"/></svg>',
  clock:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  play:'<svg class="i" viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20" fill="currentColor" stroke="none"/></svg>',
  send:'<svg class="i" viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
  back:'<svg class="i" viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>',
  arrowLeft:'<svg class="i" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  ban:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
  plus:'<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  x:'<svg class="i" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  search:'<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/></svg>',
  dots:'<svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>',
  user:'<svg class="i" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  users:'<svg class="i" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/></svg>',
  list:'<svg class="i" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  layers:'<svg class="i" viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  target:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>',
  calendar:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  building:'<svg class="i" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3"/></svg>',
  message:'<svg class="i" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-3.2-.5L3 21l1.6-4.4A8.3 8.3 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/></svg>',
  history:'<svg class="i" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/></svg>',
  bell:'<svg class="i" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  logout:'<svg class="i" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  sun:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>',
  moon:'<svg class="i" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  alert:'<svg class="i" viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5M12 17h.01"/></svg>',
  flag:'<svg class="i" viewBox="0 0 24 24"><path d="M4 21V4h11l-1.5 4L15 12H4"/></svg>',
  download:'<svg class="i" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><path d="M12 15V3"/></svg>',
  share:'<svg class="i" viewBox="0 0 24 24"><path d="M12 16V3"/><polyline points="8 7 12 3 16 7"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  link:'<svg class="i" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  external:'<svg class="i sm" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><path d="M10 14 21 3"/></svg>',
  file:'<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/></svg>',
  idcard:'<svg class="i" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5 16c.6-1.6 2-2.4 3.5-2.4S11.4 14.4 12 16M15 10h4M15 14h4"/></svg>',
  edit:'<svg class="i sm" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash:'<svg class="i sm" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  upload:'<svg class="i" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 8 12 3 17 8"/><path d="M12 3v12"/></svg>',
  telegram:'<svg class="i" viewBox="0 0 24 24"><path d="M21.5 4.3 2.9 11.2c-.9.3-.9 1.6 0 1.9l4.7 1.5 1.8 5.4c.3.8 1.3 1 1.9.4l2.6-2.5 4.6 3.4c.7.5 1.7.1 1.9-.7l3-14.3c.2-.9-.7-1.6-1.9-1z"/><path d="m7.6 14.6 9.9-6.7-7.6 8"/></svg>',
  chevron:'<svg class="i sm" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
  settings:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>'
};
function icon(name){ return ICONS[name] || ''; }

/* ============================================================
   ЛОГОТИП — оранжевый шестиугольник-контур с буквой P
   ============================================================ */
function logoMark(size){
  const s = size || 30;
  return '<img class="mark" src="logo-mark.png" width="' + s + '" height="' + s + '" alt="">';
}

/* ============================================================
   ТЕМА
   ============================================================ */
function applyTheme(t){
  document.body.classList.toggle('light', t === 'light');
  localStorage.setItem('crm_theme', t);
  document.querySelectorAll('img[data-dark]').forEach(img => {
    img.src = t === 'light' ? img.dataset.light : img.dataset.dark;
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.content = t === 'light' ? '#ffffff' : '#11131a';
  document.querySelectorAll('[data-theme-label]').forEach(el => {
    el.textContent = t === 'light' ? 'Светлая' : 'Тёмная';
  });
}
function toggleTheme(){ applyTheme(document.body.classList.contains('light') ? 'dark' : 'light'); }
function initTheme(){ applyTheme(localStorage.getItem('crm_theme') || 'dark'); }

/* ============================================================
   КАРКАС НАВИГАЦИИ
   Телефон: тонкая шапка сверху + панель вкладок снизу.
   ПК: постоянная боковая панель слева.
   Каждая страница вызывает renderShell({title, tab}).
   ============================================================ */
const NAV_MAIN = [
  { key:'home',   label:'Сегодня',      href:'index.html',            icon:'calendar' },
  { key:'tasks',  label:'Задачи',       href:'tasks.html?tab=mine',   icon:'list' },
  { key:'add',    label:'Новая задача', href:'new-task.html',         icon:'plus', fab:true },
  { key:'notif',  label:'Уведомления',  href:'notifications.html',    icon:'bell', bell:true },
  { key:'profile',label:'Профиль',      href:'profile.html',          icon:'user' }
];
const NAV_EXTRA = [
  { key:'author', label:'Поставленные', href:'tasks.html?tab=author', icon:'target' },
  { key:'admin', label:'Сотрудники',     href:'admin.html', icon:'users', roles:['admin','director','hr'] },
  { key:'links', label:'Ссылки и планы', href:'links.html', icon:'link' },
  { key:'cal',   label:'Календарь',      icon:'calendar', soon:true }
];

function renderShell(opts){
  const o = opts || {};
  const tab = o.tab || '';

  const tabbar = NAV_MAIN.map(n => {
    const on = n.key === tab || (n.key === 'tasks' && tab === 'author');
    if(n.fab){
      return '<a class="tb fab" href="' + n.href + '" aria-label="' + esc(n.label) + '">' + icon(n.icon) + '</a>';
    }
    return '<a class="tb' + (on ? ' on' : '') + '" href="' + n.href + '">' +
      '<span class="ic">' + icon(n.icon) + (n.bell ? '<span class="cnt" data-unread hidden></span>' : '') + '</span>' +
      '<span class="lb">' + esc(n.label) + '</span></a>';
  }).join('');

  const main = NAV_MAIN.filter(n => !n.fab && n.key !== 'profile');
  const sideItems = main.slice(0, 2).concat(NAV_EXTRA.slice(0, 1), main.slice(2), NAV_EXTRA.slice(1))
    .filter(n => !n.roles || (ME && n.roles.includes(ME.role)))
    .map(n => {
      const on = n.key === tab;
      if(n.soon){
        return '<span class="sd soon">' + icon(n.icon) + '<span>' + esc(n.label) + '</span>' +
          '<span class="tag">скоро</span></span>';
      }
      return '<a class="sd' + (on ? ' on' : '') + '" href="' + n.href + '">' + icon(n.icon) +
        '<span>' + esc(n.label) + '</span>' +
        (n.bell ? '<span class="cnt" data-unread hidden></span>' : '') + '</a>';
    }).join('');

  const shell =
    '<header class="tbar">' +
      (o.back
        ? '<button class="ib" id="shellBack" aria-label="Назад">' + icon('arrowLeft') + '</button>'
        : '<a class="ib logo" href="index.html" aria-label="На главную">' + logoMark(26) + '</a>') +
      '<h1 class="tt">' + esc(o.title || '') + '</h1>' +
      '<div class="ta">' + (o.actions || '') +
        '<a class="ib" href="notifications.html" aria-label="Уведомления">' + icon('bell') +
          '<span class="cnt" data-unread hidden></span></a>' +
      '</div>' +
    '</header>' +
    '<aside class="side">' +
      '<a class="slogo" href="index.html"><img src="logo-h-dark.png" data-dark="logo-h-dark.png" data-light="logo-h-light.png" alt="PRO MEBEL"></a>' +
      '<nav class="snav">' + sideItems + '</nav>' +
      '<a class="sme" href="profile.html">' +
        '<span class="ava">' + esc(ME ? initials(ME.full_name) : '') + '</span>' +
        '<span class="smi"><b>' + esc(ME ? ME.full_name : '') + '</b>' +
        '<i>' + esc(ME ? (ROLE_RU[ME.role] || ME.role) : '') + '</i></span></a>' +
    '</aside>' +
    '<nav class="tabbar">' + tabbar + '</nav>';

  document.body.insertAdjacentHTML('afterbegin', shell);
  document.body.classList.add('shell');
  if(o.back){
    document.getElementById('shellBack').onclick = () => {
      if(typeof o.back === 'function') o.back();
      else if(history.length > 1) history.back();
      else location.href = String(o.back);
    };
  }
  applyTheme(localStorage.getItem('crm_theme') || 'dark');
  refreshUnread();
}

/* ============================================================
   УВЕДОМЛЕНИЯ И ЦИФРА НА ИКОНКЕ
   ============================================================ */
let NOTIFS = [];

async function loadNotifications(limit){
  const { data, error } = await sb.from('notifications')
    .select('id, kind, title, body, read_at, task_id, created_at')
    .order('created_at', { ascending:false }).limit(limit || 50);
  if(error){ console.error('notifications', error); return []; }
  NOTIFS = data || [];
  paintUnread(NOTIFS.filter(n => !n.read_at).length);
  return NOTIFS;
}
/* Счётчик без загрузки списка — для шапки на любой странице */
async function refreshUnread(){
  const { data, error } = await sb.schema('crm').rpc('my_unread_count');
  if(error){ console.warn('unread', error); return; }
  paintUnread(Number(data) || 0);
}
function paintUnread(n){
  document.querySelectorAll('[data-unread]').forEach(el => {
    el.textContent = n > 99 ? '99+' : n;
    el.hidden = !n;
  });
  setAppBadge(n);
}
function setAppBadge(n){
  try{
    if(n > 0 && navigator.setAppBadge) navigator.setAppBadge(n);
    else if(navigator.clearAppBadge) navigator.clearAppBadge();
  }catch(e){}
}
async function markRead(ids){
  if(!ids || !ids.length) return;
  const now = new Date().toISOString();
  const { error } = await sb.from('notifications').update({ read_at: now }).in('id', ids);
  if(error){ console.error('markRead', error); return; }
  NOTIFS.forEach(n => { if(ids.includes(n.id) && !n.read_at) n.read_at = now; });
  paintUnread(NOTIFS.filter(n => !n.read_at).length);
}
async function markAllRead(){
  const { error } = await sb.from('notifications')
    .update({ read_at: new Date().toISOString() }).is('read_at', null);
  if(error){ console.error('markAllRead', error); return; }
  NOTIFS.forEach(n => { if(!n.read_at) n.read_at = new Date().toISOString(); });
  paintUnread(0);
}
/* База пишет заголовок как «Задача: review» — показываем статус по-русски */
function notifTitle(n){
  const m = /^Задача:\s*(\w+)$/.exec(n.title || '');
  if(m && STATUS_RU[m[1]]) return 'Задача: ' + STATUS_RU[m[1]].toLowerCase();
  return n.title;
}

/* ============================================================
   ВЕБ-ПУШ
   ============================================================ */
function pushSupported(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function pushPermission(){
  return ('Notification' in window) ? Notification.permission : 'unsupported';
}
function urlB64ToUint8(base64){
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for(let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
/* Вызывать только по нажатию кнопки — иначе iPhone не спросит разрешение */
async function enablePush(){
  if(!pushSupported()) return { error:'Этот браузер не умеет уведомления' };
  if(isIOS() && !isStandalone())
    return { error:'Сначала установите приложение на экран «Домой» — на iPhone уведомления работают только так' };

  const perm = await Notification.requestPermission();
  if(perm !== 'granted'){
    return { error: perm === 'denied'
      ? 'Уведомления заблокированы в настройках браузера'
      : 'Разрешение не выдано' };
  }
  const { data: key, error } = await sb.schema('crm').rpc('vapid_public_key');
  if(error || !key) return { error: errText(error || { message:'Сервер не отдал ключ уведомлений' }) };

  try{
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(key)
      });
    }
    const saved = await savePushSubscription(sub);
    if(saved.error) return saved;
    return { ok:true };
  }catch(e){
    return { error:'Не удалось подписаться: ' + (e && e.message ? e.message : e) };
  }
}
async function savePushSubscription(sub){
  const j = sub.toJSON();
  if(!j.keys || !j.keys.p256dh || !j.keys.auth) return { error:'Браузер не отдал ключи подписки' };
  const { error } = await sb.schema('crm').rpc('push_subscribe', {
    p_endpoint: sub.endpoint,
    p_p256dh: j.keys.p256dh,
    p_auth: j.keys.auth,
    p_ua: navigator.userAgent
  });
  return error ? { error: errText(error) } : { ok:true };
}
/* Тихо обновляем подписку при запуске: endpoint мог смениться */
async function refreshPushSubscription(){
  if(!pushSupported() || pushPermission() !== 'granted') return;
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub) await savePushSubscription(sub);
  }catch(e){ console.warn('push refresh', e); }
}
async function disablePush(){
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
    return { ok:true };
  }catch(e){
    return { error:'Не удалось отключить: ' + (e && e.message ? e.message : e) };
  }
}
async function pushTest(){
  const { error } = await sb.schema('crm').rpc('push_test');
  return error ? { error: errText(error) } : { ok:true };
}

/* ============================================================
   TELEGRAM
   ============================================================ */
async function tgLinkStart(){
  const { data, error } = await sb.schema('crm').rpc('tg_link_start');
  if(error) return { error: errText(error) };
  return { code: data, url: 'https://t.me/' + BOT_USERNAME + '?start=' + encodeURIComponent(data) };
}
async function tgUnlink(){
  const { error } = await sb.schema('crm').rpc('tg_unlink');
  if(error) return { error: errText(error) };
  ME.telegram_chat_id = null;
  return { ok:true };
}
/* Ждём, пока бот пришлёт нам chat_id: опрашиваем свою строку 2 минуты */
function waitForTelegram(onDone){
  let left = 40;
  const timer = setInterval(async () => {
    left--;
    const { data } = await sb.from('employees').select('telegram_chat_id').eq('id', ME.id).maybeSingle();
    if(data && data.telegram_chat_id){
      clearInterval(timer);
      ME.telegram_chat_id = data.telegram_chat_id;
      onDone(true);
    }else if(left <= 0){
      clearInterval(timer);
      onDone(false);
    }
  }, 3000);
  return () => clearInterval(timer);
}

/* ============================================================
   УСТАНОВКА НА ТЕЛЕФОН И ОБНОВЛЕНИЕ
   ============================================================ */
let installPrompt = null;

if('serviceWorker' in navigator){
  addEventListener('load', async () => {
    try{
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.update();
      refreshPushSubscription();
    }catch(e){ console.warn('sw', e); }
  });
  // новый воркер встал у руля — обновляемся один раз
  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(reloading || !hadController) return;
    reloading = true;
    toast('Приложение обновлено');
    setTimeout(() => location.reload(), 900);
  });
}
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  maybeShowInstallStrip();
});
addEventListener('appinstalled', () => { installPrompt = null; hideInstallStrip(); });

async function doInstall(){
  if(!installPrompt) return false;
  installPrompt.prompt();
  try{ await installPrompt.userChoice; }catch(e){}
  installPrompt = null;
  hideInstallStrip();
  return true;
}
function isIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone(){
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
/* отложенные подсказки: ключ -> до какого времени не показывать */
function snoozed(key){
  const v = Number(localStorage.getItem('crm_snooze_' + key) || 0);
  return v > Date.now();
}
function snooze(key, days){
  localStorage.setItem('crm_snooze_' + key, String(Date.now() + days * 86400000));
}
function maybeShowInstallStrip(){
  if(!installPrompt || isStandalone() || snoozed('install')) return;
  if(document.getElementById('installStrip')) return;
  const el = document.createElement('div');
  el.className = 'strip';
  el.id = 'installStrip';
  el.innerHTML =
    '<span class="st">Установите PRO MEBEL на экран телефона</span>' +
    '<button class="btn sm" id="stripGo">Установить</button>' +
    '<button class="ib" id="stripNo" aria-label="Закрыть">' + icon('x') + '</button>';
  document.body.appendChild(el);
  document.getElementById('stripGo').onclick = doInstall;
  document.getElementById('stripNo').onclick = () => { snooze('install', 7); hideInstallStrip(); };
}
function hideInstallStrip(){
  const el = document.getElementById('installStrip');
  if(el) el.remove();
}
/* Мягкое приглашение включить уведомления */
function maybeInviteNotifications(){
  if(!pushSupported() || pushPermission() !== 'default' || snoozed('notif')) return;
  if(isIOS() && !isStandalone()) return;
  if(document.getElementById('notifInvite')) return;
  const el = document.createElement('div');
  el.className = 'strip invite';
  el.id = 'notifInvite';
  el.innerHTML =
    '<span class="st">Включите уведомления, чтобы не пропускать задачи</span>' +
    '<button class="btn sm" id="invYes">Включить</button>' +
    '<button class="btn ghost sm" id="invNo">Позже</button>';
  document.body.appendChild(el);
  document.getElementById('invYes').onclick = async () => {
    const r = await enablePush();
    el.remove();
    toast(r.error ? r.error : 'Уведомления включены');
  };
  document.getElementById('invNo').onclick = () => { snooze('notif', 3); el.remove(); };
}

/* ============================================================
   ТОСТ И АНИМАЦИЯ «ГОТОВО»
   ============================================================ */
function toast(text){
  const old = document.querySelector('.toast');
  if(old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
/* Зелёная галочка по центру на 1,2 секунды */
function playDone(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const old = document.querySelector('.doneov');
  if(old) old.remove();
  const el = document.createElement('div');
  el.className = 'doneov';
  el.innerHTML = '<img src="anim-done.svg" alt="" width="140" height="140">';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

/* ============================================================
   СТРОКА ЗАДАЧИ — одинаковая в «Сегодня», списке и подзадачах
   Как строка чата: точка статуса, название, срок, вторая строка серым.
   ============================================================ */
function taskRowHTML(t, opts){
  const o = opts || {};
  const done = t.status === 'done' || t.status === 'canceled';
  const late = t.is_overdue && !done;
  const who = o.showAuthor ? (t.author_name || empName(t.author_id))
                           : (t.assignee_name || empName(t.assignee_id));
  const when = shortDue(t.due_at);
  const pri = (t.priority === 'high' || t.priority === 'critical')
    ? '<span class="pri ' + esc(t.priority) + '" title="' + esc(PRIORITY_RU[t.priority]) + '">' + icon('flag') + '</span>'
    : '';
  const subs = Number(t.subtasks_total) > 0
    ? '<span class="subs">' + t.subtasks_done + '/' + t.subtasks_total + '</span>' : '';
  const l2 = [esc(who), subs].filter(Boolean).join(' · ');

  return '<button class="row' + (done ? ' muted' : '') + (o.active ? ' on' : '') + '" data-task="' + t.id + '">' +
    statusDot(t) +
    '<span class="rb">' +
      '<span class="l1"><span class="t">' + esc(t.title) + '</span>' + pri +
        (when ? '<span class="when' + (late ? ' late' : '') + '">' + esc(when) + '</span>' : '') +
      '</span>' +
      '<span class="l2">' + l2 + '</span>' +
    '</span></button>';
}
/* просроченные сверху, дальше по дедлайну, потом по приоритету */
const PRIO_RANK = { critical:4, high:3, normal:2, low:1 };
function cmpTasks(a, b){
  if(!!b.is_overdue !== !!a.is_overdue) return (b.is_overdue ? 1 : 0) - (a.is_overdue ? 1 : 0);
  const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
  const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
  if(da !== db) return da - db;
  const pa = PRIO_RANK[a.priority] || 0, pb = PRIO_RANK[b.priority] || 0;
  if(pa !== pb) return pb - pa;
  return new Date(b.created_at) - new Date(a.created_at);
}
const TASK_COLS = 'id,title,description,author_id,assignee_id,parent_id,branch_id,priority,status,' +
  'due_at,done_criteria,created_at,is_overdue,assignee_name,assignee_role,author_name,branch_name,' +
  'subtasks_total,subtasks_done';
