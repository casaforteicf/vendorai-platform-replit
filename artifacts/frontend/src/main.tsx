import { createRoot } from "react-dom/client";
import App from "./App";
import SubdomainSite from "./SubdomainSite";
import "./index.css";
import { setupApiClient } from "./lib/api";

setupApiClient();

// Detect *.appvendorai.com subdomains and render the tenant site directly
const hostname = window.location.hostname;
const subdomainMatch = hostname.match(/^([a-z0-9-]+)\.appvendorai\.com$/);
const tenantSlug = subdomainMatch?.[1] ?? null;

createRoot(document.getElementById("root")!).render(
  tenantSlug ? <SubdomainSite slug={tenantSlug} /> : <App />,
);