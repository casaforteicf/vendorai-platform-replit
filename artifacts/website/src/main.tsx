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
installPublicFormConsentBridge();
installFirstPartyBehaviorTracking();
installSiteVisitorPresence();
installWebVitalsRUM();

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <AdDataConsentControl />
  </>,
);
