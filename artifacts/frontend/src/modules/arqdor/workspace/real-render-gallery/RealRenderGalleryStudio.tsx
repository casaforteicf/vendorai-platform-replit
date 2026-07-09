import React, { useMemo } from "react";
import { ApprovedRenderToSpecPanel } from "./ApprovedRenderToSpecPanel";
import { PostRenderAdjustmentPanel } from "./PostRenderAdjustmentPanel";
import { RealRenderGalleryPanel } from "./RealRenderGalleryPanel";
import { RenderVersionTimeline } from "./RenderVersionTimeline";
import { SelectedRenderInspector } from "./SelectedRenderInspector";
import { useRealRenderGallery } from "./useRealRenderGallery";
import { getProjectId, getProjectTitle } from "./renderGalleryUtils";

type RealRenderGalleryStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

export default function RealRenderGalleryStudio({ arqState, onNavigate }: RealRenderGalleryStudioProps) {
  const projectId = useMemo(() => getProjectId(arqState), [arqState]);
  const projectTitle = useMemo(() => getProjectTitle(arqState), [arqState]);

  const {
    items,
    versions,
    selectedRender,
    setSelectedRender,
    loading,
    adjusting,
    approving,
    sendingToSpec,
    error,
    reload,
    runAdjustment,
    runApprove,
    runSendToSpecification,
  } = useRealRenderGallery(projectId);

  async function approve(notes?: string) {
    if (!selectedRender) return;

    await runApprove({
      renderId: selectedRender.id,
      projectId,
      ambienteId: selectedRender.ambienteId,
      cenaId: selectedRender.cenaId,
      notes,
    });
  }

  async function sendToSpec() {
    if (!selectedRender) return;

    await runSendToSpecification({
      renderId: selectedRender.id,
      projectId,
      ambienteId: selectedRender.ambienteId,
      cenaId: selectedRender.cenaId,
      extractObjects: true,
      preservePrompt: true,
    });

    onNavigate?.("especificacao");
  }

  return (
    <div className="h-full overflow-x-hidden overflow-y-auto bg-[var(--arq-background)] text-[var(--arq-foreground)]">
      <div className="flex w-full max-w-full flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Sprint 029 • Real Render Gallery</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--arq-foreground)]">Render real, melhoria e versionamento</h1>
              <p className="mt-1 text-sm text-[var(--arq-muted)]">
                {projectTitle} • melhoria gera novo render, histórico preservado, material editável e envio para especificação.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reload}
                className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Atualizar galeria
              </button>
              <button
                type="button"
                onClick={() => onNavigate?.("especificacao")}
                className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
              >
                Specification
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-[28px] border border-rose-100 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <RealRenderGalleryPanel
              items={items}
              selectedRender={selectedRender}
              loading={loading}
              onSelect={setSelectedRender}
              onReload={reload}
            />

            <RenderVersionTimeline
              items={versions.flatMap((group) => group.versions)}
              selectedRender={selectedRender}
              onSelect={setSelectedRender}
            />
          </div>

          <div className="space-y-5">
            <SelectedRenderInspector item={selectedRender} />

            <PostRenderAdjustmentPanel
              selectedRender={selectedRender}
              adjusting={adjusting}
              onAdjust={(payload) => selectedRender ? runAdjustment(selectedRender, payload) : Promise.resolve(null)}
            />

            <ApprovedRenderToSpecPanel
              projectId={projectId}
              selectedRender={selectedRender}
              approving={approving}
              sendingToSpec={sendingToSpec}
              onApprove={approve}
              onSendToSpec={sendToSpec}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
