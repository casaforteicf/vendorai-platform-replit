import { useEffect, useRef } from "react";
import { syncJarvisCases, type JarvisCaseSignal } from "@/lib/jarvis-case-sync";

function parseImpact(metric: string): number | null {
  const currency = metric.match(/R\$\s*([\d.]+(?:,\d+)?)/i)?.[1];
  if (!currency) return null;
  const value = Number(currency.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function collectSignals(root: HTMLElement): JarvisCaseSignal[] {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"));
  const signals: JarvisCaseSignal[] = [];

  for (const anchor of anchors) {
    const text = anchor.textContent ?? "";
    const confidenceMatch = text.match(/robustez\s+(\d+)%/i);
    if (!confidenceMatch) continue;

    const title = anchor.querySelector<HTMLParagraphElement>("p.mt-2.text-sm.font-semibold")?.textContent?.trim();
    const detail = anchor.querySelector<HTMLParagraphElement>("p.mt-1.text-xs")?.textContent?.trim();
    const metric = anchor.querySelector<HTMLElement>("strong")?.textContent?.trim() ?? "";
    const badge = anchor.querySelector<HTMLElement>("[class*='rounded-full'], [class*='border-red-200'], [class*='border-amber-200'], [class*='border-emerald-200']");
    const category = badge?.textContent?.trim() || "observador";

    if (!title || !detail) continue;

    const className = badge?.className ?? "";
    const severity: JarvisCaseSignal["severity"] = className.includes("text-red-700")
      ? "risk"
      : className.includes("text-emerald-700")
        ? "opportunity"
        : "attention";

    signals.push({
      id: `observer-${slug(category)}-${slug(title)}`,
      category,
      severity,
      title,
      detail,
      metric: metric || null,
      confidence: Number(confidenceMatch[1]),
      impact: parseImpact(metric),
      href: anchor.getAttribute("href"),
    });
  }

  return signals.slice(0, 8);
}

export default function JarvisObserverCaseSync({ token }: { token: string | null }) {
  const lastHashRef = useRef("");

  useEffect(() => {
    if (!token) return;

    let timer: number | null = null;
    let cancelled = false;

    const sync = async () => {
      const root = document.getElementById("observador-estrategico");
      if (!root) return;

      const signals = collectSignals(root);
      if (!signals.length) return;

      const hash = JSON.stringify(signals);
      if (hash === lastHashRef.current) return;

      try {
        await syncJarvisCases(token, signals, {
          source: "strategic_observer",
          evidence: {
            origin: "StrategicObserver",
            window: "90d+current_pipeline",
            capturedFrom: "dashboard",
          },
        });
        if (!cancelled) lastHashRef.current = hash;
      } catch {
        // Persistência de inteligência é complementar; não deve quebrar o Dashboard.
      }
    };

    const schedule = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void sync(), 250);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (timer != null) window.clearTimeout(timer);
    };
  }, [token]);

  return null;
}
