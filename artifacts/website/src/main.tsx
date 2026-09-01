import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AdDataConsentControl } from "./components/AdDataConsentControl";
import {
  captureLaunchAttribution,
  installPublicFormConsentBridge,
} from "./lib/launchAttribution";

// Captura first-touch assim que o site carrega e instala uma ponte única para
// todos os formulários públicos conhecidos. A escolha de ad-data é separada da
// atribuição: pode mudar/revogar sem alterar a campanha original do lead.
captureLaunchAttribution();
installPublicFormConsentBridge();

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <AdDataConsentControl />
  </>,
);
