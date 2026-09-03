// Worker de desativação.
// O VendorAI CRM não oferece modo offline e recebe deploys frequentes. Manter um
// service worker ativo sem necessidade só aumenta a chance de uma aba antiga
// continuar controlada por estado de frontend anterior.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.unregister(),
      self.clients.claim(),
    ]),
  );
});
