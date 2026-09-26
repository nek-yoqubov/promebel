const CACHE = 'promebel-crm-v13';
const ASSETS = [
  'index.html', 'login.html', 'tasks.html', 'new-task.html', 'admin.html',
  'employee.html', 'links.html', 'notifications.html', 'profile.html',
  'dashboard.html', 'calendar.html', 'clients.html', 'deals.html', 'plan.html',
  'core.js', 'crm.css', 'supabase.min.js', 'xlsx.full.min.js', 'favicon.svg', 'anim-done.svg',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'favicon-32.png',
  'logo-h-dark.png', 'logo-h-light.png', 'logo-mark.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});

/* ============================================================
   ПУШИ
   crm-notify присылает {title, body, tag, url, badge}.
   url относительный: tasks.html?task=5
   ============================================================ */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (err) { d = { title: e.data ? e.data.text() : 'PRO MEBEL' }; }

  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'PRO MEBEL', {
      body: d.body || '',
      tag: d.tag,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: d.url || 'index.html' },
      vibrate: [120, 60, 120]
    });
    // цифра на иконке приложения
    if (typeof d.badge === 'number') {
      try {
        if (d.badge > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(d.badge);
        else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
      } catch (err) {}
    }
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const rel = (e.notification.data && e.notification.data.url) || 'index.html';
  const target = new URL(rel, self.registration.scope).href;

  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if (c.url.startsWith(self.registration.scope)) {
        try { await c.navigate(target); } catch (err) {}
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
