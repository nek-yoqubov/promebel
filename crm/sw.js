const CACHE = 'promebel-crm-v2';
const ASSETS = [
  'index.html', 'login.html', 'tasks.html', 'new-task.html', 'admin.html',
  'employee.html', 'links.html',
  'core.js', 'crm.css', 'supabase.min.js', 'favicon.svg',
  'icon-180.png', 'icon-192.png', 'icon-512.png',
  'logo-vertical-dark.png', 'logo-vertical-light.png'
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
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});
