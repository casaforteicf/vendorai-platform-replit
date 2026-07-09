import React, { useMemo, useState } from "react";
import type { AdjustmentMode, MaterialChange, RenderGalleryItem } from "./renderGalleryTypes";
import { adjustmentModeLabel, isUsableImage } from "./renderGalleryUtils";
import { MaterialChangePanel } from "./MaterialChangePanel";

export function PostRenderAdjustmentPanel({
  selectedRender,
  adjusting,
  onAdjust,
}: {
  selectedRender?: RenderGalleryItem | null;
  adjusting?: boolean;
  onAdjust: (payload: {
    mode: AdjustmentMode;
    prompt: string;
    targetRegion?: string;
    materialChanges?: MaterialChange[];
    preserveGeometry: boolean;
    preserveCamera: boolean;
    createNewVersion: boolean;
  }) => Promise<unknown>;
}) {
  const [mode, setMode] = useState<AdjustmentMode>("change-material");
  const [targetRegion, setTargetRegion] = useState("área selecionada");
  const [materialChanges, setMaterialChanges] = useState<MaterialChange[]>([]);
  const [instruction, setInstruction] = useState(
    "Preservar absolutamente o projeto, medidas, câmera, marcenaria, circulação e layout. Alterar somente o material indicado e gerar uma nova versão do render.",
  );

  const generatedPrompt = useMemo(() => {
    const materials = materialChanges
      .map((item) => `- ${item.target}: trocar ${item.fromMaterial || "material atual"} por ${item.toMaterial}. ${item.notes || ""}`)
      .join("\n");

    return [
      instruction,
      "",
      `Modo: ${adjustmentModeLabel(mode)}.`,
      `Região alvo: ${targetRegion}.`,
      materials ? `Alterações de material:\n${materials}` : "",
      "",
      "Obrigatório: criar novo render/versionamento, manter render original intacto e preservar geometria/câmera.",
    ]
      .filter(Boolean)
      .join("\n");
  }, [instruction, materialChanges, mode, targetRegion]);

  async function submit() {
    if (!isUsableImage(selectedRender)) return;

    await onAdjust({
      mode,
      prompt: generatedPrompt,
      targetRegion,
      materialChanges,
      preserveGeometry: true,
      preserveCamera: true,
      createNewVersion: true,
    });
  }

  return (
    <section className="space-y-5">
      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Pós-render</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Melhoria gera novo render no histórico</h2>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Modo</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as AdjustmentMode)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
            >
              <option value="improve">Melhorar render</option>
              <option value="change-material">Alterar material</option>
              <option value="change-lighting">Alterar iluminação</option>
              <option value="remove-object">Remover objeto</option>
              <option value="add-object">Adicionar objeto</option>
              <option value="preserve-and-refine">Preservar e refinar</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Região alvo</span>
            <input
              value={targetRegion}
              onChange={(event) => setTargetRegion(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Instrução de preservação</span>
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={5}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
          />
        </label>

        <div className="mt-4 rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Prompt final enviado ao backend</p>
          <pre className="mt-2 max-h-56 whitespace-pre-wrap text-xs leading-5 text-slate-600">{generatedPrompt}</pre>
        </div>

        <button
          type="button"
          disabled={!selectedRender || adjusting}
          onClick={submit}
          className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {adjusting ? "Gerando nova versão..." : "Gerar novo render"}
        </button>
      </section>

      <MaterialChangePanel onChange={setMaterialChanges} />
    </section>
  );
}
