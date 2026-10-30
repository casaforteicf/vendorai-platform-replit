import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { vendoraiAcquisitionPlaybook } from "@/data/vendoraiAcquisitionPlaybook";

const HOST_ATTR = "data-vendorai-acquisition-playbook";

export function VendorAIAcquisitionPlaybook() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const visible = useMemo(() => {
    const [path, query = ""] = location.split("?");
    const params = new URLSearchParams(query);
    return (path === "/content" && (params.get("tab") ?? "gerador") === "planejamento") || path === "/marketing/media-plan" || path === "/plano-de-midia";
  }, [location]);

  useEffect(() => {
    const update = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener("popstate", update);
    const timer = window.setInterval(update, 400);
    return () => { window.removeEventListener("popstate", update); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!visible) { setHost(null); return; }
    let portalHost = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
    if (!portalHost) { portalHost = document.createElement("div"); portalHost.setAttribute(HOST_ATTR, "true"); }
    const attach = () => {
      const body = document.querySelector<HTMLElement>(".marketing-plan-responsive");
      if (!body?.parentElement || !portalHost) return;
      if (portalHost.parentElement !== body.parentElement) body.insertAdjacentElement("afterend", portalHost);
      setHost(portalHost);
    };
    attach();
    const timer = window.setInterval(attach, 500);
    return () => { window.clearInterval(timer); portalHost?.remove(); };
  }, [visible]);

  if (!visible || !host) return null;

  return createPortal(
    <section className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 text-blue-600" />
        <div>
          <h3 className="font-semibold">Motor de Aquisição VendorAI</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Pautas-base orientadas por dor real, função concreta e CTA mensurável. Use como referência para gerar o calendário e as peças, sem transformar o conteúdo em propaganda genérica.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {vendoraiAcquisitionPlaybook.map((item) => (
          <article key={item.day} className="rounded-xl border bg-background p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Dia {item.day} · {item.format}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <p className="mt-2 text-sm font-semibold leading-5">{item.title}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Dor: {item.pain}</p>
            <p className="mt-2 text-[11px] font-medium text-primary">CTA: {item.cta}</p>
          </article>
        ))}
      </div>
    </section>,
    host,
  );
}
