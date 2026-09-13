import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SearchIndexationTrackingCard } from "./SearchIndexationTrackingCard";
import { SeoAuthorityTrackingCard } from "./SeoAuthorityTrackingCard";

const MOUNT_ID = "vendorai-seo-authority-tracking";
const PERFORMANCE_MOUNT_ID = "vendorai-search-performance-tracking";

function isTrackingRoute() {
  if (window.location.pathname !== "/content") return false;
  const params = new URLSearchParams(window.location.search);
  return (params.get("tab") ?? "visao-geral") === "rastreamento";
}

function findTrackingHeader(): HTMLElement | null {
  if (!isTrackingRoute()) return null;
  const headings = Array.from(document.querySelectorAll("h1"));
  const h1 = headings.find((node) => node.textContent?.replace(/\s+/g, " ").trim() === "Marketing") as HTMLElement | undefined;
  return h1?.parentElement ?? null;
}

function ensureMount(): HTMLElement | null {
  const existing = document.getElementById(MOUNT_ID);
  if (!isTrackingRoute()) {
    existing?.remove();
    return null;
  }

  const performanceMount = document.getElementById(PERFORMANCE_MOUNT_ID);
  const header = findTrackingHeader();
  const parent = performanceMount?.parentElement ?? header?.parentElement;
  if (!parent) {
    existing?.remove();
    return null;
  }
  if (existing) return existing;

  const mount = document.createElement("div");
  mount.id = MOUNT_ID;
  mount.dataset.vendoraiSeoAuthority = "true";
  mount.className = "mt-4";

  if (performanceMount) performanceMount.insertAdjacentElement("afterend", mount);
  else header?.insertAdjacentElement("afterend", mount);

  return mount;
}

export function SeoAuthorityTrackingBridge() {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setMount(ensureMount()));
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", sync);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("popstate", sync);
      document.getElementById(MOUNT_ID)?.remove();
    };
  }, []);

  return mount ? createPortal(
    <div className="space-y-4">
      <SearchIndexationTrackingCard />
      <SeoAuthorityTrackingCard />
    </div>,
    mount,
  ) : null;
}
