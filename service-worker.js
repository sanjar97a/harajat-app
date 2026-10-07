// Har bir yangi relizda versiyani oshiring (v3, v4...) — eski kesh avtomatik o'chadi
const CACHE_NAME = "xarajat-kundaligi-v6";
// Eslatma holati (sahifa yozadi, SW o'qiydi) — eski keshlar bilan birga o'chirilmaydi
const REM_CACHE = "xarajat-reminder", REM_URL = "./__reminder-state", REM_TAG = "xarajat-reminder";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== REM_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // Sahifaning o'zi: avval internetdan (yangi versiya darhol keladi), bo'lmasa keshdan
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Qolgan fayllar: keshdan tez beriladi, fonda yangilanadi
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ---------------------------------------------------------------------
//  Kechki eslatma: Periodic Background Sync (Chrome, o'rnatilgan PWA)
// ---------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, "0");
async function checkReminder() {
  const cache = await caches.open(REM_CACHE);
  const res = await cache.match(REM_URL);
  if (!res) return;
  const s = await res.json();
  const d = new Date();
  const today = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (!s.on || hm < s.time || s.done === today || s.notified === today) return;
  await self.registration.showNotification(s.title || "Xarajat kundaligi", {
    body: s.body || "Bugungi xarajatlarni yozdingizmi?",
    icon: "icon.png", badge: "icon.png", tag: REM_TAG,
  });
  s.notified = today;
  await cache.put(REM_URL, new Response(JSON.stringify(s), { headers: { "Content-Type": "application/json" } }));
}
self.addEventListener("periodicsync", (event) => {
  if (event.tag === REM_TAG) event.waitUntil(checkReminder().catch(() => {}));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const w of list) if ("focus" in w) return w.focus();
      return self.clients.openWindow("./index.html");
    })
  );
});
