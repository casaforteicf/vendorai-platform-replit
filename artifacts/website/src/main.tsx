import { createRoot } from "react-dom/client";
import App from "./App";
import "../../../lib/vendor-brand/src/theme.css";
import "./index.css";
import { AdDataConsentControl } from "./components/AdDataConsentControl";
import {
  captureLaunchAttribution,
  installFirstPartyBehaviorTracking,
  installPublicFormConsentBridge,
} from "./lib/launchAttribution";
import { installSiteVisitorPresence } from "./lib/visitorPresence";
import { installWebVitalsRUM } from "./lib/webVitalsRUM";

captureLaunchAttribution();

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <AdDataConsentControl />
  </>,
);

// Keep form attribution available immediately after React mounts, but move
// analytics/presence listeners off the critical render path.
installPublicFormConsentBridge();

const scheduleNonCriticalTelemetry = () => {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  };
  const start = () => {
    installFirstPartyBehaviorTracking();
    installSiteVisitorPresence();
    installWebVitalsRUM();
  };
  if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(start, { timeout: 3000 });
  else window.setTimeout(start, 1200);
};

if (document.readyState === "complete") scheduleNonCriticalTelemetry();
else window.addEventListener("load", scheduleNonCriticalTelemetry, { once: true });
