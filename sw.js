self.addEventListener('install', event => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('Service Worker activated');
});

self.addEventListener('push', event => {
  const data = event.data.json();
  const options = {
    body: data.message,
    icon: 'https://img.icons8.com/color/96/real-estate.png',
    badge: 'https://img.icons8.com/color/96/real-estate.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
