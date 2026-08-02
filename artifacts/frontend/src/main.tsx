import { createRoot } from "react-dom/client";
import App from "./App";
import SubdomainSite from "./SubdomainSite";
import { ErrorBoundary } from "./ErrorBoundary";
import "./index.css";
import "./modules/arqdor/theme/arqdor-theme.css";
import { setupApiClient } from "./lib/api";

setupApiClient();

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
    {tenantSlugForSite ? <SubdomainSite slug={tenantSlugForSite} /> : <App />}
  </ErrorBoundary>,
);
