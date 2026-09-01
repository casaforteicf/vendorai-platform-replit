import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AdDataConsentControl } from "./components/AdDataConsentControl";
import {
  captureLaunchAttribution,
  installFirstPartyBehaviorTracking,
  installPublicFormConsentBridge,
} from "./lib/launchAttribution";

captureLaunchAttribution();
installPublicFormConsentBridge();
installFirstPartyBehaviorTracking();

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <AdDataConsentControl />
  </>,
);
