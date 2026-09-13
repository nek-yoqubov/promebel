/* ============================================================
   PRO MEBEL · CRM — общее ядро
   Клиент Supabase, авторизация, профиль, esc(), даты, тема, иконки.
   Подключается на каждой странице до остальных скриптов.
   Схема в базе — crm. Права на данные держит RLS, фронт их не дублирует.
   ============================================================ */

const SUPABASE_URL = 'https://mtvjnkklzyplbxaxwszm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rM3r9_o443Ij_8ISr-nE7Q_BxKWNnnO';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'crm' } });

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
/* Роль — это только права. Как должность зовётся в компании, пишут текстом в position. */
function roleOptions(sel){
  return Object.keys(ROLE_RU).map(k =>
    '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(ROLE_RU[k]) + '</option>'
  ).join('');
}
const EVENT_RU = { created:'Задача создана', status_changed:'Смена статуса', escalated:'Эскалация руководителю' };
const DOC_TYPE_RU = {
  passport:'Паспорт', contract:'Договор', nda:'Положение о конфиденциальности',
  diploma:'Диплом', other:'Другое'
};
const LINK_CAT_RU = { kpi:'KPI', plan:'Планы', doc:'Документы', other:'Прочее' };
const LINK_CAT_ORDER = ['kpi','plan','doc','other'];

function statusBadge(s){
  return '<span class="badge st-'+esc(s)+'">'+esc(STATUS_RU[s]||s)+'</span>';
}
function priorityBadge(p){
  return '<span class="badge p-'+esc(p)+'">'+esc(PRIORITY_RU[p]||p)+'</span>';
}

/* ============================================================
   ДАТЫ
   Всё считаем по локальному времени браузера, в базе — timestamptz.
   ============================================================ */
function plural(n, one, few, many){
  const a = Math.abs(n) % 100, b = a % 10;
  if(a > 10 && a < 20) return many;
  if(b > 1 && b < 5) return few;
  if(b === 1) return one;
  return many;
}
function p2(n){ return String(n).padStart(2,'0'); }

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
/* «сегодня 14:30» / «12.09.2026 14:30» — для журнала и комментариев */
function fmtWhen(iso){
  if(!iso) return '—';
  const diff = dayDiff(new Date(iso), new Date());
  if(diff === 0) return 'сегодня '+fmtTime(iso);
  if(diff === -1) return 'вчера '+fmtTime(iso);
  return fmtDateTime(iso);
}
/* разница в календарных днях: b -> a (сегодня = 0, завтра = 1) */
function dayDiff(a, b){
  const x = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const y = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((x - y) / 86400000);
}
/* «2 дня», «5 ч», «40 мин» из миллисекунд */
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
/* Оклад: разряды пробелами, валюта из поля currency */
function fmtMoney(v, currency){
  if(v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if(isNaN(n)) return '—';
  const s = n.toLocaleString('ru-RU', { maximumFractionDigits:2 });
  return s + ' ' + (currency || 'TJS');
}
/* Имя файла для пути в хранилище: кириллицу переводим в латиницу,
   остальное чистим. Настоящее имя хранится в базе отдельным полем. */
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
/* Дата для <input type="date"> и обратно */
function fmtDateOnly(d){
  if(!d) return '—';
  const p = String(d).split('-');
  return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : String(d);
}

/* ISO-строка из значения <input type="datetime-local"> (локальное время) */
function localToISO(v){
  if(!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}
/* границы суток/недели для фильтра «срок» */
function startOfToday(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
function endOfToday(){ const d = new Date(); d.setHours(23,59,59,999); return d; }
function endOfWeek(){ const d = endOfToday(); d.setDate(d.getDate()+6); return d; }

/* ============================================================
   ОШИБКИ
   Сообщения триггеров базы написаны по-русски — показываем как есть.
   Технические сообщения RLS переводим в понятный текст.
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
   Сессию хранит SDK Supabase. Роль из профиля управляет только видом.
   ============================================================ */
let ME = null;

async function requireAuth(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session){ location.replace('login.html'); return null; }
  const { data, error } = await sb.from('employees')
    .select('id, full_name, role, position, branch_id, manager_id')
    .eq('id', session.user.id).maybeSingle();
  if(error){ fatal('Не удалось загрузить профиль', errText(error)); return null; }
  if(!data){
    // профиля нет — по ТЗ разлогиниваем и объясняем на входе
    await sb.auth.signOut();
    location.replace('login.html?nouser=1');
    return null;
  }
  ME = data;
  ME.email = session.user.email || '';
  return ME;
}
async function logout(){
  await sb.auth.signOut();
  location.replace('login.html');
}
function isBossRole(){ return ME && (ME.role === 'admin' || ME.role === 'director'); }
/* Повторяет crm.is_hr(): кадровые данные и документы */
function isHrRole(){ return ME && (ME.role === 'admin' || ME.role === 'director' || ME.role === 'hr'); }
/* Инициалы для аватарки */
function initials(name){
  return String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

function fatal(title, detail){
  document.body.innerHTML =
    '<div class="fatal">'+logoHTML()+
    '<div class="t">'+esc(title)+'</div>'+
    '<div class="d">'+esc(detail||'')+'</div>'+
    '<button class="btn ghost" onclick="logout()">Выйти</button></div>';
}

/* ============================================================
   EDGE FUNCTION crm-users
   Создание сотрудника, сброс пароля и отключение доступа.
   Права проверяет сама функция (admin/director), ответ — {ok:true,...}
   либо {error:'текст'}.
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

/* Повторяет crm.is_manager_of(): идём вверх по manager_id от исполнителя.
   Нужно только чтобы показать нужные кнопки — решает всё равно база. */
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
/* Кто «начальник» по задаче — те же условия, что в crm.tasks_guard() */
function canBoss(t){
  if(!ME || !t) return false;
  return isBossRole() || t.author_id === ME.id || isManagerOf(t.assignee_id);
}
function isAssignee(t){ return !!(ME && t && t.assignee_id === ME.id); }
/* Кому можно ставить задачи — как в RLS-политике crm.tasks «add» */
function canAssignTo(id){
  return isBossRole() || id === ME.id || isManagerOf(id);
}

/* ============================================================
   ИКОНКИ (inline SVG, feather-стиль) — эмодзи не используем
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
  search:'<svg class="i sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/></svg>',
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
  folder:'<svg class="i" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  file:'<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/></svg>',
  star:'<svg class="i" viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z"/></svg>',
  idcard:'<svg class="i" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5 16c.6-1.6 2-2.4 3.5-2.4S11.4 14.4 12 16M15 10h4M15 14h4"/></svg>',
  edit:'<svg class="i sm" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash:'<svg class="i sm" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  upload:'<svg class="i" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 8 12 3 17 8"/><path d="M12 3v12"/></svg>'
};
function icon(name){ return ICONS[name] || ''; }

/* ============================================================
   ЛОГОТИП — PRO MEBEL, латинская P
   ============================================================ */
function logoMark(){
  return '<svg viewBox="0 0 32 32" aria-hidden="true">'+
    '<rect x="0" y="0" width="32" height="32" rx="8" fill="var(--brand)"/>'+
    '<path d="M12 8v16M12 8h5.4a4.6 4.6 0 0 1 0 9.2H12" fill="none" stroke="var(--brand-ink)" '+
    'stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
function logoHTML(href){
  const a = href === null ? 'span' : 'a';
  const attr = href === null ? '' : ' href="'+(href || 'index.html')+'"';
  return '<'+a+' class="logo"'+attr+'>'+logoMark()+
    '<span class="lt">PRO <b>MEBEL</b></span></'+a+'>';
}

/* ============================================================
   ТЕМА — выбор запоминаем
   ============================================================ */
function applyTheme(t){
  document.body.classList.toggle('light', t === 'light');
  localStorage.setItem('crm_theme', t);
  // картинки с двумя версиями (вертикальный логотип на входе)
  document.querySelectorAll('img[data-dark]').forEach(img => {
    img.src = t === 'light' ? img.dataset.light : img.dataset.dark;
  });
  const btn = document.getElementById('themeBtn');
  if(btn){
    btn.innerHTML = t === 'light' ? icon('moon') : icon('sun');
    btn.title = t === 'light' ? 'Тёмная тема' : 'Светлая тема';
  }
}
function toggleTheme(){ applyTheme(document.body.classList.contains('light') ? 'dark' : 'light'); }
function initTheme(){ applyTheme(localStorage.getItem('crm_theme') || 'dark'); }

/* ============================================================
   ТОПБАР — общий для всех страниц
   Ждёт <div class="topbar" id="topbar"></div> в разметке.
   ============================================================ */
function renderTopbar(opts){
  const o = opts || {};
  const bar = document.getElementById('topbar');
  if(!bar) return;
  const who = ME ? esc(ME.full_name)+' · '+esc(ROLE_RU[ME.role] || ME.role) : '';
  bar.innerHTML =
    (o.back ? '<a class="icon-btn" href="'+esc(o.back)+'" title="Назад">'+icon('arrowLeft')+'</a>' : '')+
    logoHTML('index.html')+
    '<div class="spacer"></div>'+
    (o.actionsHTML || '')+
    '<span class="sep">'+who+'</span>'+
    (o.bell === false ? '' :
      '<span class="bell-wrap">'+
        '<button class="icon-btn" id="bellBtn" title="Уведомления">'+icon('bell')+'</button>'+
        '<div class="pop" id="bellPop" hidden>'+
          '<div class="pop-h"><span class="t">Уведомления</span>'+
          '<button id="bellReadAll">Прочитать все</button></div>'+
          '<div class="pop-list" id="bellList"><div class="loading">Загрузка…</div></div>'+
        '</div>'+
      '</span>')+
    '<button class="icon-btn" id="themeBtn" title="Тема"></button>'+
    '<button class="icon-btn" id="logoutBtn" title="Выйти">'+icon('logout')+'</button>';
  document.getElementById('themeBtn').onclick = toggleTheme;
  document.getElementById('logoutBtn').onclick = logout;
  applyTheme(localStorage.getItem('crm_theme') || 'dark');
  if(o.bell !== false) initBell();
}

/* ============================================================
   УВЕДОМЛЕНИЯ — свои, из crm.notifications
   ============================================================ */
let NOTIFS = [];

async function loadNotifications(){
  const { data, error } = await sb.from('notifications')
    .select('id, kind, title, body, read_at, task_id, created_at')
    .order('created_at', { ascending:false }).limit(10);
  if(error){ console.error('notifications', error); return []; }
  NOTIFS = data || [];
  return NOTIFS;
}
function unreadCount(){ return NOTIFS.filter(n => !n.read_at).length; }

/* База пишет заголовок как «Задача: review» — показываем статус по-русски */
function notifTitle(n){
  const m = /^Задача:\s*(\w+)$/.exec(n.title || '');
  if(m && STATUS_RU[m[1]]) return 'Задача: ' + STATUS_RU[m[1]].toLowerCase();
  return n.title;
}

function paintBellCount(){
  const btn = document.getElementById('bellBtn');
  if(!btn) return;
  const n = unreadCount();
  btn.innerHTML = icon('bell') + (n ? '<span class="dot">'+(n > 99 ? '99+' : n)+'</span>' : '');
}
function paintBellList(){
  const box = document.getElementById('bellList');
  if(!box) return;
  if(!NOTIFS.length){ box.innerHTML = '<div class="empty">Уведомлений нет</div>'; return; }
  box.innerHTML = NOTIFS.map(n =>
    '<button class="nrow'+(n.read_at ? '' : ' unread')+'" data-id="'+n.id+'"'+
    (n.task_id ? ' data-task="'+n.task_id+'"' : '')+'>'+
      '<div class="n-t">'+esc(notifTitle(n))+'</div>'+
      (n.body ? '<div class="n-b">'+esc(n.body)+'</div>' : '')+
      '<div class="n-d">'+esc(fmtWhen(n.created_at))+'</div>'+
    '</button>').join('');
  box.querySelectorAll('.nrow').forEach(el => {
    el.onclick = async () => {
      const id = Number(el.dataset.id), task = el.dataset.task;
      await markRead([id]);
      if(task){
        if(typeof openTask === 'function'){ closeBell(); openTask(Number(task)); }
        else location.href = 'tasks.html?task='+encodeURIComponent(task);
      }
    };
  });
}
async function markRead(ids){
  const now = new Date().toISOString();
  const { error } = await sb.from('notifications').update({ read_at: now }).in('id', ids);
  if(error){ console.error('markRead', error); return; }
  NOTIFS.forEach(n => { if(ids.includes(n.id) && !n.read_at) n.read_at = now; });
  paintBellCount(); paintBellList();
}
function closeBell(){
  const pop = document.getElementById('bellPop');
  if(pop) pop.hidden = true;
}
async function initBell(){
  const btn = document.getElementById('bellBtn'), pop = document.getElementById('bellPop');
  if(!btn) return;
  btn.onclick = e => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    if(!pop.hidden) paintBellList();
  };
  pop.onclick = e => e.stopPropagation();
  document.addEventListener('click', closeBell);
  document.getElementById('bellReadAll').onclick = async () => {
    const ids = NOTIFS.filter(n => !n.read_at).map(n => n.id);
    if(ids.length) await markRead(ids);
  };
  await loadNotifications();
  paintBellCount();
  // обновляем счётчик, пока страница открыта
  setInterval(async () => { await loadNotifications(); paintBellCount(); }, 60000);
}

/* ============================================================
   УСТАНОВКА НА ТЕЛЕФОН (PWA)
   Сервис-воркер работает по https и на localhost.
   В Safari на iPhone beforeinstallprompt не приходит — там подсказка текстом.
   ============================================================ */
if('serviceWorker' in navigator){
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('sw', e)));
}

let installPrompt = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  showInstallBtn();
});
addEventListener('appinstalled', () => { installPrompt = null; hideInstallBtn(); });

function showInstallBtn(){
  const b = document.getElementById('installBtn');
  if(b && installPrompt) b.hidden = false;
}
function hideInstallBtn(){
  const b = document.getElementById('installBtn');
  if(b) b.hidden = true;
}
async function doInstall(){
  if(!installPrompt) return;
  installPrompt.prompt();
  try{ await installPrompt.userChoice; }catch(e){}
  installPrompt = null;
  hideInstallBtn();
}
function isIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone(){
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
