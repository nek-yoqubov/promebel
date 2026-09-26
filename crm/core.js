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

/* --- продажи --- */
const CLIENT_KIND_RU = { client:'Клиент', master:'Мастер', dealer:'Дилер', company:'Компания', designer:'Дизайнер' };
const CLIENT_KIND_ORDER = ['client','master','dealer','company','designer'];
const CLIENT_SOURCES = ['Шоурум','Звонок','Instagram','Рекомендация','Мастер привёл','Другое'];
const DEAL_STAGE_RU = {
  new:'Новая', consult:'Консультация', measure:'Замер', proposal:'Расчёт отправлен',
  waiting:'Думает', won:'Продано', lost:'Отказ'
};
const DEAL_OPEN_STAGES = ['new','consult','measure','proposal','waiting'];
const LOST_REASONS = ['Дорого','Ушёл к конкуренту','Нет в наличии','Передумал','Не дозвонились','Другое'];
const ACTIVITY_KIND_RU = { call:'Звонок', meeting:'Встреча', visit:'Визит', message:'Сообщение', other:'Другое' };
const ACTIVITY_ICON = { call:'phone', meeting:'users', visit:'building', message:'message', other:'list' };

/* --- события --- */
const EVENT_KIND_RU = {
  visit:'Визит', presentation:'Презентация', masterclass:'Мастер-класс',
  promo:'Акция', meeting:'Встреча', training:'Обучение', other:'Другое'
};
const EVENT_STATUS_RU = {
  planned:'Запланировано', prep:'Подготовка', live:'Идёт', done:'Проведено', canceled:'Отменено'
};
const EVENT_BRANDS = ['EGGER','ULTRADECOR','Blum','GTV','Starax'];

/* --- колл-центр --- */
const CALLBACK_STATUS_RU = { pending:'Ждёт звонка', done:'Дозвонились', no_answer:'Не ответил', skipped:'Пропущен' };
const SERVICE_STATUS_RU = {
  new:'Новая', accepted:'Принята', in_work:'В работе', ready:'Готово', done:'Выдано', canceled:'Отменена'
};
const FEEDBACK_CAT_RU = {
  quality:'Качество', timing:'Сроки', service:'Обслуживание',
  product:'Товар', price:'Цена', other:'Другое'
};
const FEEDBACK_DEPT_RU = {
  production:'Производство', sales:'Продажи', warehouse:'Склад',
  delivery:'Доставка', management:'Руководство', other:'Другое'
};
const FEEDBACK_STATUS_RU = { new:'Новое', forwarded:'Передано', resolved:'Решено' };

/* --- подбор --- */
const VACANCY_STAGE_RU = {
  request:'Заявка', published:'Публикация', screening:'Отбор резюме', interviews:'Собеседования',
  offer:'Оффер', onboarding:'Оформление', probation:'Испытательный срок',
  closed:'Закрыта', canceled:'Отменена'
};
const VACANCY_OPEN_STAGES = ['request','published','screening','interviews','offer','onboarding','probation'];
const CANDIDATE_STAGE_RU = {
  new:'Новый', screening:'Рассмотрение', interview:'Собеседование',
  offer:'Оффер', hired:'Принят', rejected:'Отказ'
};
const ADAPT_RESULT_RU = { passed:'Прошёл', extended:'Продлить', failed:'Не прошёл' };

/* --- журнал действий --- */
const AUDIT_TABLE_RU = {
  tasks:'Задачи', task_templates:'Повторяющиеся задачи', employees:'Сотрудники',
  employee_hr:'Кадровые данные', employee_docs:'Документы', employee_skills:'Компетенции',
  employee_review:'Оценка', clients:'Клиенты', deals:'Сделки', activities:'План',
  events:'События', event_checks:'Проверки акций', vacancies:'Вакансии', candidates:'Кандидаты',
  adaptations:'Адаптация', service_orders:'Заявки', callbacks:'Обзвон', feedback:'Замечания',
  links:'Ссылки', branches:'Филиалы', regions:'Регионы'
};
function optionsFrom(dict, sel){
  return Object.keys(dict).map(k =>
    '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(dict[k]) + '</option>').join('');
}

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
  const cur = currency || 'TJS';
  // разделитель тысяч — пробел, а не неразрывный
  const num = n.toLocaleString('ru-RU', { maximumFractionDigits:2 }).replace(/\u00a0/g, ' ');
  return num + ' ' + (CURRENCY_RU[cur] || cur);
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
  deal:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/></svg>',
  phone:'<svg class="i" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  chart:'<svg class="i" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l3.5-4 3 3L20 7"/></svg>',
  star:'<svg class="i" viewBox="0 0 24 24"><path d="M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z"/></svg>',
  clip:'<svg class="i" viewBox="0 0 24 24"><path d="M21 11.5 12.2 20a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 1 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 1 1-2.6-2.6L15 6.6"/></svg>',
  repeat:'<svg class="i sm" viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  camera:'<svg class="i" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  image:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-5-5L5 21"/></svg>',
  table:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>',
  printer:'<svg class="i" viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  down:'<svg class="i sm" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
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
/* ============================================================
   РАЗДЕЛЫ И ВИДИМОСТЬ
   Права держит RLS. Здесь мы только прячем то, что роли не нужно.
   ============================================================ */
const GROUPS = [
  { key:'work',    label:'Работа' },
  { key:'sales',   label:'Продажи' },
  { key:'company', label:'Компания' },
  { key:'control', label:'Контроль' }
];
const SECTIONS = [
  { key:'home',    group:'work',    label:'Сегодня',        href:'index.html',            icon:'calendar' },
  { key:'tasks',   group:'work',    label:'Задачи',         href:'tasks.html?tab=mine',   icon:'list' },
  { key:'author',  group:'work',    label:'Поставленные',   href:'tasks.html?tab=author', icon:'target' },
  { key:'cal',     group:'work',    label:'Календарь',      href:'calendar.html',         icon:'calendar' },
  { key:'plan',    group:'work',    label:'Мой план',       href:'plan.html',             icon:'checkCircle',
    roles:['sales','head','regional','brand','admin','director','auditor'] },
  { key:'clients', group:'sales',   label:'Клиенты',        href:'clients.html',          icon:'users',
    notRoles:['production','cashier'] },
  { key:'events',  group:'company', label:'События и акции',href:'events.html',           icon:'star',
    soon:true },
  { key:'cc',      group:'company', label:'Колл-центр',     href:'callcenter.html',       icon:'phone',
    roles:['callcenter','head','admin','director','auditor'], soon:true },
  { key:'hr',      group:'company', label:'Подбор и адаптация', href:'hr.html',           icon:'idcard',
    roles:['hr','admin','director'], orBoss:true, soon:true },
  { key:'admin',   group:'company', label:'Сотрудники',     href:'admin.html',            icon:'users',
    roles:['admin','director','hr'] },
  { key:'links',   group:'company', label:'Ссылки и планы', href:'links.html',            icon:'link' },
  { key:'dash',    group:'control', label:'Панель руководителя', href:'dashboard.html',   icon:'chart',
    roles:['admin','director','auditor','head','regional'], orBoss:true },
  { key:'audit',   group:'control', label:'Журнал действий',href:'audit.html',            icon:'history',
    roles:['admin','director'], soon:true }
];
/* есть ли у меня подчинённые */
function hasTeam(){ return !!(ME && EMPS.some(e => e.manager_id === ME.id)); }
function canSee(s){
  if(!ME) return false;
  if(s.notRoles && s.notRoles.includes(ME.role)) return false;
  if(s.roles && !s.roles.includes(ME.role)) return s.orBoss ? hasTeam() : false;
  return true;
}
function visibleSections(){ return SECTIONS.filter(canSee); }
function isAuditor(){ return ME && ME.role === 'auditor'; }   // ревизор всё видит, но ничего не меняет

/* Нижняя панель: пять пунктов. У колл-центра «Задачи» становится «Обзвон».
   Ревизор ничего не меняет — круглой кнопки «Новая задача» у него нет, пунктов четыре. */
function tabItems(){
  const cc = SECTIONS.find(s => s.key === 'cc');
  const first = (ME && ME.role === 'callcenter' && cc && !cc.soon)
    ? { key:'cc', label:'Обзвон', href:'callcenter.html', icon:'phone' }
    : { key:'tasks', label:'Задачи', href:'tasks.html?tab=mine', icon:'list' };
  const items = [
    { key:'home', label:'Сегодня', href:'index.html', icon:'calendar' },
    first
  ];
  if(!isAuditor()) items.push({ key:'add', label:'Новая задача', href:'new-task.html', icon:'plus', fab:true });
  items.push(
    { key:'notif', label:'Уведомления', href:'notifications.html', icon:'bell', bell:true },
    { key:'profile', label:'Профиль', href:'profile.html', icon:'user' }
  );
  return items;
}

/* ============================================================
   КАРКАС НАВИГАЦИИ
   Телефон: шапка 56px + нижние вкладки. ПК: боковая панель с группами.
   ============================================================ */
async function renderShell(opts){
  const o = opts || {};
  const tab = o.tab || '';
  await loadEmployees();   // нужен, чтобы понять, есть ли подчинённые

  const tabs = tabItems();
  const tabbar = tabs.map(n => {
    const on = n.key === tab || (n.key === 'tasks' && tab === 'author');
    if(n.fab){
      return '<a class="tb fab" href="' + n.href + '" aria-label="' + esc(n.label) + '">' + icon(n.icon) + '</a>';
    }
    return '<a class="tb' + (on ? ' on' : '') + '" href="' + n.href + '">' +
      '<span class="ic">' + icon(n.icon) + (n.bell ? '<span class="cnt" data-unread hidden></span>' : '') + '</span>' +
      '<span class="lb">' + esc(n.label) + '</span></a>';
  }).join('');

  const item = n => n.soon
    ? '<span class="sd soon">' + icon(n.icon) + '<span>' + esc(n.label) + '</span>' +
      '<span class="tag">скоро</span></span>'
    : '<a class="sd' + (n.key === tab ? ' on' : '') + '" href="' + n.href + '">' +
      icon(n.icon) + '<span>' + esc(n.label) + '</span>' +
      (n.bell ? '<span class="cnt" data-unread hidden></span>' : '') + '</a>';

  const vis = visibleSections();
  const sideNav =
    item({ key:'notif', label:'Уведомления', href:'notifications.html', icon:'bell', bell:true }) +
    GROUPS.map(g => {
      const rows = vis.filter(s => s.group === g.key);
      if(!rows.length) return '';                       // пустые группы не показываем
      return '<div class="sgt">' + esc(g.label) + '</div>' + rows.map(item).join('');
    }).join('');

  const shell =
    '<header class="tbar">' +
      (o.back
        ? '<button class="ib" id="shellBack" aria-label="Назад">' + icon('arrowLeft') + '</button>'
        : '<a class="ib logo" href="index.html" aria-label="На главную">' + logoMark(26) + '</a>') +
      '<h1 class="tt">' + esc(o.title || '') + '</h1>' +
      '<div class="ta">' + (o.actions || '') +
        '<button class="ib" id="gsOpen" aria-label="Поиск">' + icon('search') + '</button>' +
        '<a class="ib" href="notifications.html" aria-label="Уведомления">' + icon('bell') +
          '<span class="cnt" data-unread hidden></span></a>' +
      '</div>' +
    '</header>' +
    '<aside class="side">' +
      '<a class="slogo" href="index.html"><img src="logo-h-dark.png" ' +
        'data-dark="logo-h-dark.png" data-light="logo-h-light.png" alt="PRO MEBEL"></a>' +
      '<button class="sgs" id="gsOpenPc">' + icon('search') + '<span>Поиск</span></button>' +
      // на ПК круглой кнопки нижней панели нет — ставим обычную. Ревизор ничего не создаёт.
      (isAuditor() ? '' :
        '<a class="sadd" href="new-task.html">' + icon('plus') + '<span>Новая задача</span></a>') +
      '<nav class="snav">' + sideNav + '</nav>' +
      '<a class="sme" href="profile.html">' +
        '<span class="ava">' + esc(ME ? initials(ME.full_name) : '') + '</span>' +
        '<span class="smi"><b>' + esc(ME ? ME.full_name : '') + '</b>' +
        '<i>' + esc(ME ? (ROLE_RU[ME.role] || ME.role) : '') + '</i></span></a>' +
    '</aside>' +
    '<nav class="tabbar' + (tabs.length === 4 ? ' four' : '') + '">' + tabbar + '</nav>';

  document.body.insertAdjacentHTML('afterbegin', shell);
  document.body.classList.add('shell');
  if(o.back){
    document.getElementById('shellBack').onclick = () => {
      if(typeof o.back === 'function') o.back();
      else if(history.length > 1) history.back();
      else location.href = String(o.back);
    };
  }
  document.getElementById('gsOpen').onclick = openSearch;
  document.getElementById('gsOpenPc').onclick = openSearch;
  applyTheme(localStorage.getItem('crm_theme') || 'dark');
  refreshUnread();
}

/* ============================================================
   ГЛОБАЛЬНЫЙ ПОИСК — RPC crm.search(q)
   ============================================================ */
const SEARCH_KIND_RU = {
  task:'Задачи', client:'Клиенты', deal:'Сделки',
  event:'События', vacancy:'Вакансии', employee:'Сотрудники'
};
function openSearch(){
  if(document.getElementById('gsearch')) return;
  const el = document.createElement('div');
  el.className = 'gsearch';
  el.id = 'gsearch';
  el.innerHTML =
    '<div class="gs-head">' +
      '<button class="ib" id="gsClose" aria-label="Закрыть">' + icon('arrowLeft') + '</button>' +
      '<input id="gsInput" type="search" placeholder="Задача, клиент, сделка, событие…" autocomplete="off">' +
    '</div>' +
    '<div class="gs-body" id="gsBody"><div class="empty">Введите хотя бы два символа</div></div>';
  document.body.appendChild(el);

  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if(e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  document.getElementById('gsClose').onclick = close;

  let timer = null;
  const input = document.getElementById('gsInput');
  input.focus();
  input.oninput = () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if(q.length < 2){
      document.getElementById('gsBody').innerHTML = '<div class="empty">Введите хотя бы два символа</div>';
      return;
    }
    timer = setTimeout(() => runSearch(q), 300);
  };
}
async function runSearch(q){
  const box = document.getElementById('gsBody');
  if(!box) return;
  box.innerHTML = '<div class="loading">Ищем…</div>';
  const { data, error } = await sb.schema('crm').rpc('search', { q });
  if(!document.getElementById('gsBody')) return;
  if(error){ box.innerHTML = '<div class="empty">' + esc(errText(error)) + '</div>'; return; }
  const rows = data || [];
  if(!rows.length){ box.innerHTML = '<div class="empty">Ничего не нашлось</div>'; return; }

  let html = '';
  Object.keys(SEARCH_KIND_RU).forEach(k => {
    const part = rows.filter(r => r.kind === k);
    if(!part.length) return;
    html += '<div class="sec">' + esc(SEARCH_KIND_RU[k]) + '</div><div class="rows">' +
      part.map(r =>
        '<button class="row" data-link="' + esc(r.link) + '">' +
          '<span class="rb"><span class="l1"><span class="t">' + esc(r.title) + '</span></span>' +
          (r.sub ? '<span class="l2">' + esc(r.sub) + '</span>' : '') + '</span></button>').join('') +
      '</div>';
  });
  box.innerHTML = html;
  box.querySelectorAll('[data-link]').forEach(b =>
    b.onclick = () => location.href = b.dataset.link);
}

/* ============================================================
   УВЕДОМЛЕНИЯ И ЦИФРА НА ИКОНКЕ
   ============================================================ */
let NOTIFS = [];

async function loadNotifications(limit){
  const { data, error } = await sb.from('notifications')
    .select('id, kind, title, body, read_at, task_id, link, created_at')
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
  const clip = Number(t.files_count) > 0
    ? '<span class="clipn">' + icon('clip') + Number(t.files_count) + '</span>' : '';
  const rep = t.template_id ? '<span class="pri" style="color:var(--muted)">' + icon('repeat') + '</span>' : '';
  const rpt = t.report_required ? '<span class="pri">' + icon('camera') + '</span>' : '';
  const l2 = [esc(who), subs, clip].filter(Boolean).join(' · ');

  return '<button class="row' + (done ? ' muted' : '') + (o.active ? ' on' : '') + '" data-task="' + t.id + '">' +
    statusDot(t) +
    '<span class="rb">' +
      '<span class="l1"><span class="t">' + esc(t.title) + '</span>' + rep + rpt + pri +
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
  'due_at,done_criteria,created_at,archived_at,completed_at,is_overdue,assignee_name,assignee_role,' +
  'author_name,branch_name,subtasks_total,subtasks_done,report_required,template_id,event_id,files_count';

/* ============================================================
   ДЕНЬГИ, ЭКСПОРТ, ПЕЧАТЬ
   ============================================================ */
const CURRENCY_RU = { TJS:'сом', USD:'$', EUR:'€', RUB:'руб.', UZS:'сум' };
function som(v){ return fmtMoney(v, 'TJS'); }

/* Уведомление может вести не только на задачу */
function notifLink(n){
  if(n.link) return n.link;
  if(n.task_id) return 'tasks.html?task=' + n.task_id;
  return null;
}

/* Excel: выгружаем то, что сейчас на экране. xlsx.full.min.js подключается на странице. */
function exportXlsx(rows, sheetName, fileName){
  if(typeof XLSX === 'undefined'){ toast('Библиотека выгрузки не загрузилась'); return; }
  if(!rows || !rows.length){ toast('Нечего выгружать'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheetName || 'Лист').slice(0, 30));
  XLSX.writeFile(wb, fileName || 'export.xlsx');
}

/* Печать: шапка с логотипом и названием отчёта, всё лишнее скрывает @media print */
function printReport(title, period){
  let head = document.getElementById('printHead');
  if(!head){
    head = document.createElement('div');
    head.id = 'printHead';
    head.className = 'print-head';
    document.body.appendChild(head);
  }
  head.innerHTML =
    '<div class="ph-logo"><img src="logo-h-light.png" alt="PRO MEBEL"></div>' +
    '<div class="ph-t">' + esc(title || '') + '</div>' +
    '<div class="ph-p">' + esc(period || '') + '</div>';
  window.print();
}

/* Период для отчётов: понедельник текущей недели и т.д. */
function weekStart(d){
  const x = new Date(d || new Date());
  const wd = (x.getDay() + 6) % 7;          // 0 = понедельник
  x.setDate(x.getDate() - wd);
  x.setHours(0, 0, 0, 0);
  return x;
}
function monthStart(d){
  const x = new Date(d || new Date());
  x.setDate(1); x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function endOfDay(d){ const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function ymd(d){ return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
function fmtPeriod(from, to){ return fmtDate(from.toISOString()) + ' — ' + fmtDate(to.toISOString()); }

/* ============================================================
   ДАТЫ ПО ДУШАНБЕ
   1С закрывает день по местному времени. Если считать «сегодня» по
   часам устройства, продавец в поездке увидит чужой день, поэтому
   границы дня, недели и месяца для 1С берём в зоне Душанбе.
   Дни тут — строки 'ГГГГ-ММ-ДД': ровно то, что ждут параметры date.
   ============================================================ */
const TZ_DUSHANBE = 'Asia/Dushanbe';
const TZ_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ_DUSHANBE, year:'numeric', month:'2-digit', day:'2-digit'
});
function tzYmd(d){
  const p = {};
  TZ_PARTS.formatToParts(d || new Date()).forEach(x => p[x.type] = x.value);
  return p.year + '-' + p.month + '-' + p.day;
}
/* сдвиг дня-строки: считаем в UTC, чтобы летнее время нигде не вмешалось */
function tzShift(day, n){
  const x = new Date(day + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
function tzWeekStart(day){                     // понедельник той же недели
  const base = day || tzYmd();
  const wd = (new Date(base + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return tzShift(base, -wd);
}
function tzMonthStart(day){ return (day || tzYmd()).slice(0, 8) + '01'; }

/* Часы и минуты по Душанбе — «Мой план» показывает время дня, к которому
   пункт привязан, а не время на устройстве смотрящего. */
const TZ_CLOCK = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TZ_DUSHANBE, hour:'2-digit', minute:'2-digit', hour12:false
});
function tzTime(iso){ return iso ? TZ_CLOCK.format(new Date(iso)) : ''; }

/* Настенное время зоны, прочитанное как UTC-отметка — нужно для tzAt(). */
const TZ_WALL = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ_DUSHANBE, hour12:false,
  year:'numeric', month:'2-digit', day:'2-digit',
  hour:'2-digit', minute:'2-digit', second:'2-digit'
});
function tzWallMs(d){
  const p = {};
  TZ_WALL.formatToParts(d).forEach(x => p[x.type] = x.value);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
}
/* Момент, который в Душанбе выглядит как day + чч:мм.
   Смещение не зашиваем: берём наивную точку и правим её на то,
   насколько зона разошлась с UTC в этот момент. */
function tzAt(day, h, m){
  const p = String(day).split('-');
  const naive = Date.UTC(+p[0], +p[1] - 1, +p[2], h || 0, m || 0);
  return new Date(naive - (tzWallMs(new Date(naive)) - naive)).toISOString();
}
/* Часы и минуты по Душанбе числами — чтобы перенести пункт, сохранив время */
function tzHM(iso){
  const w = new Date(tzWallMs(new Date(iso)));
  return { h: w.getUTCHours(), m: w.getUTCMinutes() };
}

/* «сегодня 14:20» / «3 дня назад» / «—» */
function agoText(iso){
  if(!iso) return '—';
  const d = new Date(iso), dd = dayDiff(d, new Date());
  if(dd === 0) return 'сегодня ' + fmtTime(iso);
  if(dd === -1) return 'вчера ' + fmtTime(iso);
  const n = Math.abs(dd);
  return n + ' ' + plural(n, 'день', 'дня', 'дней') + ' назад';
}

/* ============================================================
   ФАЙЛЫ ЗАДАЧ — приватный bucket crm-files
   Путь: tasks/<id>/<uuid>-<имя>. Фото сжимаем на телефоне.
   ============================================================ */
const FILE_MAX = 20 * 1024 * 1024;
const FILE_TYPES = [
  'image/jpeg','image/png','image/webp','image/heic','application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/msword','text/plain'
];
function isImageFile(nameOrType){
  return /\.(jpe?g|png|webp|heic)$/i.test(nameOrType) || /^image\//i.test(nameOrType);
}
/* Фото ужимаем до 1600px по длинной стороне. HEIC отдаём как есть — canvas его не читает. */
async function shrinkImage(file){
  if(!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  try{
    const bmp = await createImageBitmap(file);
    const max = 1600;
    if(bmp.width <= max && bmp.height <= max && file.size < 1.5 * 1024 * 1024) return file;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
    if(!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.(png|webp|jpeg)$/i, '.jpg'), { type:'image/jpeg' });
  }catch(e){ return file; }
}
function uuid(){
  return (crypto.randomUUID && crypto.randomUUID()) ||
    ('f' + Date.now().toString(16) + Math.floor(Math.random() * 1e9).toString(16));
}
async function uploadTaskFile(taskId, file){
  if(file.size > FILE_MAX) return { error:'Файл больше 20 МБ' };
  const small = await shrinkImage(file);
  if(FILE_TYPES.indexOf(small.type) === -1 && !isImageFile(small.name))
    return { error:'Такой тип файла нельзя' };

  const path = 'tasks/' + taskId + '/' + uuid() + '-' + safeFileName(small.name);
  const up = await sb.storage.from('crm-files').upload(path, small, { contentType: small.type });
  if(up.error) return { error: errText(up.error) };

  const { error } = await sb.from('task_files').insert({
    task_id: taskId, author_id: ME.id, file_path: path,
    file_name: file.name, size_bytes: small.size
  });
  if(error){
    await sb.storage.from('crm-files').remove([path]);   // строка не записалась — файл не оставляем
    return { error: errText(error, 'insert') };
  }
  return { ok:true };
}
async function fileUrl(path){
  const { data, error } = await sb.storage.from('crm-files').createSignedUrl(path, 60);
  return error ? null : data.signedUrl;
}
async function removeTaskFile(f){
  const rm = await sb.storage.from('crm-files').remove([f.file_path]);
  if(rm.error) return { error: errText(rm.error) };
  const { error } = await sb.from('task_files').delete().eq('id', f.id);
  return error ? { error: errText(error) } : { ok:true };
}
function canDeleteFile(f){ return !!(ME && (f.author_id === ME.id || isBossRole())); }

/* Картинка на весь экран */
function openImage(url){
  const el = document.createElement('div');
  el.className = 'viewer';
  el.innerHTML = '<button class="ib" aria-label="Закрыть">' + icon('x') + '</button>' +
    '<img src="' + esc(url) + '" alt="">';
  el.onclick = () => el.remove();
  document.body.appendChild(el);
}

/* ============================================================
   ПОВТОРЯЮЩИЕСЯ ЗАДАЧИ — текст правила для списка
   ============================================================ */
const WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
function templateRule(t){
  const at = String(t.create_time || '08:00').slice(0, 5);
  const due = t.due_days ? ('через ' + t.due_days + ' ' + plural(t.due_days, 'день', 'дня', 'дней'))
                         : 'в тот же день';
  const till = String(t.due_time || '18:00').slice(0, 5);
  let when = '';
  if(t.freq === 'daily') when = 'каждый день';
  else if(t.freq === 'monthly') when = 'каждое ' + t.month_day + ' число';
  else {
    const d = (t.weekdays || []).map(n => WEEKDAYS[n - 1]).filter(Boolean);
    when = d.length === 7 ? 'каждый день' : 'по дням: ' + d.join(', ');
  }
  return when + ' в ' + at + ', срок ' + due + ' до ' + till;
}

/* ============================================================
   ЭТАП 2 — ОБЩЕЕ ДЛЯ КЛИЕНТОВ, СДЕЛОК И ПЛАНА
   ============================================================ */

/* Ревизор всё видит, но ничего не меняет. Кнопки создания и правки прячем. */
function canEdit(){ return !isAuditor(); }

/* Телефон: для ссылок оставляем только цифры и плюс */
function phoneDigits(p){ return String(p || '').replace(/[^\d]/g, ''); }
function telHref(p){ const d = String(p || '').replace(/[^\d+]/g, ''); return d ? 'tel:' + d : ''; }
function waHref(p){ const d = phoneDigits(p); return d ? 'https://wa.me/' + d : ''; }
function phoneHTML(p){
  if(!p) return '';
  return '<a class="phone" href="' + esc(telHref(p)) + '">' + esc(p) + '</a>';
}

/* «был контакт 12 дн. назад» — одинаково в списке клиентов и в спящих */
function contactAgo(iso){
  if(!iso) return 'контакта ещё не было';
  const n = Math.abs(dayDiff(new Date(iso), new Date()));
  if(n === 0) return 'контакт сегодня';
  if(n === 1) return 'контакт вчера';
  return 'был контакт ' + n + ' ' + plural(n, 'день', 'дня', 'дней') + ' назад';
}

/* Строка клиента — одна и та же в списке, в спящих и в выборе клиента */
function clientRowHTML(c, opts){
  const o = opts || {};
  const l2 = [
    CLIENT_KIND_RU[c.kind] || c.kind,
    c.phone || '',
    o.ownerName !== undefined ? o.ownerName : (c.owner_id ? empName(c.owner_id) : 'без владельца')
  ].filter(Boolean).join(' · ');
  const right = o.right || '';
  return '<button class="row' + (o.active ? ' on' : '') + '" data-client="' + c.id + '">' +
    '<span class="dot k-' + esc(c.kind) + '"></span>' +
    '<span class="rb">' +
      '<span class="l1"><span class="t">' + esc(c.full_name) + '</span>' +
        (right ? '<span class="when">' + esc(right) + '</span>' : '') + '</span>' +
      '<span class="l2">' + esc(l2) + '</span>' +
    '</span></button>';
}

/* Сделка без движения — база не считает, считаем здесь */
function staleDays(iso){
  if(!iso) return 0;
  return Math.abs(dayDiff(new Date(iso), new Date()));
}

/* ============================================================
   МОДАЛКА — общая для страниц этапа 2
   Разметку не держим на странице, собираем на лету.
   ============================================================ */
function modalOpen(o){
  modalClose();
  const el = document.createElement('div');
  // sheet: на телефоне выезжает снизу, на ПК остаётся обычной модалкой
  el.className = o.sheet ? 'modal sheet' : 'modal';
  el.id = 'crmModal';
  el.innerHTML =
    '<div class="modal-box"' + (o.wide ? ' style="max-width:720px"' : '') + '>' +
      '<div class="modal-head"><h2>' + esc(o.title || '') + '</h2>' +
        '<button class="ib" id="crmModalX" aria-label="Закрыть">' + icon('x') + '</button></div>' +
      '<div class="modal-body" id="crmModalBody">' + (o.bodyHTML || '') +
        (o.saveLabel
          ? '<div class="btn-row" style="margin-top:16px">' +
              '<button class="btn" id="crmSave" style="flex:1">' + esc(o.saveLabel) + '</button>' +
              '<button class="btn ghost" id="crmCancel">Отмена</button>' +
            '</div><div class="msg err" id="crmMsg"></div>'
          : '') +
      '</div>' +
    '</div>';
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  document.getElementById('crmModalX').onclick = modalClose;
  el.onclick = e => { if(e.target === el) modalClose(); };
  if(o.saveLabel){
    document.getElementById('crmCancel').onclick = modalClose;
    document.getElementById('crmSave').onclick = o.onSave;
  }
  return el;
}
function modalClose(){
  const el = document.getElementById('crmModal');
  if(el) el.remove();
  document.body.style.overflow = '';
}
function modalBody(){ return document.getElementById('crmModalBody'); }
function modalMsg(t, ok){
  const m = document.getElementById('crmMsg');
  if(m){ m.className = 'msg ' + (ok ? 'ok' : 'err'); m.textContent = t || ''; }
}
function modalBusy(on, label){
  const b = document.getElementById('crmSave');
  if(b){ b.disabled = on; if(label) b.textContent = label; if(on) modalMsg(''); }
}
/* Короткое подтверждение вместо confirm() — он в PWA выглядит чужим */
function confirmBox(title, text, okLabel, onOk){
  modalOpen({
    title,
    bodyHTML: '<div class="text-block">' + esc(text) + '</div>',
    saveLabel: okLabel,
    onSave: () => { modalClose(); onOk(); }
  });
}

/* ============================================================
   ВЫБОР КЛИЕНТА — нужен в сделках, плане и колл-центре
   onPick получает {id, full_name, phone, kind}
   ============================================================ */
function pickClient(onPick, title){
  modalOpen({
    title: title || 'Выбрать клиента',
    bodyHTML:
      '<div class="f-search" style="margin-bottom:10px">' + icon('search') +
        '<input id="pcQ" type="search" placeholder="Имя или телефон" autocomplete="off"></div>' +
      '<div class="rows" id="pcList"><div class="hint">Введите имя или номер</div></div>'
  });
  const q = document.getElementById('pcQ'), list = document.getElementById('pcList');
  q.focus();
  let timer = null;
  q.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
  async function run(){
    const s = q.value.trim();
    if(s.length < 2){ list.innerHTML = '<div class="hint">Введите имя или номер</div>'; return; }
    list.innerHTML = '<div class="loading">Ищем…</div>';
    const { data, error } = await clientSearch(s, 30);
    if(error){ list.innerHTML = '<div class="empty">' + esc(errText(error)) + '</div>'; return; }
    if(!data.length){ list.innerHTML = '<div class="empty">Никого не нашли</div>'; return; }
    list.innerHTML = data.map(c => clientRowHTML(c)).join('');
    list.querySelectorAll('[data-client]').forEach(b => b.onclick = () => {
      const c = data.find(x => String(x.id) === b.dataset.client);
      modalClose();
      onPick(c);
    });
  }
}
/* Поиск клиента по имени и обоим телефонам. Запятые и скобки ломают or() — убираем. */
function clientSearch(s, limit){
  const safe = s.replace(/[,()\\]/g, ' ').replace(/[%_]/g, ' ').trim();
  if(!safe) return Promise.resolve({ data: [], error: null });
  const like = '%' + safe + '%';
  return sb.from('clients')
    .select('id,kind,full_name,phone,phone2,owner_id,city,company')
    .eq('is_active', true)
    .or('full_name.ilike.' + like + ',phone.ilike.' + like + ',phone2.ilike.' + like)
    .order('full_name')
    .limit(limit || 30);
}
