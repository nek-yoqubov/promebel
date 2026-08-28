/* ============================================================
   PRO MEBEL · Очередь распила — общее ядро
   Подключение к Supabase + расчёт очереди (параллельный конвейер).
   Подключается на каждой странице до остальных скриптов.
   ============================================================ */

const SB_URL  = "https://yqspwkngntoklyggnosi.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxc3B3a25nbnRva2x5Z2dub3NpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0ODU5NDksImV4cCI6MjA5NDA2MTk0OX0.5fwVP5dMQ7gErGIAssFwHJakHgTDSvP3esekuiFPucA";

// Клиент supabase-js, работает со схемой saw
const sb = supabase.createClient(SB_URL, SB_ANON, { db: { schema: 'saw' } });

/* ---------- Авторизация (простая, за saw.users) ---------- */
const Auth = {
  token(){ return localStorage.getItem('saw_token'); },
  role(){ return localStorage.getItem('saw_role') || 'user'; },
  user(){ return localStorage.getItem('saw_login') || ''; },
  require(roles){
    if(!this.token()){ location.href='login.html'; return false; }
    if(roles && !roles.includes(this.role())){ location.href='orders.html'; return false; }
    return true;
  },
  logout(){ localStorage.clear(); location.href='login.html'; }
};

/* ---------- Настройки/нормативы (кэш на страницу) ---------- */
let SETTINGS = null;
async function loadSettings(){
  if(SETTINGS) return SETTINGS;
  const { data, error } = await sb.from('settings').select('*').eq('id',1).single();
  if(error){ console.error('settings', error); }
  SETTINGS = data || { norms:{}, work_day:{} };
  return SETTINGS;
}

/* ============================================================
   РАБОЧЕЕ ВРЕМЯ
   Работаем в абсолютных минутах: day*1440 + минута_суток.
   ============================================================ */
function hm(str){ const [a,b]=String(str).split(':').map(Number); return a*60+b; }
function fmtHM(min){ const m=((min%1440)+1440)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(Math.round(m%60)).padStart(2,'0'); }

function workCfg(){
  const w = (SETTINGS&&SETTINGS.work_day)||{};
  return {
    dayStart:hm(w.day_start||'09:00'), dayEnd:hm(w.day_end||'22:00'),
    lunchStart:hm(w.lunch_start||'12:00'), lunchEnd:hm(w.lunch_end||'13:00')
  };
}
function snapToWork(abs){
  const c=workCfg(); let day=Math.floor(abs/1440), t=abs-day*1440;
  for(let g=0;g<12;g++){
    if(t<c.dayStart) t=c.dayStart;
    if(t>=c.lunchStart && t<c.lunchEnd) t=c.lunchEnd;
    if(t>=c.dayEnd){ day++; t=c.dayStart; continue; }
    break;
  }
  return day*1440+t;
}
function addWork(abs,mins){
  const c=workCfg(); let cur=snapToWork(abs), left=mins;
  while(left>1e-9){
    let day=Math.floor(cur/1440), t=cur-day*1440;
    let boundary = (t<c.lunchStart) ? c.lunchStart : c.dayEnd;
    let avail = boundary-t;
    if(avail<=0){ cur=snapToWork(cur); continue; }
    let use=Math.min(left,avail); cur+=use; left-=use;
    if(left>1e-9) cur=snapToWork(cur);
  }
  return cur;
}
// Абсолютная минута из реального времени (day 0 = сегодня 00:00 локально)
function nowAbs(){
  const d=new Date();
  return d.getHours()*60+d.getMinutes(); // день 0 = сегодня
}
// Человекочитаемо: "14:30 · сегодня/завтра/+N дн"
function fmtReady(abs){
  if(abs==null) return '—';
  const day=Math.floor(abs/1440);
  const names=['сегодня','завтра','послезавтра'];
  const lbl=names[day]||('+'+day+' дн');
  return fmtHM(abs)+' · '+lbl;
}

/* ============================================================
   РАСЧЁТ ОЧЕРЕДИ — параллельный конвейер
   orders: массив заказов из БД, каждый с полями:
     seq, is_urgent, manual_add_min, accepted_at,
     sheets:[{qty}], edges:[{meters,oval_pcs,by_client}],
     status_* , *_done_at
   Возвращает Map(order.id -> { stages:[{m,a,b,side}], ready })
   ============================================================ */
function computeQueue(orders){
  const N=(SETTINGS&&SETTINGS.norms)||{};
  const n=(k,d)=>Number(N[k]!=null?N[k]:d);
  const norm={
    saw:n('saw_per_sheet',5), edge:n('edge_per_100m',60), oval:n('edge_oval_per_pc',10),
    drill:n('drill_per_order',120),
    bSaw:n('buf_saw_change',2), bEdge:n('buf_edge_setup',5), deliver:n('deliver_minutes',60)
  };
  const c=workCfg();
  const dayStart=c.dayStart;
  // очередь считается от «сейчас» (а не всегда от начала смены).
  // snapToWork перенесёт на ближайший рабочий момент: если сейчас до 09:00 — на 09:00,
  // если после конца дня — на утро завтра, если обед — на 13:00.
  const nowWork=snapToWork(nowAbs());

  // порядок: экстренные вперёд, затем по seq
  const ord=[...orders].sort((a,b)=>{
    if(!!b.is_urgent - !!a.is_urgent) return (!!b.is_urgent)-(!!a.is_urgent);
    return (a.seq||0)-(b.seq||0);
  });

  let free={saw:nowWork, edge:nowWork, drill:nowWork};
  const out=new Map();

  for(const o of ord){
    // суммарно по составу заказа
    const sheets=(o.sheets||[]).reduce((s,x)=>s+(x.qty||0),0);
    const edges=(o.edges||[]);
    const edgeM=edges.reduce((s,x)=>s+Number(x.meters||0),0);
    const ovalPc=edges.reduce((s,x)=>s+Number(x.oval_pcs||0),0);
    const byClient=edges.length>0 && edges.every(x=>x.by_client);
    const hasEdge=edgeM>0||ovalPc>0;
    const hasDrill=!!o.has_drill;

    // приёмка: если нажата кнопка «принял» — от неё; иначе плановая доставка от «сейчас»
    let readyAt;
    if(o.accepted_at){
      const d=new Date(o.accepted_at);
      const dayDiff=Math.floor((d - startOfToday())/86400000);
      readyAt=snapToWork(dayDiff*1440 + d.getHours()*60+d.getMinutes());
    }else{
      readyAt=addWork(nowWork, norm.deliver);
    }

    const stages=[];
    // РАСПИЛ
    let sS=snapToWork(Math.max(free.saw, readyAt));
    let sE=addWork(sS, sheets*norm.saw + (o.manual_add_min||0));
    free.saw=addWork(sE, norm.bSaw);
    stages.push({m:'s',a:sS,b:sE});
    let handoff=sE;

    // КРОМКА
    if(hasEdge){
      if(byClient){
        stages.push({m:'e',side:true,after:handoff});
      }else{
        let eS=snapToWork(Math.max(free.edge, handoff));
        let eE=addWork(eS, (edgeM/100)*norm.edge + ovalPc*norm.oval);
        free.edge=addWork(eE, norm.bEdge);
        stages.push({m:'e',a:eS,b:eE});
        handoff=eE;
      }
    }
    // ПРИСАДКА
    if(hasDrill){
      let dS=snapToWork(Math.max(free.drill, handoff));
      let dE=addWork(dS, norm.drill);
      free.drill=dE;
      stages.push({m:'d',a:dS,b:dE});
      handoff=dE;
    }
    out.set(o.id, { stages, ready: byClient?null:handoff });
  }
  return out;
}
function startOfToday(){ const d=new Date(); d.setHours(0,0,0,0); return d; }

/* ---------- Загрузка заказов с составом ---------- */
async function fetchOrders(){
  const { data:orders, error } = await sb
    .from('queue_orders')
    .select('*, sheets:queue_sheets(*), edges:queue_edges(*), invoices:queue_invoices(*)')
    .order('seq', { ascending:true });
  if(error){ console.error(error); return []; }
  return orders||[];
}

/* ============================================================
   ИКОНКИ (inline SVG, feather-стиль) + тема
   ============================================================ */
const ICONS={
  check:'<svg class="i" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  saw:'<svg class="i" viewBox="0 0 24 24"><path d="M3 9h18M3 9l2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-3"/><rect x="3" y="12" width="18" height="8" rx="1"/></svg>',
  edge:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="1"/><path d="M3 10h18"/></svg>',
  drill:'<svg class="i" viewBox="0 0 24 24"><path d="M4 7h9v5H4z"/><path d="M13 8h4l3 2-3 2h-4"/><path d="M8 12v6"/></svg>',
  box:'<svg class="i" viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  truck:'<svg class="i" viewBox="0 0 24 24"><rect x="1" y="6" width="13" height="10" rx="1"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
  clock:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  bolt:'<svg class="i fill" viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
  phone:'<svg class="i" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  plus:'<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  trash:'<svg class="i sm" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  x:'<svg class="i sm" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  chevron:'<svg class="i sm" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
  info:'<svg class="i sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  sun:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>',
  moon:'<svg class="i" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  board:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  logout:'<svg class="i" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  users:'<svg class="i" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/></svg>',
  settings:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>',
  list:'<svg class="i" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  bell:'<svg class="i" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  bellOn:'<svg class="i" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/><circle cx="18" cy="5" r="3" fill="currentColor" stroke="none"/></svg>'
};
function icon(name){ return ICONS[name]||''; }

/* тема: сохраняется в localStorage */
function applyTheme(t){
  document.body.classList.toggle('light', t==='light');
  localStorage.setItem('saw_theme', t);
  const btn=document.getElementById('themeBtn');
  if(btn) btn.innerHTML = t==='light'?icon('moon'):icon('sun');
  document.querySelectorAll('.logo').forEach(img=>{
    if(img.dataset.dark) img.src = t==='light' ? img.dataset.light : img.dataset.dark;
  });
}
function toggleTheme(){ applyTheme(document.body.classList.contains('light')?'dark':'light'); }
function initTheme(){ applyTheme(localStorage.getItem('saw_theme')||'dark'); }

/* ============================================================
   УВЕДОМЛЕНИЯ (Web Notifications + звук)
   Шлём когда: заказ просрочен (не принят за час) или этап
   пора начинать (план наступил, галочки нет). Чтобы не спамить —
   помним что уже отправляли (в sessionStorage на заказ+тип).
   ============================================================ */
const Notify = {
  async ask(){
    if(!('Notification' in window)) return false;
    if(Notification.permission==='granted') return true;
    if(Notification.permission!=='denied'){
      const p=await Notification.requestPermission();
      return p==='granted';
    }
    return false;
  },
  _sent(key){
    const s=JSON.parse(sessionStorage.getItem('saw_notif')||'{}');
    return !!s[key];
  },
  _mark(key){
    const s=JSON.parse(sessionStorage.getItem('saw_notif')||'{}');
    s[key]=Date.now(); sessionStorage.setItem('saw_notif', JSON.stringify(s));
  },
  push(title, body, key){
    if(this._sent(key)) return;
    this._mark(key);
    beep();
    if(('Notification' in window) && Notification.permission==='granted'){
      const n=new Notification(title, { body, icon:'logo-light.png', tag:key, requireInteraction:true });
      n.onclick=()=>{ window.focus(); n.close(); };
    }
  },
  // сброс отметки, когда проблема ушла (заказ принят/этап сделан) — чтобы при рецидиве уведомить снова
  clear(key){
    const s=JSON.parse(sessionStorage.getItem('saw_notif')||'{}');
    if(s[key]){ delete s[key]; sessionStorage.setItem('saw_notif', JSON.stringify(s)); }
  },
  // активные (несброшенные) ключи — для плашки-счётчика
  _activeKeys(){ return Object.keys(JSON.parse(sessionStorage.getItem('saw_notif')||'{}')); },
  count(){ return this._activeKeys().length; }
};
// короткий сигнал через WebAudio (без файла)
let _ac=null;
function beep(){
  try{
    _ac=_ac||new (window.AudioContext||window.webkitAudioContext)();
    const o=_ac.createOscillator(), g=_ac.createGain();
    o.connect(g); g.connect(_ac.destination);
    o.type='sine'; o.frequency.value=660;
    g.gain.setValueAtTime(0.001,_ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15,_ac.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.001,_ac.currentTime+0.4);
    o.start(); o.stop(_ac.currentTime+0.42);
  }catch(e){}
}
