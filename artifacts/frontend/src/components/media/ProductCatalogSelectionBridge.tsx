import { useEffect } from "react";

export default function ProductCatalogSelectionBridge() {
  useEffect(() => {
    const timer = window.setInterval(() => {
      const container = document.getElementById("biblioteca-midias");
      if (!container) return;
      const productButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("Produtos do catálogo"));
      if (!productButton || !productButton.className.includes("border-orange-300")) return;
      productButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }, 250);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}
