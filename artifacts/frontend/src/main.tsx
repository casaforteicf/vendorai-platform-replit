import { createRoot } from "react-dom/client";
import App from "./App";
import SubdomainSite from "./SubdomainSite";
import { ErrorBoundary } from "./ErrorBoundary";
import { FrontendRecoveryGuard } from "./components/FrontendRecoveryGuard";
import { BudgetImportAutofill } from "./components/BudgetImportAutofill";
import { MediaMenuInjector } from "./components/media/MediaMenuInjector";
import { MediaAdsBridge } from "./components/media/MediaAdsBridge";
import { MediaSitesBridge } from "./components/media/MediaSitesBridge";
import { MediaCatalogBridge } from "./components/media/MediaCatalogBridge";
import { MediaContentStudioBridge } from "./components/media/MediaContentStudioBridge";
import { MediaMarketingContentBridge } from "./components/media/MediaMarketingContentBridge";
import { MediaConversationsBridge } from "./components/media/MediaConversationsBridge";
import { VideoRouteThemeSync } from "./components/video/VideoRouteThemeSync";
import { I18nProvider } from "./i18n";
import "./index.css";
import "./ui-standard.css";
import "./sidebar-utilities.css";
import "./logo-top-right.css";
import "./site-generator-fix.css";
import "./video-route-theme.css";
import "./budget-dialog-policy.css";
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
    <I18nProvider>
      {tenantSlugForSite ? (
        <SubdomainSite slug={tenantSlugForSite} />
      ) : (
        <>
          <FrontendRecoveryGuard />
          <VideoRouteThemeSync />
          <App />
          <BudgetImportAutofill />
          <MediaMenuInjector />
          <MediaAdsBridge />
          <MediaSitesBridge />
          <MediaCatalogBridge />
          <MediaContentStudioBridge />
          <MediaMarketingContentBridge />
          <MediaConversationsBridge />
        </>
      )}
    </I18nProvider>
  </ErrorBoundary>,
);

// O CRM não registra mais service worker. Este produto recebe deploys frequentes e
// não oferece modo offline, então manter um worker controlando a sessão só aumenta
// a superfície para estado antigo de frontend. FrontendRecoveryGuard também remove
// registros legados já instalados no navegador.