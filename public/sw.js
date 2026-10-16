/* Kaderno: service worker.
   - Guarda la carcasa de la app para que abra rápido y sin conexión.
   - Recibe las notificaciones push y las muestra.
   No toca las peticiones a Supabase (son de otro dominio). */
const VERSION = 'kaderno-v12-1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.png'];

// VERSION la cambia deploy/postbuild.mjs en cada build (huella de los archivos).

// Descarga en segundo plano los archivos del build que lista precache.json
// (JS de cada pantalla y la fuente de íconos), para que abrir otra pantalla
// no tenga que esperar a la red. Si algo falla, no pasa nada: se pedirá
// cuando haga falta.
async function precacheBuild() {
  try {
    const r = await fetch('/precache.json', { cache: 'no-store' });
    if (!r.ok) return;
    const { files } = await r.json();
    const c = await caches.open(VERSION);
    for (const f of files || []) {
      if (await c.match(f)) continue;
      try { const res = await fetch(f); if (res.ok) await c.put(f, res); } catch (_) { /* siguiente */ }
    }
  } catch (_) { /* sin precache.json (desarrollo) */ }
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Se guarda la versión actual y la inmediatamente anterior: una pestaña que
    // quedó abierta con la versión vieja todavía puede abrir sus pantallas.
    const keys = (await caches.keys()).filter((k) => k.startsWith('kaderno-') && k !== VERSION);
    const old = keys.slice(0, Math.max(0, keys.length - 1));
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    precacheBuild();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Configuración: se responde al instante con la guardada y se actualiza por
  // detrás (el cambio se ve en la siguiente apertura). Antes cada apertura
  // esperaba una ida y vuelta al servidor antes de poder arrancar.
  if (url.pathname === '/kaderno-config.js') {
    const fresh = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('/kaderno-config.js', copy)); } return r; });
    e.respondWith(caches.match('/kaderno-config.js').then((hit) => hit || fresh).catch(() => fresh));
    e.waitUntil(fresh.catch(() => {}));
    return;
  }
  if (url.pathname === '/sw.js') return;
  // Páginas: primero la red, pero si tarda más de 1,5 s (señal mala) se muestra
  // la guardada; sin conexión, también la guardada.
  if (req.mode === 'navigate') {
    const net = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('/', copy)); } return r; });
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { caches.match('/').then((hit) => { if (hit && !done) { done = true; resolve(hit); } }); }, 1500);
      net.then((r) => { if (!done) { done = true; clearTimeout(t); resolve(r); } })
        .catch(() => caches.match('/').then((hit) => { if (!done) { done = true; clearTimeout(t); resolve(hit || Response.error()); } }));
    }));
    e.waitUntil(net.catch(() => {}));
    return;
  }
  if (url.pathname === '/precache.json') return;
  // Archivos con hash del build (no cambian): primero la caché (de cualquier versión guardada).
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/') || /\.(png|ico|ttf|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; })));
  }
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { title: 'Kaderno', body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'Kaderno';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(target); } catch (_) {} } return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
