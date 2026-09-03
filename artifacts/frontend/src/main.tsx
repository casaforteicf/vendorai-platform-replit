import { createRoot } from "react-dom/client";
import App from "./App";
import SubdomainSite from "./SubdomainSite";
import { ErrorBoundary } from "./ErrorBoundary";
import { MediaMenuInjector } from "./components/media/MediaMenuInjector";
import "./index.css";
import "./site-generator-fix.css";
import "./modules/arqdor/theme/arqdor-theme.css";
import { setupApiClient } from "./lib/api";

setupApiClient();

// Handoff de sessão vindo do site institucional após cadastro de demo.
// O site (appvendorai.com) e o CRM (app.appvendorai.com) têm storages separados,
// então o JWT é transportado no fragmento da URL (não vai para o servidor nem
// para Referer), salvo no storage do CRM e removido imediatamente da barra.
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const handoffToken = hashParams.get("vendorai_token");
const handoffDemoExpiresAt = hashParams.get("demo_expires_at");
if (handoffToken) {
  localStorage.setItem("vendorai_token", handoffToken);
  if (handoffDemoExpiresAt) {
    localStorage.setItem("vendorai_demo_expires_at", handoffDemoExpiresAt);
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

// Roteamento por hostname:
//   appvendorai.com / www          -> site institucional cuida disso agora (não chega aqui)
//   app.appvendorai.com            -> CRM, login genérico
//   <slug>.app.appvendorai.com     -> CRM, link exclusivo do lojista (mesma tela por enquanto —
//                                      o backend já resolve o tenant pelo login/senha; o slug aqui
//                                      só dá uma URL própria e memorável pra cada loja)
//   <slug>.appvendorai.com         -> site público do lojista (SubdomainSite)
const hostname = window.location.hostname;
const tenantSiteMatch = hostname.match(/^([a-z0-9-]+)\.appvendorai\.com$/);
// "app" e "<slug>.app" não são o site público de ninguém — caem no CRM.
const isAppHost = hostname === "app.appvendorai.com" || /^[a-z0-9-]+\.app\.appvendorai\.com$/.test(hostname);
const tenantSlugForSite = isAppHost ? null : (tenantSiteMatch?.[1] ?? null);

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    {tenantSlugForSite ? (
      <SubdomainSite slug={tenantSlugForSite} />
    ) : (
      <>
        <App />
        <MediaMenuInjector />
      </>
    )}
  </ErrorBoundary>,
);

// PWA — só registra pro CRM em si (não pro site público do lojista) e só em
// produção, pra não gerar cache confuso durante o desenvolvimento local.
if (import.meta.env.PROD && !tenantSlugForSite && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}