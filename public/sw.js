// Stayloop service worker — deliberately minimal (2026-09-22, PWA).
// No fetch handler and no caching: every deploy must be visible on the next
// load, and a stale-cache bug is the hardest kind to diagnose. This file
// exists so the app is installable and so push can be added later.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { title: 'Stayloop', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(data.title || 'Stayloop', { body: data.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: data.url || '/' } }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(self.clients.openWindow(url))
})
