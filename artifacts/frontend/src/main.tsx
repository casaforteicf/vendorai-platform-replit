import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setupApiClient } from "./lib/api";

setupApiClient();

createRoot(document.getElementById("root")!).render(<App />);