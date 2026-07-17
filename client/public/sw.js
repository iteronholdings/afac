/* 아르벤팩토리 서비스워커 — 웹푸시 수신 + PWA(앱 설치) 지원 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

// 페이지 이동 요청만 네트워크로 통과시키고, 오프라인이면 안내 문구를 보여준다. (PWA 요건)
self.addEventListener("fetch", event => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            "<!doctype html><meta charset='utf-8'><body style='font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#fef9f3;color:#5b4a38'><p>인터넷 연결이 끊겼어요.<br>연결 후 다시 열어 주세요.</p></body>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
          )
      )
    );
  }
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* ignore */ }
  const title = data.title || "💬 새 메시지";
  const options = {
    body: data.body || "",
    icon: "/af-mark.png",
    badge: "/af-mark.png",
    tag: "arben-chat",
    renotify: true,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) {
        try { await c.navigate(url); } catch (e) { /* ignore */ }
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
