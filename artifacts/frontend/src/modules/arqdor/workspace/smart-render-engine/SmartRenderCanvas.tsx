import React, { useMemo, useState } from "react";
import { useRenderEngine } from "./RenderEngineContext";

export function SmartRenderCanvas() {
  const { versions, activeVersionId, compareVersionId, mode } = useRenderEngine();
  const [zoom, setZoom] = useState(100);

  const active = useMemo(() => versions.find((version) => version.id === activeVersionId) || versions[0], [versions, activeVersionId]);
  const compare = useMemo(() => versions.find((version) => version.id === compareVersionId), [versions, compareVersionId]);

  if (!active?.imageUrl) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-[32px] bg-slate-950">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-white/10 text-2xl text-white/60">ARQ</div>
          <h2 className="mt-5 text-2xl font-semibold text-white">Nenhum render ativo</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Quando houver versões geradas, o Smart Render Engine exibirá o render principal, comparação e histórico.
          </p>
        </div>
      </div>
    );
  }

  if (mode === "compare" && compare?.imageUrl) {
    return (
      <div className="grid h-full min-h-[520px] gap-4 rounded-[32px] bg-slate-950 p-4 md:grid-cols-2">
        <RenderImage title="Atual" imageUrl={active.imageUrl} zoom={zoom} />
        <RenderImage title="Comparação" imageUrl={compare.imageUrl} zoom={zoom} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-[520px] items-center justify-center overflow-hidden rounded-[32px] bg-slate-950 p-6">
      <div className="absolute left-4 top-4 z-10 rounded-2xl bg-black/40 px-4 py-2 text-xs font-semibold text-white backdrop-blur">
        {active.label}
      </div>

      <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-2xl bg-black/40 p-2 backdrop-blur">
        <button type="button" onClick={() => setZoom((value) => Math.max(50, value - 10))} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white">-</button>
        <span className="w-12 text-center text-xs font-semibold text-white">{zoom}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(180, value + 10))} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white">+</button>
      </div>

      <img
        src={active.imageUrl}
        alt={active.label}
        className="max-h-full max-w-full rounded-3xl object-contain shadow-2xl transition-transform"
        style={{ transform: `scale(${zoom / 100})` }}
      />
    </div>
  );
}

function RenderImage({ title, imageUrl, zoom }: { title: string; imageUrl: string; zoom: number }) {
  return (
    <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-3xl bg-black/20">
      <span className="absolute left-4 top-4 rounded-2xl bg-black/40 px-3 py-1.5 text-xs font-semibold text-white">{title}</span>
      <img src={imageUrl} alt={title} className="max-h-full max-w-full rounded-2xl object-contain" style={{ transform: `scale(${zoom / 100})` }} />
    </div>
  );
}
