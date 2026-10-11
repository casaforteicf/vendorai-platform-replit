import React, { useMemo, useState } from "react";
import {
  INTERACTIVE_CAPABILITIES,
  resolveRenderQuality,
  type RenderCapabilities,
  type RenderQuality,
} from "./render-quality-config";

type Props = { capabilities?: RenderCapabilities };
export function RenderQualityPanel({ capabilities = INTERACTIVE_CAPABILITIES }: Props) {
  const [quality, setQuality] = useState<RenderQuality>("preview");
  const resolved = useMemo(() => resolveRenderQuality(quality, capabilities), [quality, capabilities]);
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm" aria-label="Qualidade de renderização">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Motor de renderização</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">Qualidade e fidelidade</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        O projeto mantém geometria e medidas preservadas. Modos físicos exigem um motor compatível conectado.
      </p>
      <label htmlFor="arqdor-render-quality" className="mt-4 block text-xs font-semibold text-slate-700">
        Perfil solicitado
      </label>
      <select id="arqdor-render-quality" value={quality}
        onChange={(event) => setQuality(event.target.value as RenderQuality)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900">
        <option value="preview">Prévia interativa</option>
        <option value="professional">Profissional — ray tracing + GI</option>
        <option value="ultra">Ultra — amostragem elevada</option>
      </select>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Motor</dt><dd className="mt-1 font-semibold">{capabilities.backend}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Perfil efetivo</dt><dd className="mt-1 font-semibold">{resolved.effectiveQuality}</dd></div>
      </dl>
      {resolved.warnings.map((warning) => (
        <p key={warning} role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">{warning}</p>
      ))}
      <p className="mt-3 text-xs text-slate-500">
        Configuração informativa: a geração de render permanece no fluxo atual até a integração de um adaptador físico.
      </p>
    </section>
  );
}
