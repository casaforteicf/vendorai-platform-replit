import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { useLocation } from "wouter";
import { useArqProject } from "@/modules/arqdor/hooks/useArqProject";
import { useAuth } from "@/contexts/AuthContext";
import { mediaAssetUrl, type MediaPickerAsset } from "@/components/media/MediaAssetPicker";
import type {
  RenderStudioStep as Step,
  RenderStudioCanvasMode as CanvasMode,
  RenderStudioSelectionRect as SelectionRect,
  RenderStudioVersion as RenderVersion,
  RenderStudioEventLogEntry as EventLogEntry,
  RenderStudioPreset as RenderPreset,
  RenderStudioVideoMovement as VideoMovement,
  RenderStudioImprovementMode,
  RenderStudioSceneType,
  RenderStudioProfile,
  RenderStudioVisualStyle,
  RenderStudioLightingProfile,
  RenderStudioCatalogItem as CatalogItem,
  RenderStudioApprovalRecord as ApprovalRecord,
} from "./renderStudioModel";
import { RENDER_STUDIO_STEPS as STEPS, renderStudioStepIndex as stepIndex } from "./renderStudioModel";
import type { RenderStudioSaveState as SaveState } from "./RenderStudioFooter";
import {
  RENDER_STAGES,
  categorizeRenderError as categorizeError,
  normalizeRenderMediaUrl,
  renderApiGet as apiGet,
  renderApiPatch as apiPatch,
  renderApiPost as apiPost,
  renderFileToDataUrl as fileToDataUrl,
  waitForRenderCompletion,
  waitForRenderVideoCompletion as waitForVideoCompletion,
} from "./renderStudioApi";

const SK = {
  step: "arq_studio_step",
  ambiente: "arq_studio_ambiente",
  renderId: "arq_studio_renderId",
  renderUrl: "arq_studio_renderUrl",
  versions: "arq_studio_versions",
  imageUrl: "arq_studio_imageDataUrl",
  context: "arq_studio_context",
} as const;

function normalizeRenderVersion(version: RenderVersion): RenderVersion {
  const normalizedUrl = normalizeRenderMediaUrl(version.url);
  return {
    ...version,
    url: normalizedUrl || version.url,
    createdAt: version.createdAt instanceof Date ? version.createdAt : new Date(version.createdAt),
    approvedAt: version.approvedAt
      ? (version.approvedAt instanceof Date ? version.approvedAt : new Date(version.approvedAt))
      : undefined,
  };
}

export function useRenderStudioController() {

  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const arq = useArqProject();

  // Core
  const [step, setStep] = useState<Step>("projeto");
  const [ambiente, setAmbiente] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [versions, setVersions] = useState<RenderVersion[]>([]);
  const [approved, setApproved] = useState(false);
  const [specDone, setSpecDone] = useState(false);
  const [specData, setSpecData] = useState<any[]>([]);
  const [specificationId, setSpecificationId] = useState<string | null>(null);
  const [enviandoOrcamento, setEnviandoOrcamento] = useState(false);
  const [orcamentoMsg, setOrcamentoMsg] = useState<string | null>(null);
  const [areaM2, setAreaM2] = useState<string>("");
  const [peDireitoM, setPeDireitoM] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [melhoriaPrompt, setMelhoriaPrompt] = useState("");
  const [melhoriaMode, setMelhoriaMode] = useState<RenderStudioImprovementMode>("improve");
  const [sceneType, setSceneType] = useState<RenderStudioSceneType>("interior");
  const [renderProfile, setRenderProfile] = useState<RenderStudioProfile>("premium");
  const [visualStyle, setVisualStyle] = useState<RenderStudioVisualStyle>("original");
  const [lightingProfile, setLightingProfile] = useState<RenderStudioLightingProfile>("natural");
  const [videoMovement, setVideoMovement] = useState<VideoMovement>("cinematic_micro_movement");
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [renderVideoUrl, setRenderVideoUrl] = useState<string | null>(null);

  // P0/P1 modals & UI
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("fit");
  const [showGrid, setShowGrid] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [pendingNavStep, setPendingNavStep] = useState<Step | null>(null);
  const [processingStage, setProcessingStage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);

  useEffect(() => {
    if (step === "versao" && !bottomPanelOpen) setBottomPanelOpen(true);
  }, [step, bottomPanelOpen]);

  useEffect(() => {
    const value = ambiente.toLowerCase();
    if (/piscina|spa/.test(value)) setSceneType("pool");
    else if (/gourmet|churras/.test(value)) setSceneType("gourmet");
    else if (/fachada/.test(value)) setSceneType("facade");
    else if (/extern|varanda|terraço|terraco|deck|jardim/.test(value)) setSceneType("outdoor");
    else if (value.trim()) setSceneType("interior");
  }, [ambiente]);

  // P2 state
  const [selectionMode, setSelectionMode] = useState<"off" | "rect">("off");
  const [selections, setSelections] = useState<SelectionRect[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<CatalogItem | null>(null);
  const [showMaterialLib, setShowMaterialLib] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [materialMaskPreviewUrl, setMaterialMaskPreviewUrl] = useState<string | null>(null);
  const [materialMaskDataUrl, setMaterialMaskDataUrl] = useState<string | null>(null);
  const [materialMaskConfirmed, setMaterialMaskConfirmed] = useState(false);
  const [materialMaskDetecting, setMaterialMaskDetecting] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersionAId, setCompareVersionAId] = useState<string | null>(null);
  const [compareVersionBId, setCompareVersionBId] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalRecord, setApprovalRecord] = useState<ApprovalRecord | null>(null);

  const materialMaskRequestSeqRef = useRef(0);

  async function detectMaterialSurfaceFor(rects: SelectionRect[]) {
    if (!renderId || rects.length === 0) return;

    const requestSeq = ++materialMaskRequestSeqRef.current;
    setMaterialMaskDetecting(true);
    setMaterialMaskConfirmed(false);
    setErr(null);

    try {
      const data = await apiPost(`/api/arch/ai-render/${renderId}/material-mask-preview`, {
        mask_coordinates: rects.slice(-1).map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
      });

      // Se a seleção mudou durante a detecção, ignora a resposta antiga.
      if (requestSeq !== materialMaskRequestSeqRef.current) return;

      setMaterialMaskPreviewUrl(data.preview_data_url ?? null);
      setMaterialMaskDataUrl(data.mask_file_base64 ?? null);
      setSelections(prev => prev.map((sel, index) =>
        index === prev.length - 1
          ? { ...sel, label: "Face detectada automaticamente" }
          : sel
      ));
      logEvent("material_surface_detected", `Face detectada automaticamente · cobertura ${Math.round(Number(data.coverage ?? 0) * 1000) / 10}%`);
    } catch (e: unknown) {
      if (requestSeq !== materialMaskRequestSeqRef.current) return;
      setMaterialMaskPreviewUrl(null);
      setMaterialMaskDataUrl(null);
      setMaterialMaskConfirmed(false);
      setErr(categorizeError(e));
    } finally {
      if (requestSeq === materialMaskRequestSeqRef.current) {
        setMaterialMaskDetecting(false);
      }
    }
  }

  useEffect(() => {
    // Qualquer mudança na seleção invalida a máscara já detectada/confirmada
    // e também invalida imediatamente qualquer resposta de detecção em voo.
    materialMaskRequestSeqRef.current += 1;
    setMaterialMaskPreviewUrl(null);
    setMaterialMaskDataUrl(null);
    setMaterialMaskConfirmed(false);

    // Troca de material: terminou de marcar/mover/redimensionar a semente,
    // detecta a superfície automaticamente. O debounce evita chamadas durante
    // o arraste e deixa somente a posição final da seleção chegar ao backend.
    if (melhoriaMode !== "change-material" || !renderId || selections.length === 0) return;

    const snapshot = selections.map(s => ({ ...s }));
    const timer = window.setTimeout(() => {
      void detectMaterialSurfaceFor(snapshot);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [selections, melhoriaMode, renderId]);

  // P3-28: event log
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  function logEvent(type: string, label: string) {
    setEventLog(prev => [...prev, { id: crypto.randomUUID(), type, label, timestamp: new Date() }]);
  }

  // P3-24: copilot test action handler
  function handleTestCopilotAction(prompt: string) {
    setMelhoriaPrompt(prompt);
    if (step !== "melhoria") go("melhoria");
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const userName = (user as any)?.name ?? (user as any)?.email ?? "Usuário";
  const tenantId = (user as any)?.tenantId ?? "";

  // Derived comparison versions
  const compareVersionA = versions.find(v => v.id === compareVersionAId) ?? versions[0] ?? null;
  const compareVersionB = versions.find(v => v.id === compareVersionBId) ?? versions[1] ?? null;

  // When comparison mode activates, default A/B to first two versions
  useEffect(() => {
    if (compareMode && versions.length >= 2) {
      if (!compareVersionAId) setCompareVersionAId(versions[0].id);
      if (!compareVersionBId) setCompareVersionBId(versions[1].id);
    }
  }, [compareMode, versions]);

  // Save state sync
  const prevSavingRef = useRef(false);
  useEffect(() => {
    if (arq.saving && !prevSavingRef.current) setSaveState("saving");
    else if (!arq.saving && prevSavingRef.current) { setSaveState("saved"); setLastSavedAt(new Date()); }
    prevSavingRef.current = arq.saving;
  }, [arq.saving]);

  async function withRecoveryTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Tempo limite ao recuperar o render.")), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  // Session restore / deep-link bootstrap.
  // IMPORTANT: an explicit render_id in the URL is authoritative. This prevents
  // a previously opened session (or another project in localStorage) from
  // replacing the render the user clicked in the project gallery.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRenderId = params.get("render_id")?.trim() || null;
    const requestedProjectId = params.get("project_id")?.trim() || null;
    const requestedAmbiente = params.get("ambiente")?.trim() || "";
    const isNewRender = params.get("new") === "1";

    if (requestedAmbiente) setAmbiente(requestedAmbiente);

    // Um deep-link de projeto deve restaurar o contexto mesmo sem render_id.
    // Isso evita abrir o Studio com ambiente conhecido e "Nenhum projeto".
    if (requestedProjectId && arq.projectId !== requestedProjectId) {
      void withRecoveryTimeout(arq.selectProject(requestedProjectId), 8000).catch((e: unknown) => {
        setErr(categorizeError(e));
      });
    }

    if (isNewRender) {
      setRenderId(null);
      setRenderUrl(null);
      setVersions([]);
      setApproved(false);
      setApprovalRecord(null);
      setImageDataUrl(null);
      sessionStorage.removeItem(SK.renderId);
      sessionStorage.removeItem(SK.renderUrl);
      sessionStorage.removeItem(SK.versions);
      sessionStorage.removeItem(SK.imageUrl);
    }

    if (requestedRenderId && !isNewRender) {
      let cancelled = false;
      setIsRecovering(true);
      setErr(null);

      const openExistingRender = async () => {
        try {
          const current = await withRecoveryTimeout(
            apiGet(`/api/arch/ai-render/${encodeURIComponent(requestedRenderId)}`),
            8000,
          );
          if (cancelled) return;

          const projectId = String(current.project_id ?? requestedProjectId ?? "").trim();
          const ambienteValue = requestedAmbiente || String(current.ambiente ?? "").trim().replace(/_/g, " ");
          if (ambienteValue) setAmbiente(ambienteValue);

          if (projectId && arq.projectId !== projectId) {
            await withRecoveryTimeout(arq.selectProject(projectId), 8000);
            if (cancelled) return;
          }

          const currentUrl = normalizeRenderMediaUrl(current.display_url || current.result_image_url || current.original_image_url || "");
          if (!currentUrl) throw new Error("Este render não possui imagem disponível.");

          let loadedVersions: RenderVersion[] = [];
          if (projectId) {
            try {
              const history = await apiGet(
                `/api/arch/ai-renders?project_id=${encodeURIComponent(projectId)}${current.ambiente ? `&ambiente=${encodeURIComponent(String(current.ambiente))}` : ""}`,
              );
              const rows = Array.isArray(history?.versions) ? history.versions : [];
              loadedVersions = rows
                .filter((item: any) => item?.result_image_url || item?.original_image_url)
                .map((item: any, index: number): RenderVersion => ({
                  id: String(item.id),
                  url: normalizeRenderMediaUrl(item.result_image_url || item.original_image_url),
                  label: `Versão ${Number(item.version_number ?? index + 1)}${item.approved_at ? " · Aprovada" : ""}`,
                  parentVersionId: item.parent_render_id ?? undefined,
                  operationType: item.approved_at ? "approved" : (item.parent_render_id ? "improve" : "initial"),
                  createdAt: item.created_at ? new Date(item.created_at) : new Date(),
                  approvedBy: item.approved_by ?? undefined,
                  approvedAt: item.approved_at ? new Date(item.approved_at) : undefined,
                }))
                .reverse();
            } catch {
              // O render atual continua abrindo mesmo que o histórico esteja indisponível.
            }
          }

          const currentVersion: RenderVersion = {
            id: requestedRenderId,
            url: currentUrl,
            label: current.approved_at ? "Versão selecionada · Aprovada" : "Versão selecionada",
            parentVersionId: current.parent_render_id ?? undefined,
            operationType: current.approved_at ? "approved" : (current.parent_render_id ? "improve" : "initial"),
            createdAt: current.created_at ? new Date(current.created_at) : new Date(),
            approvedBy: current.approved_by ?? undefined,
            approvedAt: current.approved_at ? new Date(current.approved_at) : undefined,
          };

          if (!loadedVersions.some((item) => item.id === requestedRenderId)) {
            loadedVersions = [currentVersion, ...loadedVersions];
          }

          setRenderId(requestedRenderId);
          setRenderUrl(currentUrl);
          setImageDataUrl(normalizeRenderMediaUrl(current.original_image_url || currentUrl));
          setVersions(loadedVersions.length ? loadedVersions : [currentVersion]);
          setApproved(Boolean(current.approved_at || current.approved_by));
          setApprovalRecord(
            current.approved_at || current.approved_by
              ? {
                  by: current.approved_by ?? "usuário autenticado",
                  at: current.approved_at ? new Date(current.approved_at) : new Date(),
                  note: "",
                }
              : null,
          );

          // Render existente abre na execução/edição do próprio render, nunca
          // na etapa de selecionar/criar projeto e nunca inicia uma nova geração.
          setStep("melhoria");
          setBottomPanelOpen(loadedVersions.length > 1);
          setSaveState("saved");
          setLastSavedAt(new Date());

          sessionStorage.setItem(SK.renderId, requestedRenderId);
          sessionStorage.setItem(SK.renderUrl, currentUrl);
          sessionStorage.setItem(SK.imageUrl, normalizeRenderMediaUrl(current.original_image_url || currentUrl));
          sessionStorage.setItem(SK.versions, JSON.stringify(loadedVersions.length ? loadedVersions : [currentVersion]));
          sessionStorage.setItem(SK.step, "melhoria");
        } catch (e: unknown) {
          if (!cancelled) setErr(categorizeError(e));
        } finally {
          if (!cancelled) setIsRecovering(false);
        }
      };

      void openExistingRender();
      return () => { cancelled = true; };
    }

    const cachedProjectId = requestedProjectId || localStorage.getItem("arq_last_project_id") || "no-project";
    const cachedAmbiente = requestedAmbiente || sessionStorage.getItem(SK.ambiente) || "";
    const expectedCacheContext = `${cachedProjectId}:${cachedAmbiente}`;
    const cacheMatchesContext = sessionStorage.getItem(SK.context) === expectedCacheContext;

    const ss = cacheMatchesContext ? sessionStorage.getItem(SK.step) : null;
    const sa = cacheMatchesContext ? sessionStorage.getItem(SK.ambiente) : null;
    const sri = cacheMatchesContext ? sessionStorage.getItem(SK.renderId) : null;
    const sru = cacheMatchesContext ? sessionStorage.getItem(SK.renderUrl) : null;
    const sv = cacheMatchesContext ? sessionStorage.getItem(SK.versions) : null;
    const siu = cacheMatchesContext ? sessionStorage.getItem(SK.imageUrl) : null;

    if (sa)  setAmbiente(sa);
    if (sri) setRenderId(sri);
    if (sru) setRenderUrl(normalizeRenderMediaUrl(sru));
    if (sv)  try {
      const restored = JSON.parse(sv) as RenderVersion[];
      const normalized = Array.isArray(restored) ? restored.map(normalizeRenderVersion) : [];
      setVersions(normalized);
      const approvedVersion = normalized.find((version) => Boolean(version.approvedBy && version.approvedAt) || version.operationType === "approved");
      if (approvedVersion) {
        const approvedAt = approvedVersion.approvedAt ? new Date(approvedVersion.approvedAt) : new Date();
        setApproved(true);
        setApprovalRecord({
          by: approvedVersion.approvedBy ?? "usuário autenticado",
          at: approvedAt,
          note: approvedVersion.approvalNote ?? "",
        });
        if (ss === "especificacao") setStep("aprovar");
      }
    } catch {}
    if (siu) setImageDataUrl(siu);
    if (ss === "especificacao") setStep("aprovar");
    else if (ss && STEPS.some((item) => item.id === ss)) setStep(ss as Step);
    // P1-11: orphan job recovery.
    // Nunca bloqueia a interface indefinidamente: a consulta tem timeout e,
    // quando encontra o render, também restaura projeto + ambiente.
    if (sri && !sru) {
      let recoveryCancelled = false;
      setIsRecovering(true);

      void withRecoveryTimeout(apiGet(`/api/arch/ai-render/${encodeURIComponent(sri)}`), 8000)
        .then(async (data) => {
          if (recoveryCancelled) return;

          const recoveredProjectId = String(data.project_id ?? requestedProjectId ?? "").trim();
          const recoveredAmbiente = requestedAmbiente || String(data.ambiente ?? "").trim().replace(/_/g, " ");

          if (recoveredAmbiente) setAmbiente(recoveredAmbiente);

          if (recoveredProjectId && arq.projectId !== recoveredProjectId) {
            try {
              await withRecoveryTimeout(arq.selectProject(recoveredProjectId), 8000);
            } catch {
              // Falha ao selecionar o projeto não pode manter o Studio travado.
            }
          }

          if (recoveryCancelled) return;

          if (data.status === "concluido" && data.file_available !== false && (data.display_url || data.result_image_url)) {
            const recoveredUrl = normalizeRenderMediaUrl(data.display_url || data.result_image_url);
            setRenderUrl(recoveredUrl);
            const v: RenderVersion = { id: sri, url: recoveredUrl, label: "Versão 1 · Original", operationType: "initial", createdAt: new Date() };
            setVersions([v]);
            sessionStorage.setItem(SK.renderUrl, recoveredUrl);
            setSaveState("saved");
            setLastSavedAt(new Date());
            setStep("melhoria");
          } else {
            // O job não está utilizável: limpa somente a referência órfã e libera o fluxo.
            setRenderId(null);
            sessionStorage.removeItem(SK.renderId);
          }
        })
        .catch(() => {
          if (recoveryCancelled) return;
          setRenderId(null);
          sessionStorage.removeItem(SK.renderId);
        })
        .finally(() => {
          if (!recoveryCancelled) setIsRecovering(false);
        });

      return () => {
        recoveryCancelled = true;
      };
    }
  }, []);

  useEffect(() => { sessionStorage.setItem(SK.step, step); }, [step]);
  useEffect(() => {
    if (ambiente) sessionStorage.setItem(SK.ambiente, ambiente);
    else sessionStorage.removeItem(SK.ambiente);
    window.dispatchEvent(new CustomEvent("arqdor:render-context", { detail: { ambiente } }));
  }, [ambiente]);
  useEffect(() => {
    if (renderId) sessionStorage.setItem(SK.renderId, renderId);
    else sessionStorage.removeItem(SK.renderId);
  }, [renderId]);
  useEffect(() => {
    if (renderUrl) sessionStorage.setItem(SK.renderUrl, renderUrl);
    else sessionStorage.removeItem(SK.renderUrl);
  }, [renderUrl]);
  // O histórico oficial vive no backend. O array de versões não é mais
  // regravado continuamente no sessionStorage pelo controller; o cache legado
  // é usado somente como ponte de bootstrap/recovery na entrada do Studio.
  useEffect(() => {
    try {
      if (imageDataUrl) sessionStorage.setItem(SK.imageUrl, imageDataUrl);
      else sessionStorage.removeItem(SK.imageUrl);
    } catch {}
  }, [imageDataUrl]);

  // Elapsed time
  useEffect(() => {
    if (!loading) { setElapsedSeconds(0); return; }
    const i = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(i);
  }, [loading]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (showCreateModal || showHelp || showShortcuts || showMaterialLib) return;
      if (e.key === "?" || e.key === "F1") { e.preventDefault(); setShowHelp(true); }
      if (e.key === "Escape") { setSelectionMode("off"); setCompareMode(false); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showCreateModal, showHelp, showShortcuts, showMaterialLib]);

  const go = useCallback((s: Step) => { setErr(null); setStep(s); }, []);
  // Invariante do fluxo: projeto ativo nunca pode permanecer preso na etapa "projeto".
  // Incluímos `step` nas dependências porque a restauração da sessão pode reidratar
  // "projeto" depois que o projectId já foi carregado; sem isso o efeito não roda de novo.
  useEffect(() => {
    if (arq.projectId && step === "projeto") go("ambiente");
  }, [arq.projectId, step, go]);

  // Canvas control clicks (event delegation)
  function handleCanvasControlClick(e: MouseEvent<HTMLDivElement>) {
    const action = (e.target as HTMLElement).closest("[data-canvas-action]")?.getAttribute("data-canvas-action");
    if (!action) return;
    if (action === "Ajustar")    { setCanvasMode("fit"); setShowGrid(false); }
    if (action === "1:1")        { setCanvasMode("1to1"); }
    if (action === "Grade")      { setShowGrid(g => !g); }
    if (action === "Selecionar") { setSelectionMode(m => m === "rect" ? "off" : "rect"); }
    if (action === "Comparar")   { setCompareMode(m => !m); }
  }

  // Progress stages
  function startProgressStages() {
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [];
    RENDER_STAGES.forEach(({ label, afterMs }) => {
      const t = setTimeout(() => setProcessingStage(label), afterMs);
      stageTimersRef.current.push(t);
    });
    setProcessingStage(RENDER_STAGES[0].label);
  }
  function clearProgressStages() { stageTimersRef.current.forEach(clearTimeout); stageTimersRef.current = []; setProcessingStage(null); }

  // File handling
  async function handleFileSelect(file: File) {
    if (file.size > 10 * 1024 * 1024) { setErr("Arquivo muito grande. Máximo 10 MB."); return; }
    if (!file.type.startsWith("image/")) { setErr("Formato não suportado. Use JPG, PNG ou WEBP."); return; }
    setErr(null); setImageFile(file);
    const dataUrl = await fileToDataUrl(file);
    setImageDataUrl(dataUrl);
    if (step === "imagem") go("render");
  }
  function handleDragOver(e: DragEvent) { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }
  function handleDragLeave() { setIsDragging(false); }
  async function handleDrop(e: DragEvent) { e.preventDefault(); e.stopPropagation(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) await handleFileSelect(f); }
  function handleUpload() { fileRef.current?.click(); }

  function handleMediaLibraryConfirm(assets: MediaPickerAsset[]) {
    const asset = assets.find((item) => item.type === "image");
    if (!asset) return;
    const url = mediaAssetUrl(asset.storageUrl);
    setErr(null);
    setImageFile(null);
    setImageDataUrl(url);
    try { sessionStorage.setItem(SK.imageUrl, url); } catch {}
    logEvent("image_source_selected", "Imagem base selecionada da Biblioteca de Mídias");
    if (step === "imagem") go("render");
  }

  // Start render
  async function startRender() {
    if (!arq.projectId) { setErr("Selecione ou crie um projeto antes de gerar. Todo render precisa ficar vinculado a um projeto."); return; }
    if (!ambiente.trim()) { setErr("Selecione o ambiente antes de gerar o render."); return; }
    if (!imageDataUrl) { setErr("Carregue uma imagem antes de gerar o render."); return; }
    if (loading) return;
    const previousRenderId = renderId;
    const nextVersionNumber = versions.length + 1;
    setLoading(true); setErr(null); setRenderUrl(null); setRenderId(null); setSaveState("saving");
    startProgressStages();
    try {
      const renderPresets: RenderPreset[] = ["camera_perspective_lock"];
      if (sceneType === "interior") renderPresets.push("interior_layout_preserve");
      if (sceneType === "facade") renderPresets.push("facade_exterior_preserve", "roof_openings_lock");
      if (sceneType === "outdoor") renderPresets.push("facade_exterior_preserve", "landscape_controlled");
      if (sceneType === "gourmet") renderPresets.push("facade_exterior_preserve", "outdoor_gourmet_preserve");
      if (sceneType === "pool") renderPresets.push("facade_exterior_preserve", "pool_water_fidelity");
      if (renderProfile !== "technical") renderPresets.push("material_detail_enhancer", "lighting_realism");
      if (/vidro|espelho/.test(ambiente.toLowerCase())) renderPresets.push("glass_mirror_fidelity");
      if (lightingProfile === "night" && sceneType !== "interior") renderPresets.push("night_lighting_exterior");

      const styleInstruction: Record<RenderStudioVisualStyle, string> = {
        original: "Manter a linguagem visual e os materiais do projeto original.",
        contemporary: "Se houver decoração nova permitida, usar linguagem contemporânea discreta e coerente.",
        minimalist: "Se houver decoração nova permitida, usar composição minimalista, limpa e sem excesso de objetos.",
        provencal: "Se houver decoração nova permitida, usar acessórios provençais leves e elegantes sem alterar mobiliário, marcenaria ou acabamentos existentes.",
      };
      const profileInstruction: Record<RenderStudioProfile, string> = {
        technical: "Modo Técnico Fiel: não adicionar nenhum objeto decorativo; melhorar somente realismo, textura, luz e definição.",
        premium: "Modo Premium: resultado deve parecer uma fotografia arquitetônica profissional de um ambiente realmente construído, nunca CGI ou ilustração; máxima qualidade fotográfica sem adicionar, remover ou reposicionar objetos.",
        decorated: "Modo Premium Decorado: preservar absolutamente todos os elementos existentes; pode adicionar somente poucos acessórios decorativos pequenos em áreas livres, sem cobrir elementos, alterar circulação ou mudar mobiliário.",
      };
      const lightingInstruction: Record<RenderStudioLightingProfile, string> = {
        natural: "Iluminação natural suave e fisicamente plausível, mantendo as cores reais dos materiais.",
        balanced: "Iluminação equilibrada com apoio técnico no teto e boa leitura geral do ambiente.",
        more_light: "Aplicar versão com mais luz, reforçando iluminação arquitetônica no teto com barra/perfil de LED linear, abrindo sombras e aumentando a claridade geral sem alterar o projeto.",
        warm: "Iluminação aconchegante controlada, sem alterar a cor real dos materiais.",
        editorial: "Iluminação editorial arquitetônica equilibrada, com contraste elegante, bounce light e highlights controlados.",
        night: "Cena noturna fisicamente plausível; preservar geometria e materiais, alterando apenas a condição de iluminação.",
      };

      const lightingValue: Record<RenderStudioLightingProfile, string> = {
        natural: "day",
        balanced: "balanced interior architectural lighting",
        more_light: "bright interior architectural lighting with ceiling linear led",
        warm: "soft warm ambient lighting with controlled highlights",
        editorial: "premium editorial architectural lighting with soft directional contrast and realistic bounce light",
        night: "night",
      };

      const { render_id } = await apiPost("/api/arch/ai-render", {
        project_id: arq.projectId ?? undefined,
        original_image_url: imageDataUrl,
        mode: "preservar",
        ambiente: ambiente.toLowerCase().replace(/\s+/g, "_"),
        iluminacao: lightingValue[lightingProfile],
        render_view: sceneType === "interior" ? "interior" : "exterior",
        render_profile: renderProfile,
        render_presets: Array.from(new Set(renderPresets)),
        user_notes: [
          "Preservação rígida: manter exatamente cores, materiais, texturas-base, medidas, posição, orientação e proporções de todo mobiliário e marcenaria; manter câmera, perspectiva, layout, circulação e aberturas. O resultado final deve parecer uma fotografia arquitetônica real do ambiente construído, com microtexturas naturais, pequenas variações materiais, reflexos fisicamente plausíveis, sombras de contato reais e sem aparência de CGI, desenho, game engine, plástico ou HDR artificial.",
          sceneType === "interior" ? "Para interiores, considerar iluminação arquitetônica de teto com perfil/barra de LED linear como luz artificial principal, de modo coerente com o teto e sem alterar a geometria do projeto." : "",
          profileInstruction[renderProfile],
          styleInstruction[visualStyle],
          lightingInstruction[lightingProfile],
        ].join(" "),
      });
      setRenderId(render_id); setProcessingStage("Render Premium · preservando projeto e refinando materiais…");
      const data = await waitForRenderCompletion(render_id);
      setProcessingStage("Finalizando e salvando versão…");
      const v: RenderVersion = {
        id: render_id,
        url: normalizeRenderMediaUrl(data.result_image_url),
        label: versions.length === 0 ? "Versão 1 · Original" : `Versão ${nextVersionNumber} · Novo render`,
        operationType: "initial",
        parentVersionId: previousRenderId ?? undefined,
        createdAt: new Date(),
      };
      setRenderUrl(normalizeRenderMediaUrl(data.result_image_url));
      setVersions((current) => [v, ...current.filter((item) => item.id !== render_id)]);
      logEvent("render_created", `Render inicial gerado · ${ambiente}`);
      setSaveState("saved"); setLastSavedAt(new Date());
    } catch (e: unknown) { setErr(categorizeError(e)); setSaveState("error"); }
    finally { clearProgressStages(); setLoading(false); }
  }

  async function generateRenderVideo5s() {
    if (!renderId || videoGenerating) return;
    setVideoGenerating(true); setErr(null); setRenderVideoUrl(null);
    try {
      const created = await apiPost(`/api/arch/ai-render/${renderId}/video-5s`, {
        movement: videoMovement,
        aspect_ratio: "16:9",
      });
      const done = await waitForVideoCompletion(created.video_job_id);
      setRenderVideoUrl(done.video_url);
      logEvent("render_video_created", `Vídeo 5s gerado · ${videoMovement}`);
    } catch (e: unknown) {
      setErr(categorizeError(e));
    } finally {
      setVideoGenerating(false);
    }
  }

  async function detectMaterialSurface() {
    if (!renderId) { setErr("Gere ou selecione um render antes de detectar a superfície."); return; }
    if (selections.length === 0) {
      setErr("Selecione uma área da peça para detectar a superfície.");
      setSelectionMode("rect");
      return;
    }
    await detectMaterialSurfaceFor(selections.map(s => ({ ...s })));
  }

  function confirmMaterialSurface() {
    if (!materialMaskDataUrl || !materialMaskPreviewUrl) {
      setErr("Detecte a superfície antes de confirmar.");
      return;
    }
    setMaterialMaskConfirmed(true);
    setSelectionMode("off");
    setErr(null);
    logEvent("material_surface_confirmed", "Máscara de material confirmada pelo usuário");
  }

  // Apply melhoria (P2-17: structured preservation; P2-18: parentVersionId)
  async function applyMelhoria() {
    if (!renderId || loading) return;

    const automaticQualityPrompt =
      "STRICT PRESERVATION MODE. Treat the current render as the immutable design source. OBJECT INVENTORY LOCK: every visible object in the reference is mandatory and must remain present in the output. Preserve the exact count, position, XYZ placement, orientation, dimensions, proportions, silhouette and visibility of every existing furniture item, loose object, stool, pouf, chair, bench, table, sofa, cabinet, countertop, appliance, fixture, decoration and built-in. Never remove, hide, merge, occlude, replace or simplify any existing object. Preserve the exact perceived colors and material identity of furniture, cabinetry, walls, floors, stone, wood, metals and fabrics. Keep wood species/color and grain direction, stone tone and veining, fabric color and weave, painted finish color and metal finish unchanged. Improve only texture resolution, micro-detail, roughness, reflectance, realistic glass/metal reflections, global illumination, bounce light, soft contact shadows, ambient occlusion, exposure, tonal separation and photographic sharpness. Preserve architecture, geometry, openings, circulation, camera, framing, perspective and field of view exactly. Do not add, remove, replace, recolor, resize, relocate, rotate, crop, zoom, mirror or redesign anything. Do not add decoration unless explicitly requested. Remove only the flat CG/plastic/low-resolution appearance while keeping the design visually identical. The final image must read as a real professional architectural photograph: natural material microtexture, subtle real-world variation, restrained imperfections, believable optics, soft contact shadows, physically plausible reflections and natural highlight roll-off. Avoid CGI cleanliness, game-engine rendering, plastic smoothness, artificial HDR, excessive gloss, oversharpening and uniformly perfect surfaces.";

    const effectivePrompt = melhoriaMode === "improve"
      ? [automaticQualityPrompt, melhoriaPrompt.trim()].filter(Boolean).join(" ")
      : melhoriaPrompt.trim();

    if (
      melhoriaMode !== "improve" &&
      !effectivePrompt &&
      !(melhoriaMode === "change-material" && selectedMaterial)
    ) {
      setErr("Descreva a alteração desejada ou selecione um material.");
      return;
    }
    if (melhoriaMode === "change-material" && selections.length === 0) {
      setErr("Selecione uma área da peça antes de trocar o material.");
      setSelectionMode("rect");
      return;
    }
    if (melhoriaMode === "change-material" && (!materialMaskDataUrl || !materialMaskConfirmed)) {
      setErr("Detecte a superfície e confirme a máscara antes de aplicar o material.");
      return;
    }
    if (melhoriaMode === "change-material" && selectedMaterial && !selectedMaterial.imagens?.[0]) {
      setErr("Este material não possui imagem principal. Defina uma imagem de referência na Biblioteca de Materiais antes de aplicar.");
      return;
    }
    setLoading(true); setErr(null); setSaveState("saving");
    startProgressStages();
    const currentRenderId = renderId;
    try {
      // P2-17: structured preservation policy
      const preservationLocks = {
        camera:         true,
        geometry:       true,
        vãos:           true,
        marcenaria:     true,
        circulacao:     true,
        iluminacao_global: melhoriaMode !== "change-lighting",
        regioes_fora_da_selecao: selections.length > 0,
      };

      const { render_id } = await apiPost(`/api/arch/ai-render/${currentRenderId}/adjust`, {
        ajuste_prompt: [
          melhoriaMode === "change-material" ? "Alteração de material." : null,
          melhoriaMode === "change-lighting" ? "Ajuste de iluminação." : null,
          selectedMaterial ? `Material selecionado: ${selectedMaterial.nome} (${selectedMaterial.categoria}${selectedMaterial.fornecedor ? `, ${selectedMaterial.fornecedor}` : ""}).` : null,
          selections.length > 0
            ? `Aplicar somente dentro da região final confirmada pelo usuário: ${selections.slice(-1).map(s => s.label || "seleção").join(", ")}. Não ampliar automaticamente para toda a peça ou material.`
            : null,
          effectivePrompt,
          melhoriaMode === "improve"
            ? "Executar refino global em alta qualidade sobre a imagem inteira, sem exigir máscara ou seleção."
            : null,
          "Preservar absolutamente medidas, câmera, perspectiva, layout, marcenaria, circulação, proporções e TODOS os objetos visíveis. Nenhum móvel, puff, banco, cadeira, mesa, sofá, eletrodoméstico ou decoração existente pode ser removido, ocultado, fundido ou substituído. Criar nova versão sem substituir a original.",
        ].filter(Boolean).join(" "),
        mask_zones: melhoriaMode === "improve"
          ? []
          : [...selections.map(s => s.label || "selecao"), melhoriaMode === "change-material" ? "material" : ""].filter(Boolean),
        mask_file_base64: melhoriaMode === "change-material" ? materialMaskDataUrl ?? undefined : undefined,
        mask_coordinates: melhoriaMode === "improve"
          ? undefined
          : selections.length > 0
            ? selections.slice(-1).map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h }))
            : undefined,
        createNewVersion: true,
        preserveGeometry: preservationLocks.geometry,
        preserveCamera:   preservationLocks.camera,
        preservation_policy: preservationLocks,
        parent_render_id: currentRenderId, // P2-18
        material_id:      selectedMaterial?.id,
        material_name:    selectedMaterial?.nome,
        material_reference_url: selectedMaterial?.imagens?.[0],
        surface_key:       selections.slice(-1)[0]?.surfaceKey,
        operation_type:   melhoriaMode === "change-material" ? "material" : melhoriaMode === "change-lighting" ? "lighting" : "improve",
        // A troca de material usa a máscara final já detectada e confirmada.
        // Não há expansão durante a geração.
        expand_selection_to_material: false,
        selection_padding_percent: 0,
      });
      const data = await waitForRenderCompletion(render_id);
      const newVersion: RenderVersion = {
        id: render_id, url: normalizeRenderMediaUrl(data.result_image_url),
        label: `Versão ${versions.length + 1} · ${melhoriaMode === "change-material" ? selectedMaterial?.nome ?? "Material" : melhoriaMode === "change-lighting" ? "Iluminação" : "Alta qualidade"}`,
        operationType: melhoriaMode === "change-material" ? "material" : melhoriaMode === "change-lighting" ? "lighting" : "improve",
        parentVersionId: currentRenderId, // P2-18: imutável, rastreável
        createdAt: new Date(),
        selectionLabel: selections[0]?.label,
        materialId: selectedMaterial?.id,
        materialName: selectedMaterial?.nome,
        surfaceKey: selections.slice(-1)[0]?.surfaceKey,
      };
      setRenderUrl(normalizeRenderMediaUrl(data.result_image_url)); setRenderId(render_id);
      setVersions(v => [newVersion, ...v]);
      logEvent("version_created", `${newVersion.label} criada`);
      // Update comparison B automatically
      if (compareMode) setCompareVersionBId(render_id);
      setSaveState("saved"); setLastSavedAt(new Date());
      setSelections([]); setSelectionMode("off"); setSelectedMaterial(null); setMelhoriaPrompt("");
      setMaterialMaskPreviewUrl(null); setMaterialMaskDataUrl(null); setMaterialMaskConfirmed(false);

      // Sincroniza com especificação SOMENTE quando existe identidade estrutural
      // explícita da superfície. Nunca casa por texto/categoria/descrição.
      if (melhoriaMode === "change-material" && selectedMaterial && specificationId && specData.length > 0) {
        const activeSurfaceKey = selections.slice(-1)[0]?.surfaceKey;
        const itemCorrespondente = activeSurfaceKey
          ? specData.find((item: any) =>
              item.surfaceKey === activeSurfaceKey || item.renderSurfaceKey === activeSurfaceKey)
          : undefined;

        if (itemCorrespondente?.id) {
          try {
            await apiPatch(`/api/arch/specification/item/${itemCorrespondente.id}`, {
              catalogoItemId: selectedMaterial.id,
              overrideNome: null,
              overrideFornecedor: null,
              overridePreco: null,
              status: "especificado",
            });
            setSpecData(prev => prev.map((item: any) =>
              item.id === itemCorrespondente.id
                ? { ...item, catalogoItemId: selectedMaterial.id, nome: selectedMaterial.nome, material: selectedMaterial.nome, confirmedByUser: true, status: "especificado" }
                : item));
            logEvent("spec_material_synced", `Superfície ${activeSurfaceKey} vinculada ao material "${selectedMaterial.nome}"`);
          } catch {
            // O render permanece válido; a especificação pode ser revisada manualmente.
          }
        } else if (activeSurfaceKey) {
          logEvent("spec_material_pending_link", `Superfície ${activeSurfaceKey} alterada sem vínculo técnico explícito; nenhum item de especificação foi alterado por aproximação.`);
        }
      }

      go("versao");
    } catch (e: unknown) { setErr(categorizeError(e)); setSaveState("error"); }
    finally { clearProgressStages(); setLoading(false); }
  }

  // Approve (P2-20: governance)
  async function handleApprove() {
    if (!renderId || !arq.projectId) return;
    setLoading(true); setErr(null); setSaveState("saving");
    try {
      await apiPost(`/api/arch/ai-render/${renderId}/approve`, {
        renderId, projectId: arq.projectId,
        notes: approvalNote || `Aprovado via ARQDOR — ${ambiente}`,
        approvedBy: userName,
      });
      const record: ApprovalRecord = { by: userName, at: new Date(), note: approvalNote };
      setApprovalRecord(record);
      setApproved(true);
      logEvent("approved", `Versão aprovada por ${userName}`);
      // P2-20: mark version as approved
      setVersions(vs => vs.map((v) => v.id === renderId
        ? { ...v, approvedBy: userName, approvedAt: record.at, approvalNote }
        : { ...v, approvedBy: undefined, approvedAt: undefined, approvalNote: undefined }));
      setSaveState("saved"); setLastSavedAt(new Date());
    } catch (e: unknown) { setErr(categorizeError(e)); setSaveState("error"); }
    finally { setLoading(false); }
  }

  // Send to spec (P2-21: source attribution)
  async function handleSendToSpec() {
    if (!renderId || !arq.projectId || !renderUrl) return;
    setLoading(true); setErr(null); setSaveState("saving");
    try {
      const data = await apiPost(`/api/arch/specification/analyze`, { renderId, projetoId: arq.projectId, imageUrl: renderUrl });
      // P2-21: mark items from material library as user-confirmed
      const materialIds = new Set(versions.map(v => v.materialId).filter(Boolean));
      const specItems = (data.items ?? data.materiais ?? []).map((item: any) => ({
        ...item,
        confirmedByUser: item.materialId ? materialIds.has(item.materialId) : false,
      }));
      setSpecData(specItems); setSpecDone(true);
      setSpecificationId(data.spec?.id ?? null);
      logEvent("spec_generated", `Especificação gerada · ${specItems.length} itens`);
      setSaveState("saved"); setLastSavedAt(new Date());
    } catch (e: unknown) { setErr(categorizeError(e)); setSaveState("error"); }
    finally { setLoading(false); }
  }

  // Medidas manuais (ambiente e item) — não estimadas por IA, preenchidas
  // e salvas pelo usuário na tela de especificação.
  async function handleSalvarMedidasAmbiente() {
    if (!specificationId) return;
    try {
      await apiPatch(`/api/arch/specification/${specificationId}`, {
        areaM2: areaM2 || null,
        peDireitoM: peDireitoM || null,
      });
      logEvent("spec_room_measurements_saved", `Medidas do ambiente salvas (${areaM2 || "?"}m² · pé-direito ${peDireitoM || "?"}m)`);
    } catch (e: unknown) { setErr(categorizeError(e)); }
  }

  async function handleSalvarMedidasItem(itemId: string, patch: {
    larguraCm?: string;
    alturaCm?: string;
    profundidadeCm?: string;
    status?: "pendente" | "especificado" | "nao_especificado";
    overrideNome?: string | null;
    overrideFornecedor?: string | null;
    overridePreco?: string | null;
  }) {
    setSpecData(prev => prev.map((item: any) => item.id === itemId ? { ...item, ...patch } : item));
    try {
      await apiPatch(`/api/arch/specification/item/${itemId}`, patch);
    } catch (e: unknown) { setErr(categorizeError(e)); }
  }

  // Enviar especificação pro orçamento — ponte real (antes só existia render
  // → especificação; especificação → orçamento nunca tinha sido conectada).
  async function handleEnviarOrcamento(itemIds?: string[]) {
    if (!specificationId) return;
    const selectedIds = (itemIds ?? []).filter(Boolean);
    if (selectedIds.length === 0) {
      setErr("Selecione pelo menos um item como incluso no orçamento antes de enviar.");
      return;
    }
    setEnviandoOrcamento(true); setErr(null); setOrcamentoMsg(null);
    try {
      const data = await apiPost(`/api/arch/specification/${specificationId}/enviar-orcamento`, { itemIds: selectedIds });
      logEvent("spec_sent_to_budget", `Especificação enviada pro orçamento · ${data.itensCriados} itens`);
      const pendentes = Number(data.pendentes ?? 0);
      setOrcamentoMsg(
        pendentes > 0
          ? `${data.itensCriados} item(ns) enviado(s). ${pendentes} pendência(s) permanecem na especificação.`
          : `${data.itensCriados} item(ns) enviado(s) pro orçamento.`
      );
    } catch (e: unknown) {
      setErr(categorizeError(e));
    } finally {
      setEnviandoOrcamento(false);
    }
  }

  function handleSelectVersion(version: RenderVersion) {
    const url = normalizeRenderMediaUrl(version.url);
    setRenderId(version.id);
    setRenderUrl(url);
    setApproved(Boolean(version.approvedAt || version.approvedBy));
    setApprovalRecord(
      version.approvedAt || version.approvedBy
        ? {
            by: version.approvedBy ?? "usuário autenticado",
            at: version.approvedAt ? new Date(version.approvedAt) : new Date(),
            note: version.approvalNote ?? "",
          }
        : null,
    );
    setApprovalNote(version.approvalNote ?? "");
    setSelectionMode("off");
    setSelections([]);
    setCompareMode(false);
    setRenderVideoUrl(null);
    setErr(null);
    setSaveState("saved");
    setLastSavedAt(new Date());
    logEvent("version_selected", `${version.label} selecionada`);

    // A especificação pertence ao projeto e não deve desaparecer ao trocar de versão.
    // Recarrega a fonte persistida em vez de limpar o estado local.
    if (arq.projectId) {
      void apiGet(`/api/arch/specification/${arq.projectId}`)
        .then((data) => {
          const items = Array.isArray(data?.items) ? data.items : [];
          setSpecData(items);
          setSpecDone(Boolean(data?.spec));
          setSpecificationId(data?.spec?.id ?? null);
        })
        .catch(() => {
          // Mantém o estado atual se a revalidação falhar temporariamente.
        });
    }
  }

  function handleRenderLoadError() {
    if (!renderUrl) return;
    const failedUrl = normalizeRenderMediaUrl(renderUrl);
    setRenderUrl(null);
    setRenderId(null);
    setApproved(false);
    setApprovalRecord(null);
    setCompareMode(false);
    setSelectionMode("off");
    setVersions(prev => prev.filter(v => normalizeRenderMediaUrl(v.url) !== failedUrl));
    sessionStorage.removeItem(SK.renderUrl);
    sessionStorage.removeItem(SK.renderId);
    try {
      const raw = sessionStorage.getItem(SK.versions);
      if (raw) {
        const restored = JSON.parse(raw) as RenderVersion[];
        sessionStorage.setItem(SK.versions, JSON.stringify(
          Array.isArray(restored) ? restored.filter(v => normalizeRenderMediaUrl(v.url) !== failedUrl) : [],
        ));
      }
    } catch {
      sessionStorage.removeItem(SK.versions);
    }
    setErr("A versão antiga aponta para um arquivo que não existe mais no Storage. A referência quebrada foi removida; use a imagem base para gerar uma nova versão.");
    setSaveState("error");
  }

  // P0-4 unified handleNextStep
  function handleNextStep() {
    const si = stepIndex(step); const next = STEPS[si + 1]; if (!next) return;
    if (step === "projeto"  && !arq.projectId)  { setErr("Selecione ou crie um projeto para continuar."); return; }
    if (step === "ambiente" && !ambiente.trim()) { setErr("Selecione ou escreva o tipo de ambiente."); return; }
    if (step === "imagem"   && !imageDataUrl)    { setErr("Carregue uma imagem para continuar."); return; }
    if (step === "render"   && !renderUrl)        { void startRender(); return; }
    if (step === "melhoria")                      { go("versao"); return; }
    if (step === "aprovar")                        { void handleApprove(); return; }
    go(next.id);
  }

  // P1-9: step click with confirmation guard
  function handleStepClick(s: Step) {
    if (stepIndex(s) < stepIndex("render") && renderUrl) { setPendingNavStep(s); return; }
    go(s);
  }

  function handleOpenSpecification() {
    if (!arq.projectId) {
      setErr("Selecione um projeto antes de abrir a especificação.");
      return;
    }
    localStorage.setItem("arq_last_project_id", arq.projectId);
    const params = new URLSearchParams();
    params.set("module", "especificacao");
    params.set("project_id", arq.projectId);
    if (renderId) params.set("render_id", renderId);
    if (ambiente.trim()) params.set("ambiente", ambiente.trim());
    setLocation(`/arch/studio?${params.toString()}`);
  }

  // P0-1: create project
  async function handleCreateProject(name: string) {
    const params = new URLSearchParams();
    if (name.trim()) params.set("titulo", name.trim());
    setLocation(`/arch/projetos/novo${params.toString() ? `?${params.toString()}` : ""}`);
  }

  // P2-13: handle new selection from canvas
  function handleNewSelection(sel: Omit<SelectionRect, "id" | "label">) {
    // Ajuste local padrão = UMA região final autorizada por vez.
    // Criar uma nova seleção substitui qualquer seleção anterior para impedir
    // que regiões antigas sejam reenviadas silenciosamente no próximo ajuste.
    const selectionId = crypto.randomUUID();
    const newSel: SelectionRect = {
      ...sel,
      id: selectionId,
      label: "Região selecionada",
      surfaceKey: `${renderId ?? "draft"}:${selectionId}`,
    };
    setSelections([newSel]);
    setMaterialMaskPreviewUrl(null);
    setMaterialMaskDataUrl(null);
    setMaterialMaskConfirmed(false);
    if (step !== "melhoria") go("melhoria");
  }

  function handleUpdateSelection(id: string, patch: Partial<Pick<SelectionRect, "x" | "y" | "w" | "h">>) {
    setSelections(prev => prev.map(sel => sel.id === id ? { ...sel, ...patch } : sel));
    setSaveState("unsaved");
  }

  return {
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
    materialMaskPreviewUrl,
    materialMaskConfirmed,
    materialMaskDetecting,
    detectMaterialSurface,
    confirmMaterialSurface,
    setMaterialMaskConfirmed,
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
    handleOpenSpecification,
    handleCreateProject,
    handleNewSelection,
    handleUpdateSelection,
  };
}
