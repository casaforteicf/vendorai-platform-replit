import { useEffect, useRef, useState } from "react";
import type { RenderStudioStep as Step, RenderStudioCanvasMode as CanvasMode, RenderStudioSelectionRect as SelectionRect, RenderStudioVersion as RenderVersion } from "./renderStudioModel";
import { RENDER_STUDIO_STEPS as STEPS, renderStudioStepIndex as stepIndex } from "./renderStudioModel";
import { RENDER_STUDIO_THEME as D, renderStudioInputStyle as inputStyle } from "./renderStudioTheme";
import { normalizeRenderMediaUrl } from "./renderStudioApi";

function DkSpinner({ size = 28 }: { size?: number }) {
  return (
    <>
      <div style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${D.border}`, borderTopColor: D.purple, animation: "arq-spin 0.7s linear infinite", flexShrink: 0 }} />
      <style>{`@keyframes arq-spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ─── P1-8: FlowGuide ─────────────────────────────────────────────────────────

function FlowGuide({ step, projectTitle, ambiente }: { step: Step; projectTitle: string | null; ambiente: string }) {
  const currentIdx = stepIndex(step);
  return (
    <div className="arqdor-flow-guide" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, maxWidth: 480, padding: "0 16px" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, color: D.purple, marginBottom: 8, opacity: 0.7 }}>{STEPS[currentIdx].icon}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: D.text, marginBottom: 6 }}>{STEPS[currentIdx].label}</div>
        <div style={{ fontSize: 12, color: D.muted, lineHeight: 1.6 }}>{STEPS[currentIdx].hint}</div>
      </div>
      {(projectTitle || ambiente) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {projectTitle && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, background: `${D.purple}18`, border: `1px solid ${D.purple}33`, fontSize: 11, color: D.purpleText }}><span>◈</span> {projectTitle}</div>}
          {ambiente && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, background: D.card, border: `1px solid ${D.border}`, fontSize: 11, color: D.muted }}><span>⬡</span> {ambiente}</div>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {STEPS.map((s, i) => {
          const done = i < currentIdx; const active = i === currentIdx;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div title={s.label} style={{ width: active ? 28 : 20, height: active ? 28 : 20, borderRadius: "50%", flexShrink: 0, transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", background: done ? D.green : active ? D.purple : D.border, border: active ? `2px solid ${D.purpleMid}` : "none", fontSize: active ? 10 : 8, color: done || active ? "#fff" : D.dim, boxShadow: active ? `0 0 12px ${D.purpleGlow}` : "none" }}>
                {done ? "✓" : s.icon}
              </div>
              {i < STEPS.length - 1 && <div style={{ width: 16, height: 1, background: done ? D.green : D.border }} />}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: D.dim, textAlign: "center" }}>Etapa {currentIdx + 1} de {STEPS.length} — use o painel direito ou a topbar para continuar</div>
    </div>
  );
}

// ─── P1-10: ProgressOverlay ───────────────────────────────────────────────────

function ProgressOverlay({ stage, elapsedSeconds, isRecovering }: { stage: string | null; elapsedSeconds: number; isRecovering: boolean }) {
  const mm = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const ss = (elapsedSeconds % 60).toString().padStart(2, "0");
  const label = isRecovering ? "Verificando render em andamento…" : (stage ?? "Processando…");
  return (
    <div role="status" aria-live="polite" style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: D.overlay, gap: 16 }}>
      <DkSpinner size={48} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: D.text, marginBottom: 6 }}>{label}</div>
        {!isRecovering && <><div style={{ fontSize: 12, color: D.muted, marginBottom: 8 }}>{elapsedSeconds < 30 ? "Estimativa: 30–90 segundos" : elapsedSeconds < 90 ? "Processando — aguarde" : "Finalizando (processo lento)"}</div><div style={{ fontSize: 11, color: D.dim }}>⏱ {mm}:{ss} decorridos</div></>}
      </div>
      {!isRecovering && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {["Preparando", "Enviando", "Gerando", "Salvando"].map((s, i) => {
            const thresholds = [0, 3, 8, 999]; const done = elapsedSeconds > thresholds[i];
            return (<div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: done ? D.green : D.dim }} /><span style={{ fontSize: 9, color: done ? D.green : D.dim }}>{s}</span></div>);
          })}
        </div>
      )}
    </div>
  );
}

// ─── P2-13: SelectionCanvas overlay ──────────────────────────────────────────

function SelectionCanvas({ isActive, renderUrl, onSelection, existingSelections, onClearSelection }: {
  isActive: boolean;
  renderUrl: string;
  onSelection: (sel: Omit<SelectionRect, "id" | "label">) => void;
  existingSelections: SelectionRect[];
  onClearSelection: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number }>({ active: false, startX: 0, startY: 0 });
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Redraw canvas on changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing selections
    existingSelections.forEach((sel) => {
      const x = (sel.x / 100) * canvas.width;
      const y = (sel.y / 100) * canvas.height;
      const w = (sel.w / 100) * canvas.width;
      const h = (sel.h / 100) * canvas.height;
      ctx.fillStyle = "rgba(124,58,237,0.15)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#7C3AED";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#A78BFA";
      ctx.font = "bold 11px system-ui";
      ctx.fillText(sel.label || "Seleção", x + 6, y + 16);
    });

    // Draw current drag rect
    if (currentRect) {
      const x = (currentRect.x / 100) * canvas.width;
      const y = (currentRect.y / 100) * canvas.height;
      const w = (currentRect.w / 100) * canvas.width;
      const h = (currentRect.h / 100) * canvas.height;
      ctx.fillStyle = "rgba(124,58,237,0.12)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#7C3AED";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, w, h);
    }
  }, [currentRect, existingSelections]);

  function getRelativeCoords(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isActive) return;
    const pos = getRelativeCoords(e);
    dragRef.current = { active: true, startX: pos.x, startY: pos.y };
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isActive || !dragRef.current.active) return;
    const pos = getRelativeCoords(e);
    const { startX, startY } = dragRef.current;
    setCurrentRect({ x: Math.min(startX, pos.x), y: Math.min(startY, pos.y), w: Math.abs(pos.x - startX), h: Math.abs(pos.y - startY) });
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isActive || !dragRef.current.active) return;
    const pos = getRelativeCoords(e);
    const { startX, startY } = dragRef.current;
    dragRef.current.active = false;
    const w = Math.abs(pos.x - startX); const h = Math.abs(pos.y - startY);
    // Minimum selection size (5% of image)
    if (w > 2 && h > 2) {
      onSelection({ x: Math.min(startX, pos.x), y: Math.min(startY, pos.y), w, h });
    }
    setCurrentRect(null);
  }

  // Resize canvas to match container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(([entry]) => {
      canvas.width  = entry.contentRect.width;
      canvas.height = entry.contentRect.height;
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, pointerEvents: isActive ? "auto" : "none" }}>
      <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: isActive ? "crosshair" : "default" }} />
      {isActive && existingSelections.length === 0 && !currentRect && (
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", padding: "6px 14px", borderRadius: 20, background: `${D.surface}EE`, border: `1px solid ${D.purple}`, fontSize: 11, color: D.purpleText, pointerEvents: "none", whiteSpace: "nowrap" }}>
          Arraste para selecionar a região a alterar
        </div>
      )}
    </div>
  );
}

// ─── P2-19: Comparison view ───────────────────────────────────────────────────

function ComparisonView({ versionA, versionB, allVersions, onChangeA, onChangeB }: {
  versionA: RenderVersion; versionB: RenderVersion;
  allVersions: RenderVersion[];
  onChangeA: (id: string) => void; onChangeB: (id: string) => void;
}) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 15, background: "#03050A", display: "flex", flexDirection: "column" }}>
      {/* Pickers */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: `${D.surface}EE`, borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: D.dim }}>Comparar:</span>
        <select value={versionA.id} onChange={(e) => onChangeA(e.target.value)} aria-label="Versão A" style={{ ...inputStyle, width: 200 }}>
          {allVersions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <span style={{ fontSize: 10, color: D.dim }}>vs</span>
        <select value={versionB.id} onChange={(e) => onChangeB(e.target.value)} aria-label="Versão B" style={{ ...inputStyle, width: 200 }}>
          {allVersions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </div>
      {/* Side by side */}
      <div style={{ flex: 1, display: "flex", gap: 0, overflow: "hidden" }}>
        {[versionA, versionB].map((v, i) => (
          <div key={v.id} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: i === 0 ? `1px solid ${D.border}` : "none" }}>
            <div style={{ padding: "6px 12px", background: `${D.surface}CC`, borderBottom: `1px solid ${D.border}`, fontSize: 10, fontWeight: 700, color: i === 0 ? D.purpleText : D.green, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ padding: "1px 6px", borderRadius: 4, background: i === 0 ? `${D.purple}33` : `${D.green}33`, border: `1px solid ${i === 0 ? D.purple : D.green}44` }}>{i === 0 ? "A" : "B"}</span>
              {v.label}
              {v.approvedBy && <span style={{ marginLeft: "auto", fontSize: 9, color: D.green }}>✓ Aprovado</span>}
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 12 }}>
              <img src={normalizeRenderMediaUrl(v.url)} alt={v.label} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
            {/* P2-19: diff summary */}
            {v.operationType !== "initial" && (
              <div style={{ padding: "6px 12px", background: `${D.surface}CC`, borderTop: `1px solid ${D.border}`, fontSize: 10, color: D.muted, flexShrink: 0 }}>
                Operação: <strong style={{ color: D.text }}>{v.operationType === "material" ? "Troca de Material" : v.operationType === "lighting" ? "Ajuste de Iluminação" : "Melhoria Geral"}</strong>
                {v.materialName && <> · Material: <strong style={{ color: D.purpleText }}>{v.materialName}</strong></>}
                {v.selectionLabel && <> · Região: {v.selectionLabel}</>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Central Canvas (P0-3, P0-6, P1-8, P1-10, P2-13, P2-19) ─────────────────

export function RenderStudioCanvas({ step, imageDataUrl, renderUrl, loading, isDragging, canvasMode, showGrid, processingStage, elapsedSeconds, isRecovering, onUpload, onDragOver, onDragLeave, onDrop, projectTitle, ambiente, selectionMode, selections, onSelection, onClearSelection, compareMode, compareVersionA, compareVersionB, allVersions, onCompareChangeA, onCompareChangeB, onRenderLoadError }: {
  step: Step; imageDataUrl: string | null; renderUrl: string | null;
  loading: boolean; isDragging: boolean; canvasMode: CanvasMode; showGrid: boolean;
  processingStage: string | null; elapsedSeconds: number; isRecovering: boolean;
  onUpload: () => void; onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void;
  projectTitle: string | null; ambiente: string;
  selectionMode: "off" | "rect"; selections: SelectionRect[]; onSelection: (sel: Omit<SelectionRect, "id" | "label">) => void; onClearSelection: () => void;
  compareMode: boolean; compareVersionA: RenderVersion | null; compareVersionB: RenderVersion | null;
  allVersions: RenderVersion[]; onCompareChangeA: (id: string) => void; onCompareChangeB: (id: string) => void;
  onRenderLoadError: () => void;
}) {
  const beforeRenderStep = stepIndex(step) < stepIndex("render");
  const showRender  = !beforeRenderStep && !!renderUrl;
  const showUpload  = step === "imagem";
  const showImage   = !beforeRenderStep && step !== "imagem" && (showRender || !!imageDataUrl);
  const displayUrl  = showRender ? renderUrl : imageDataUrl;
  const showFlowGuide = (step === "projeto" || step === "ambiente") && !loading;

  const imageStyle: React.CSSProperties = canvasMode === "1to1"
    ? { width: "auto", height: "auto", maxWidth: "none", maxHeight: "none", boxShadow: "0 8px 64px rgba(0,0,0,0.6)" }
    : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" as const, boxShadow: "0 8px 64px rgba(0,0,0,0.6)" };

  return (
    <div className="arqdor-center-panel" style={{ flex: 1, overflow: "hidden", position: "relative", background: D.bg, display: "flex", flexDirection: "column" }}>
      {/* P0-6: view controls */}
      <div className="arqdor-canvas-toolbar" style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", gap: 4, background: `${D.surface}EE`, border: `1px solid ${D.border}`, borderRadius: 8, padding: "4px" }}>
        {(["1:1", "Ajustar", "Grade"] as const).map((label) => {
          const isActive = (label === "1:1" && canvasMode === "1to1") || (label === "Ajustar" && canvasMode === "fit") || (label === "Grade" && showGrid);
          return (
            <button key={label} data-canvas-action={label} title={label === "1:1" ? "Escala real" : label === "Ajustar" ? "Enquadrar na tela" : "Grade de referência"} aria-pressed={isActive}
              style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: isActive ? `${D.purple}33` : "none", color: isActive ? D.purpleText : D.muted, border: isActive ? `1px solid ${D.purple}55` : "none", cursor: "pointer" }}>
              {label}
            </button>
          );
        })}
        {/* P2-13: selection mode toggle — available when render exists */}
        {showRender && (
          <button data-canvas-action="Selecionar" title={selectionMode === "rect" ? "Cancelar seleção (Esc)" : "Selecionar região para editar"} aria-pressed={selectionMode === "rect"}
            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: selectionMode === "rect" ? `${D.amber}33` : "none", color: selectionMode === "rect" ? D.amber : D.muted, border: selectionMode === "rect" ? `1px solid ${D.amber}55` : "none", cursor: "pointer" }}>
            ⬚ {selectionMode === "rect" ? "Selecionando…" : "Selecionar"}
          </button>
        )}
        {/* P2-19: Comparar — ativo quando 2+ versões */}
        {allVersions.length >= 2 ? (
          <button data-canvas-action="Comparar" title="Comparar versões lado a lado" aria-pressed={compareMode}
            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: compareMode ? `${D.green}33` : "none", color: compareMode ? D.green : D.muted, border: compareMode ? `1px solid ${D.green}55` : "none", cursor: "pointer" }}>
            Comparar
          </button>
        ) : (
          <button title="Comparação — disponível após gerar 2 versões" aria-disabled="true" tabIndex={-1} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, color: D.dim, border: "none", cursor: "default", opacity: 0.35 }}>Comparar</button>
        )}
      </div>

      {/* P0-6: grid overlay */}
      {showGrid && showImage && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none", backgroundImage: `linear-gradient(${D.border}66 1px, transparent 1px), linear-gradient(90deg, ${D.border}66 1px, transparent 1px)`, backgroundSize: "48px 48px" }} />
      )}

      {/* P2-19: comparison view */}
      {compareMode && compareVersionA && compareVersionB && (
        <ComparisonView versionA={compareVersionA} versionB={compareVersionB} allVersions={allVersions} onChangeA={onCompareChangeA} onChangeB={onCompareChangeB} />
      )}

      {/* Main area */}
      {!compareMode && (
        <div className="arqdor-canvas-stage" style={{ flex: 1, display: "flex", alignItems: canvasMode === "1to1" ? "flex-start" : "center", justifyContent: canvasMode === "1to1" ? "flex-start" : "center", overflow: canvasMode === "1to1" ? "auto" : "hidden", position: "relative", padding: canvasMode === "1to1" ? 24 : 0, outline: isDragging ? `2px dashed ${D.purple}` : undefined, transition: "outline 0.15s" }}
          onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
          {(loading || isRecovering) && <ProgressOverlay stage={processingStage} elapsedSeconds={elapsedSeconds} isRecovering={isRecovering} />}
          {isDragging && (
            <div style={{ position: "absolute", inset: 0, zIndex: 25, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `${D.purple}18`, gap: 12, pointerEvents: "none" }}>
              <div style={{ fontSize: 36, color: D.purple }}>⬜</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: D.purpleText }}>Solte a imagem aqui</div>
            </div>
          )}
          {showFlowGuide && !isDragging && <FlowGuide step={step} projectTitle={projectTitle} ambiente={ambiente} />}
          {/* Image + P2-13 selection canvas */}
          {showImage && displayUrl && !isDragging && (
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: canvasMode === "1to1" ? "auto" : "100%", height: canvasMode === "1to1" ? "auto" : "100%" }}>
              <img
                src={normalizeRenderMediaUrl(displayUrl)}
                alt={renderUrl ? "render gerado" : "imagem base"}
                style={imageStyle}
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  el.parentElement?.setAttribute("data-render-load-error", "true");
                  if (showRender) onRenderLoadError();
                }}
              />
              {renderUrl && (
                <div style={{ position: "absolute", inset: 0, display: "none", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: D.red, fontSize: 12, pointerEvents: "none" }}
                  ref={(el) => {
                    if (!el) return;
                    const parent = el.parentElement;
                    const sync = () => { el.style.display = parent?.getAttribute("data-render-load-error") === "true" ? "flex" : "none"; };
                    sync();
                  }}>
                  <strong>Imagem do render indisponível</strong>
                  <span style={{ color: D.muted }}>O arquivo não foi encontrado no Storage.</span>
                </div>
              )}
              {showRender && (
                <SelectionCanvas isActive={selectionMode === "rect"} renderUrl={renderUrl} onSelection={onSelection} existingSelections={selections} onClearSelection={onClearSelection} />
              )}
            </div>
          )}
          {showUpload && !loading && !isDragging && (
            <div className="arqdor-upload-card" onClick={onUpload} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} role="button" tabIndex={0} aria-label="Carregar imagem — clique ou arraste" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onUpload(); }}
              style={{ border: `2px dashed ${imageDataUrl ? D.purple : D.border}`, borderRadius: 16, padding: "48px 40px", cursor: "pointer", background: imageDataUrl ? `${D.purple}08` : `${D.card}88`, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, transition: "all 0.2s", maxWidth: 420, width: "100%" }}>
              {imageDataUrl ? (
                <><img src={imageDataUrl} alt="base" style={{ maxHeight: 260, maxWidth: "100%", borderRadius: 10, objectFit: "contain" }} /><span style={{ fontSize: 11, color: D.purpleText, fontWeight: 600 }}>Clique ou arraste para trocar</span></>
              ) : (
                <><div style={{ width: 64, height: 64, borderRadius: 16, background: `${D.purple}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: D.purple }}>⬜</div>
                  <div style={{ textAlign: "center" }}><div style={{ fontSize: 15, fontWeight: 700, color: D.text, marginBottom: 6 }}>Carregar imagem do ambiente</div><div style={{ fontSize: 12, color: D.muted }}>JPG, PNG, WEBP — máx. 10 MB<br />Clique ou arraste aqui</div></div></>
              )}
            </div>
          )}
          {!showFlowGuide && !showImage && !showUpload && !loading && !isDragging && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, color: D.dim }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>✦</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: D.muted }}>Aguardando imagem base</div>
            </div>
          )}
        </div>
      )}

      {/* P2-13: selection toolbar when active */}
      {selectionMode === "rect" && selections.length > 0 && (
        <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 30, background: `${D.surface}EE`, border: `1px solid ${D.amber}`, borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: D.amber }}>⬚ {selections.length} região(ões) selecionada(s)</span>
          <button onClick={onClearSelection} style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "transparent", color: D.muted, border: `1px solid ${D.border}`, cursor: "pointer" }}>Limpar</button>
        </div>
      )}

      {/* P2-22: download render button */}
      {showRender && !loading && !compareMode && (
        <div style={{ position: "absolute", bottom: 12, right: 12, zIndex: 30 }}>
          <a href={renderUrl} target="_blank" rel="noopener noreferrer" download="render-arqdor.jpg"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, background: `${D.surface}EE`, border: `1px solid ${D.border}`, fontSize: 10, fontWeight: 700, color: D.muted, textDecoration: "none", cursor: "pointer" }}>
            ⬇ Baixar render
          </a>
        </div>
      )}
    </div>
  );
}


