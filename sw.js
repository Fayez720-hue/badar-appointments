self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  self.clients.claim();
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  // استخدم الرابط المخزن في بيانات الإشعار (من sendSystemNotification)
  const urlToOpen = event.notification.data?.url || './';
  event.waitUntil(
    clients.openWindow(urlToOpen)
  );
});
