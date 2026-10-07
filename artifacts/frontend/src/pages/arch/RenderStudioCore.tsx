// ARQDOR Render Studio — /arch/render
// P0: modal projeto, itens honestos, drag-drop, avanço único, footer real, canvas controls, ajuda/atalhos
// P1: canvas útil nas etapas iniciais, navegação direta, progresso real, recovery, acessibilidade
// P2: seleção por região (canvas rect), biblioteca de materiais real, política de preservação,
//     versionamento imutável com parentVersionId, comparação lado a lado, aprovação com governança,
//     especificação rastreável, downloads

import { useEffect, useState } from "react";
import { WorkspaceProvider } from "@/modules/arqdor/workspace/WorkspaceContext";
import { ArqdorThemeProvider } from "@/modules/arqdor/theme/ArqdorThemeProvider";
import { MediaAssetPicker } from "@/components/media/MediaAssetPicker";
import { RENDER_STUDIO_STEPS as STEPS, renderStudioStepIndex as stepIndex } from "./render-studio/renderStudioModel";
import { RenderStudioTopbar as Topbar, RenderStudioSidebar as LeftSidebar } from "./render-studio/RenderStudioNavigation";
import { RenderStudioCanvas as CentralCanvas } from "./render-studio/RenderStudioCanvas";
import { RenderStudioBottomPanel as BottomPanel } from "./render-studio/RenderStudioBottomPanel";
import { RenderStudioFooter as Footer } from "./render-studio/RenderStudioFooter";
import { RenderStudioRightPanel as RightPanel } from "./render-studio/RenderStudioRightPanel";
import {
  RenderStudioCreateProjectModal as CreateProjectModal,
  RenderStudioNavConfirmBanner as NavConfirmBanner,
  RenderStudioHelpModal as HelpModal,
  RenderStudioShortcutsModal as ShortcutsModal,
  RenderStudioMaterialLibraryModal as MaterialLibraryModal,
} from "./render-studio/RenderStudioOverlays";
import { RENDER_STUDIO_THEME as D, RENDER_STUDIO_GLOBAL_STYLES as GLOBAL_STYLES } from "./render-studio/renderStudioTheme";
import { useRenderStudioController } from "./render-studio/useRenderStudioController";

// ─── Main workspace inner ──────────────────────────────────────────────────────

function RenderStudioInner() {
  const {
    setLocation,
    arq,
    step,
    ambiente,
    setAmbiente,
    imageDataUrl,
    imageFile,
    renderId,
    renderUrl,
    versions,
    approved,
    loading,
    err,
    melhoriaPrompt,
    setMelhoriaPrompt,
    melhoriaMode,
    setMelhoriaMode,
    sceneType,
    setSceneType,
    renderProfile,
    setRenderProfile,
    visualStyle,
    setVisualStyle,
    lightingProfile,
    setLightingProfile,
    videoMovement,
    setVideoMovement,
    videoGenerating,
    renderVideoUrl,
    showCreateModal,
    setShowCreateModal,
    canvasMode,
    showGrid,
    showHelp,
    setShowHelp,
    showShortcuts,
    setShowShortcuts,
    isDragging,
    saveState,
    setSaveState,
    lastSavedAt,
    pendingNavStep,
    setPendingNavStep,
    processingStage,
    elapsedSeconds,
    isRecovering,
    rightPanelOpen,
    setRightPanelOpen,
    bottomPanelOpen,
    setBottomPanelOpen,
    selectionMode,
    setSelectionMode,
    selections,
    setSelections,
    selectedMaterial,
    setSelectedMaterial,
    showMaterialLib,
    setShowMaterialLib,
    showMediaLibrary,
    setShowMediaLibrary,
    materialMaskPreviewUrl,
    materialMaskConfirmed,
    materialMaskDetecting,
    detectMaterialSurface,
    confirmMaterialSurface,
    compareMode,
    compareVersionA,
    compareVersionB,
    setCompareVersionAId,
    setCompareVersionBId,
    approvalNote,
    setApprovalNote,
    approvalRecord,
    eventLog,
    fileRef,
    userName,
    tenantId,
    go,
    handleTestCopilotAction,
    handleCanvasControlClick,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleUpload,
    handleMediaLibraryConfirm,
    startRender,
    generateRenderVideo5s,
    applyMelhoria,
    handleApprove,
    handleRenderLoadError,
    handleSelectVersion,
    handleNextStep,
    handleStepClick,
    handleOpenSpecification,
    handleCreateProject,
    handleNewSelection,
    handleUpdateSelection,
  } = useRenderStudioController();

  return (
    <div className="arqdor-legacy-root" data-arqdor-step={STEPS[stepIndex(step)]?.label ?? step} style={{ height: "100vh", display: "flex", flexDirection: "column", background: D.bg, fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', boxSizing: "border-box", overflow: "hidden", color: D.text }}
      onClick={handleCanvasControlClick}>
      <style>{GLOBAL_STYLES}</style>

      {/* Modals */}
      <CreateProjectModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onCreate={handleCreateProject} />
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} currentStep={step} />
      <ShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <MaterialLibraryModal isOpen={showMaterialLib} onClose={() => setShowMaterialLib(false)} onSelect={mat => { setSelectedMaterial(mat); setMelhoriaMode("change-material"); }} />
      {tenantId && (
        <MediaAssetPicker
          tenantId={tenantId}
          open={showMediaLibrary}
          onOpenChange={setShowMediaLibrary}
          allowedTypes={["image"]}
          maxSelection={1}
          title="Escolher imagem base da Biblioteca"
          confirmLabel="Usar como imagem base"
          onConfirm={handleMediaLibraryConfirm}
        />
      )}

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
        onChange={async (e) => { const f = e.target.files?.[0]; if (f) await handleFileSelect(f); e.target.value = ""; }} />

      <Topbar
        step={step}
        projectTitle={arq.projectMeta?.titulo ?? null}
        ambiente={ambiente}
        onNextStep={handleNextStep}
        onOpenStudio={() => {
          // Studio IA faz parte do Render Studio. Não navegue para /arch/studio (workspace legado),
          // pois isso perde o contexto do render atual e pode carregar um chunk incompatível.
          setRightPanelOpen(true);
          setBottomPanelOpen(true);
          if (stepIndex(step) < stepIndex("melhoria")) go("melhoria");
        }}
        userName={userName}
        onHelp={() => setShowHelp(true)}
        onShortcuts={() => setShowShortcuts(true)}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <LeftSidebar step={step} projectTitle={arq.projectMeta?.titulo ?? null} onStepClick={handleStepClick} onProjectClick={() => { if (arq.projectId) setLocation(`/arch/projetos/${arq.projectId}`); }} />

        {pendingNavStep && <NavConfirmBanner targetStep={pendingNavStep} onConfirm={() => { go(pendingNavStep); setPendingNavStep(null); }} onCancel={() => setPendingNavStep(null)} />}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <CentralCanvas
            step={step} imageDataUrl={imageDataUrl} renderUrl={renderUrl}
            loading={loading} isDragging={isDragging} canvasMode={canvasMode} showGrid={showGrid}
            processingStage={processingStage} elapsedSeconds={elapsedSeconds} isRecovering={isRecovering}
            onUpload={handleUpload} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            projectTitle={arq.projectMeta?.titulo ?? null} ambiente={ambiente}
            selectionMode={selectionMode} selections={selections}
            onSelection={handleNewSelection} onUpdateSelection={handleUpdateSelection} onClearSelection={() => setSelections([])}
            materialMaskPreviewUrl={materialMaskPreviewUrl}
            compareMode={compareMode} compareVersionA={compareVersionA} compareVersionB={compareVersionB}
            allVersions={versions}
            onCompareChangeA={(id) => setCompareVersionAId(id)} onCompareChangeB={(id) => setCompareVersionBId(id)}
            onRenderLoadError={handleRenderLoadError}
          />
          <BottomPanel
            versions={versions}
            projectId={arq.projectId}
            currentRenderId={renderId}
            isOpen={bottomPanelOpen}
            onToggle={() => setBottomPanelOpen(o => !o)}
            onSelectVersion={handleSelectVersion}
            eventLog={eventLog}
            userName={userName}
          />
        </div>

        <RightPanel
          step={step} arq={arq} ambiente={ambiente}
          setAmbiente={(v) => { setAmbiente(v); setSaveState("unsaved"); }}
          imageFile={imageFile} imageDataUrl={imageDataUrl} renderUrl={renderUrl} currentRenderId={renderId} versions={versions}
          loading={loading} err={err}
          melhoriaPrompt={melhoriaPrompt} setMelhoriaPrompt={setMelhoriaPrompt}
          melhoriaMode={melhoriaMode} setMelhoriaMode={setMelhoriaMode}
          approved={approved}
          onNextStep={handleNextStep} onStartRender={startRender}
          onApplyMelhoria={applyMelhoria} onApprove={handleApprove}
          sceneType={sceneType} setSceneType={setSceneType}
          renderProfile={renderProfile} setRenderProfile={setRenderProfile}
          visualStyle={visualStyle} setVisualStyle={setVisualStyle}
          lightingProfile={lightingProfile} setLightingProfile={setLightingProfile}
          videoMovement={videoMovement} setVideoMovement={setVideoMovement}
          videoGenerating={videoGenerating} renderVideoUrl={renderVideoUrl} onGenerateVideo5s={generateRenderVideo5s}
          onShowCreateModal={() => setShowCreateModal(true)} onUpload={handleUpload} onOpenMediaLibrary={() => setShowMediaLibrary(true)} mediaLibraryAvailable={Boolean(tenantId)}
          selections={selections} selectedMaterial={selectedMaterial}
          onOpenMaterialLib={() => setShowMaterialLib(true)}
          onClearSelection={() => setSelections([])}
          onRemoveSelection={(id) => setSelections(prev => prev.filter(s => s.id !== id))}
          materialMaskPreviewUrl={materialMaskPreviewUrl}
          materialMaskConfirmed={materialMaskConfirmed}
          materialMaskDetecting={materialMaskDetecting}
          onDetectMaterialSurface={detectMaterialSurface}
          onConfirmMaterialSurface={confirmMaterialSurface}
          approvalRecord={approvalRecord} approvalNote={approvalNote} setApprovalNote={setApprovalNote}
          onOpenSpecification={handleOpenSpecification}
          isOpen={rightPanelOpen} onToggle={() => setRightPanelOpen(o => !o)}
          onTestCopilotAction={handleTestCopilotAction}
        />
      </div>

      <Footer projectTitle={arq.projectMeta?.titulo ?? null} ambiente={ambiente} saveState={saveState} lastSavedAt={lastSavedAt} onHelp={() => setShowHelp(true)} onShortcuts={() => setShowShortcuts(true)} />
    </div>
  );
}

    ambiente,
    renderId,
    renderUrl,
    imageDataUrl,
    versions,
    approved,
    approvalNote,
    setApprovalNote,
    loading,
    err,
    handleApprove,
    handleSelectVersion,
    handleOpenSpecification,
  } = useRenderStudioController();

  const currentImage = renderUrl || imageDataUrl || null;
  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#fff", fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', paddingBottom: 96 }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(15,17,23,.96)", borderBottom: "1px solid rgba(255,255,255,.08)", backdropFilter: "blur(10px)" }}>
        <button
          type="button"
          onClick={() => setLocation(arq.projectId ? `/arch/projetos/${arq.projectId}` : "/arch/projetos")}
          style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 18 }}
          aria-label="Voltar ao projeto"
        >←</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{arq.projectMeta?.titulo || "ARQDOR Render Studio"}</div>
          <div style={{ marginTop: 2, fontSize: 11, color: "#94a3b8" }}>{ambiente || "Ambiente"}</div>
        </div>
        {approved && <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(16,185,129,.14)", color: "#6ee7b7", fontSize: 10, fontWeight: 800 }}>Aprovado</span>}
      </header>

      <main style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div style={{ border: "1px solid rgba(248,113,113,.3)", background: "rgba(248,113,113,.08)", color: "#fca5a5", borderRadius: 12, padding: 12, fontSize: 12 }}>{err}</div>}
        <section style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,.1)", background: "#090b10" }}>
          {currentImage ? (
            <img src={currentImage} alt="Versão atual do render" style={{ width: "100%", display: "block", maxHeight: "58vh", objectFit: "contain", background: "#080a0e" }} />
          ) : (
            <div style={{ minHeight: 240, display: "grid", placeItems: "center", padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              Nenhuma imagem ou render disponível para este ambiente.
            </div>
          )}
        </section>

        {versions.length > 0 && (
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong style={{ fontSize: 12 }}>Versões</strong>
              <span style={{ fontSize: 10, color: "#64748b" }}>{versions.length} registradas</span>
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {versions.map((version, index) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => handleSelectVersion(version)}
                  style={{
                    flex: "0 0 116px",
                    borderRadius: 12,
                    overflow: "hidden",
                    border: version.id === renderId ? "2px solid #f97316" : "1px solid rgba(255,255,255,.1)",
                    background: "#171a22",
                    color: "#fff",
                    padding: 0,
                    textAlign: "left",
                  }}
                >
                  <img src={version.url} alt={`Versão ${index + 1}`} style={{ width: "100%", height: 72, objectFit: "cover", display: "block" }} />
                  <div style={{ padding: "7px 8px", fontSize: 10, fontWeight: 700 }}>V{index + 1}{version.id === renderId ? " · atual" : ""}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {renderId && !approved && (
          <section style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,.1)", background: "#171a22" }}>
            <label style={{ display: "block", fontSize: 11, color: "#cbd5e1", marginBottom: 7 }}>Nota de aprovação (opcional)</label>
            <textarea
              value={approvalNote}
              onChange={(event) => setApprovalNote(event.target.value)}
              rows={3}
              placeholder="Observação sobre esta versão"
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "#0f1117", color: "#fff", padding: 10, fontSize: 12 }}
            />
          </section>
        )}
      </main>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, padding: "10px 12px calc(10px + env(safe-area-inset-bottom))", background: "rgba(15,17,23,.97)", borderTop: "1px solid rgba(255,255,255,.08)", display: "grid", gridTemplateColumns: renderId && !approved ? "1fr 1fr" : "1fr", gap: 8 }}>
        {renderId && !approved && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleApprove()}
            style={{ minHeight: 46, borderRadius: 12, border: 0, background: loading ? "#7c2d12" : "#f97316", color: "#fff", fontSize: 13, fontWeight: 800, opacity: loading ? .6 : 1 }}
          >{loading ? "Processando…" : "Aprovar versão"}</button>
        )}
        <button
          type="button"
          onClick={handleOpenSpecification}
          style={{ minHeight: 46, borderRadius: 12, border: "1px solid rgba(255,255,255,.14)", background: "#fff", color: "#111827", fontSize: 13, fontWeight: 800 }}
        >Abrir especificação</button>
      </div>
    </div>
  );
}

function MobileRenderStudio() {
  const {
    setLocation,
    arq,
    ambiente,
    renderId,
    renderUrl,
    imageDataUrl,
    versions,
    approved,
    approvalNote,
    setApprovalNote,
    loading,
    err,
    handleApprove,
    handleSelectVersion,
    handleOpenSpecification,
  } = useRenderStudioController();

  const currentImage = renderUrl || imageDataUrl || null;

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#fff", fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', paddingBottom: 96 }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(15,17,23,.96)", borderBottom: "1px solid rgba(255,255,255,.08)", backdropFilter: "blur(10px)" }}>
        <button
          type="button"
          onClick={() => setLocation(arq.projectId ? `/arch/projetos/${arq.projectId}` : "/arch/projetos")}
          style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 18 }}
          aria-label="Voltar ao projeto"
        >←</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{arq.projectMeta?.titulo || "ARQDOR Render Studio"}</div>
          <div style={{ marginTop: 2, fontSize: 11, color: "#94a3b8" }}>{ambiente || "Ambiente"}</div>
        </div>
        {approved && <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(16,185,129,.14)", color: "#6ee7b7", fontSize: 10, fontWeight: 800 }}>Aprovado</span>}
      </header>

      <main style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div style={{ border: "1px solid rgba(248,113,113,.3)", background: "rgba(248,113,113,.08)", color: "#fca5a5", borderRadius: 12, padding: 12, fontSize: 12 }}>{err}</div>}

        <section style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,.1)", background: "#090b10" }}>
          {currentImage ? (
            <img src={currentImage} alt="Versão atual do render" style={{ width: "100%", display: "block", maxHeight: "58vh", objectFit: "contain", background: "#080a0e" }} />
          ) : (
            <div style={{ minHeight: 240, display: "grid", placeItems: "center", padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              Nenhuma imagem ou render disponível para este ambiente.
            </div>
          )}
        </section>

        {versions.length > 0 && (
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong style={{ fontSize: 12 }}>Versões</strong>
              <span style={{ fontSize: 10, color: "#64748b" }}>{versions.length} registradas</span>
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {versions.map((version, index) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => handleSelectVersion(version)}
                  style={{
                    flex: "0 0 116px",
                    borderRadius: 12,
                    overflow: "hidden",
                    border: version.id === renderId ? "2px solid #f97316" : "1px solid rgba(255,255,255,.1)",
                    background: "#171a22",
                    color: "#fff",
                    padding: 0,
                    textAlign: "left",
                  }}
                >
                  <img src={version.url} alt={`Versão ${index + 1}`} style={{ width: "100%", height: 72, objectFit: "cover", display: "block" }} />
                  <div style={{ padding: "7px 8px", fontSize: 10, fontWeight: 700 }}>V{index + 1}{version.id === renderId ? " · atual" : ""}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {renderId && !approved && (
          <section style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,.1)", background: "#171a22" }}>
            <label style={{ display: "block", fontSize: 11, color: "#cbd5e1", marginBottom: 7 }}>Nota de aprovação (opcional)</label>
            <textarea
              value={approvalNote}
              onChange={(event) => setApprovalNote(event.target.value)}
              rows={3}
              placeholder="Observação sobre esta versão"
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "#0f1117", color: "#fff", padding: 10, fontSize: 12 }}
            />
          </section>
        )}
      </main>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, padding: "10px 12px calc(10px + env(safe-area-inset-bottom))", background: "rgba(15,17,23,.97)", borderTop: "1px solid rgba(255,255,255,.08)", display: "grid", gridTemplateColumns: renderId && !approved ? "1fr 1fr" : "1fr", gap: 8 }}>
        {renderId && !approved && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleApprove()}
            style={{ minHeight: 46, borderRadius: 12, border: 0, background: loading ? "#7c2d12" : "#f97316", color: "#fff", fontSize: 13, fontWeight: 800, opacity: loading ? .6 : 1 }}
          >{loading ? "Processando…" : "Aprovar versão"}</button>
        )}
        <button
          type="button"
          onClick={handleOpenSpecification}
          style={{ minHeight: 46, borderRadius: 12, border: "1px solid rgba(255,255,255,.14)", background: "#fff", color: "#111827", fontSize: 13, fontWeight: 800 }}
        >Abrir especificação</button>
      </div>
    </div>
  );
}

// ─── Page export ───────────────────────────────────────────────────────────────

export default function RenderStudioCore() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile) {
    return (
      <ArqdorThemeProvider>
        <WorkspaceProvider>
          <MobileRenderStudio />
        </WorkspaceProvider>
      </ArqdorThemeProvider>
    );
  }

  return (
    <ArqdorThemeProvider>
      <WorkspaceProvider>
        <RenderStudioInner />
      </WorkspaceProvider>
    </ArqdorThemeProvider>
  );
}
