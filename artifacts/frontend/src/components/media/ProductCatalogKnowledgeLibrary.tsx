import { useEffect, useRef, useState } from "react";
import ProductCatalogKnowledgeLibraryV2 from "./ProductCatalogKnowledgeLibraryV2";

function findProductsButton() {
  const container = document.getElementById("biblioteca-midias");
  if (!container) return null;
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.includes("Produtos do catálogo")) ?? null;
}

export default function ProductCatalogKnowledgeLibrary() {
  const [active, setActive] = useState(false);
  const shouldReplayClick = useRef(false);

  useEffect(() => {
    if (active) return;

    const handler = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest("button");
      if (!button?.closest("#biblioteca-midias") || !button.textContent?.includes("Produtos do catálogo")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      shouldReplayClick.current = true;
      setActive(true);
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [active]);

  useEffect(() => {
    if (!active || !shouldReplayClick.current) return;
    shouldReplayClick.current = false;

    const timer = window.setTimeout(() => {
      findProductsButton()?.click();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) return null;
  return <ProductCatalogKnowledgeLibraryV2 />;
}
