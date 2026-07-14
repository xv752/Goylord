self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : "/notifications";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          try {
            const clientUrl = new URL(client.url);
            if (clientUrl.origin === self.location.origin) {
              client.navigate(targetUrl);
              return client.focus();
            }
          } catch {}
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Goylord", body: event.data.text() };
  }

  const title = String(data.title || "Goylord Notification");
  const options = {
    body: String(data.body || ""),
    icon: "/assets/goylord.png",
    badge: "/assets/goylord.png",
    tag: data.tag || `goylord-push-${Date.now()}`,
    data: { url: data.url || "/notifications" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "show_notification") return;

  const title = String(data.title || "Goylord Notification");
  const options = {
    body: String(data.body || ""),
    icon: data.icon || "/assets/goylord.png",
    badge: "/assets/goylord.png",
    tag: data.tag || `goylord-${Date.now()}`,
    data: { url: data.url || "/notifications" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
