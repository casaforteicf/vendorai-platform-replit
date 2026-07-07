import React, { useMemo, useState } from "react";
import { PromptBuilder } from "./PromptBuilder";
import { RenderEngineProvider, useRenderEngine, type RenderVersion } from "./RenderEngineContext";
import { RenderExportPanel } from "./RenderExportPanel";
import { RenderToolbar } from "./RenderToolbar";
import { RenderVersionTimeline } from "./RenderVersionTimeline";
import { SmartRenderCanvas } from "./SmartRenderCanvas";
import { useRenderEngineData } from "./useRenderEngineData";

type SmartRenderEngineProps = {
  arqState: any;
};

function createFallbackVersions(): RenderVersion[] {
  return [];
}

export default function SmartRenderEngine({ arqState }: SmartRenderEngineProps) {
  const detectedVersions = useRenderEngineData(arqState);
  const initialVersions = useMemo(() => detectedVersions.length ? detectedVersions : createFallbackVersions(), [detectedVersions]);

  return (
    <RenderEngineProvider initialVersions={initialVersions}>
      <SmartRenderEngineInner />
    </RenderEngineProvider>
  );
}

function SmartRenderEngineInner() {
  const { mode, setVersions, setActiveVersionId } = useRenderEngine();
  const [lastPrompt, setLastPrompt] = useState("");

  const generateVersion = (prompt: string) => {
    setLastPrompt(prompt);

    const id = `local-${Date.now()}`;
    setVersions((current) => [
      {
        id,
        label: `Nova versão ${current.length + 1}`,
        prompt,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setActiveVersionId(id);
  };

  return (
    <div className="min-h-screen bg-[#f7f7f8] p-6 text-slate-950">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Sprint 004</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Smart Render Engine</h1>
            <p className="mt-1 text-sm text-slate-500">Canvas, versões, comparação, prompts e exportação.</p>
          </div>
          <RenderToolbar />
        </header>

        <main className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <section className="min-w-0">
            <SmartRenderCanvas />
          </section>

          <aside className="space-y-5">
            {mode === "prompt" || mode === "view" || mode === "compare" ? (
              <PromptBuilder onGenerate={generateVersion} />
            ) : null}

            {mode === "export" ? <RenderExportPanel /> : null}

            {lastPrompt ? (
              <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-950">Último comando</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{lastPrompt}</p>
              </div>
            ) : null}
          </aside>
        </main>

        <RenderVersionTimeline />
      </div>
    </div>
  );
}
