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
    specDone,
    specData,
    specificationId,
    enviandoOrcamento,
    orcamentoMsg,
    areaM2,
    setAreaM2,
    peDireitoM,
    setPeDireitoM,
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
    handleSendToSpec,
    handleSalvarMedidasAmbiente,
    handleSalvarMedidasItem,
    handleEnviarOrcamento,
    handleRenderLoadError,
    handleSelectVersion,
    handleNextStep,
    handleStepClick,
    handleCreateProject,
    handleNewSelection,
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

      <Topbar step={step} projectTitle={arq.projectMeta?.titulo ?? null} ambiente={ambiente} onNextStep={handleNextStep} onOpenStudio={() => setLocation("/arch/studio")} userName={userName} onHelp={() => setShowHelp(true)} onShortcuts={() => setShowShortcuts(true)} />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <LeftSidebar step={step} projectTitle={arq.projectMeta?.titulo ?? null} onStepClick={handleStepClick} />

        {pendingNavStep && <NavConfirmBanner targetStep={pendingNavStep} onConfirm={() => { go(pendingNavStep); setPendingNavStep(null); }} onCancel={() => setPendingNavStep(null)} />}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <CentralCanvas
            step={step} imageDataUrl={imageDataUrl} renderUrl={renderUrl}
            loading={loading} isDragging={isDragging} canvasMode={canvasMode} showGrid={showGrid}
            processingStage={processingStage} elapsedSeconds={elapsedSeconds} isRecovering={isRecovering}
            onUpload={handleUpload} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            projectTitle={arq.projectMeta?.titulo ?? null} ambiente={ambiente}
            selectionMode={selectionMode} selections={selections}
            onSelection={handleNewSelection} onClearSelection={() => setSelections([])}
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
          approved={approved} specDone={specDone} specData={specData}
          specificationId={specificationId} enviandoOrcamento={enviandoOrcamento}
          orcamentoMsg={orcamentoMsg} onEnviarOrcamento={handleEnviarOrcamento}
          areaM2={areaM2} setAreaM2={setAreaM2} peDireitoM={peDireitoM} setPeDireitoM={setPeDireitoM}
          onSalvarMedidasAmbiente={handleSalvarMedidasAmbiente} onSalvarMedidasItem={handleSalvarMedidasItem}
          onNextStep={handleNextStep} onStartRender={startRender}
          onApplyMelhoria={applyMelhoria} onApprove={handleApprove} onSendToSpec={handleSendToSpec}
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
          approvalRecord={approvalRecord} approvalNote={approvalNote} setApprovalNote={setApprovalNote}
          isOpen={rightPanelOpen} onToggle={() => setRightPanelOpen(o => !o)}
          onTestCopilotAction={handleTestCopilotAction}
        />
      </div>

      <Footer projectTitle={arq.projectMeta?.titulo ?? null} ambiente={ambiente} saveState={saveState} lastSavedAt={lastSavedAt} onHelp={() => setShowHelp(true)} onShortcuts={() => setShowShortcuts(true)} />
    </div>
  );
}

// ─── Page export ───────────────────────────────────────────────────────────────

export default function RenderStudioCore() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile) {
    return (
      <ArqdorThemeProvider>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", background: "#0f1117", color: "#fff", gap: 16 }}>
          <div style={{ fontSize: 48 }}>🖥️</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>ARQDOR Render Studio</h1>
          <p style={{ fontSize: 14, opacity: 0.6, maxWidth: 300, lineHeight: 1.6, margin: 0 }}>
            Este módulo requer uma tela maior. Abra em um computador ou tablet para usar todos os recursos do Render Studio.
          </p>
        </div>
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
