// Service worker mínimo — só existe pra satisfazer o critério de
// instalabilidade do Chrome/Edge (exige um SW com handler de fetch).
// Não faz cache agressivo de propósito: o painel muda com frequência
// (deploys diários) e cache offline errado geraria mais confusão do que
// ajuda. Se um dia quiser modo offline de verdade, é aqui que entra.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // passthrough — deixa o navegador buscar normal, sem interceptar
});
