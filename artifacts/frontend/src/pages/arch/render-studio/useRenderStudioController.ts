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
  const [renderPreset, setRenderPreset] = useState<RenderPreset>("interior_layout_preserve");
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

  // P2 state
  const [selectionMode, setSelectionMode] = useState<"off" | "rect">("off");
  const [selections, setSelections] = useState<SelectionRect[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<CatalogItem | null>(null);
  const [showMaterialLib, setShowMaterialLib] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersionAId, setCompareVersionAId] = useState<string | null>(null);
  const [compareVersionBId, setCompareVersionBId] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalRecord, setApprovalRecord] = useState<ApprovalRecord | null>(null);

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

  // Session restore
  useEffect(() => {
    const ss = sessionStorage.getItem(SK.step) as Step | null;
    const sa = sessionStorage.getItem(SK.ambiente);
    const sri = sessionStorage.getItem(SK.renderId);
    const sru = sessionStorage.getItem(SK.renderUrl);
    const sv = sessionStorage.getItem(SK.versions);
    const siu = sessionStorage.getItem(SK.imageUrl);
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
        if (ss === "aprovar") setStep("especificacao");
      }
    } catch {}
    if (siu) setImageDataUrl(siu);
    if (ss && ss !== "aprovar") setStep(ss);
    // P1-11: orphan job recovery
    if (sri && !sru) {
      setIsRecovering(true);
      apiGet(`/api/arch/ai-render/${sri}`)
        .then((data) => {
          if (data.status === "concluido" && data.file_available !== false && (data.display_url || data.result_image_url)) {
            const recoveredUrl = data.display_url || data.result_image_url;
            setRenderUrl(normalizeRenderMediaUrl(recoveredUrl));
            const v: RenderVersion = { id: sri, url: normalizeRenderMediaUrl(recoveredUrl), label: "Versão 1 · Original", operationType: "initial", createdAt: new Date() };
            setVersions([v]);
            sessionStorage.setItem(SK.renderUrl, normalizeRenderMediaUrl(recoveredUrl));
            setSaveState("saved"); setLastSavedAt(new Date());
          }
        })
        .catch(() => {}).finally(() => setIsRecovering(false));
    }
  }, []);

  useEffect(() => { sessionStorage.setItem(SK.step, step); }, [step]);
  useEffect(() => {
    if (ambiente) sessionStorage.setItem(SK.ambiente, ambiente);
    else sessionStorage.removeItem(SK.ambiente);
  }, [ambiente]);
  useEffect(() => {
    if (renderId) sessionStorage.setItem(SK.renderId, renderId);
    else sessionStorage.removeItem(SK.renderId);
  }, [renderId]);
  useEffect(() => {
    if (renderUrl) sessionStorage.setItem(SK.renderUrl, renderUrl);
    else sessionStorage.removeItem(SK.renderUrl);
  }, [renderUrl]);
  useEffect(() => {
    try {
      if (versions.length > 0) sessionStorage.setItem(SK.versions, JSON.stringify(versions));
      else sessionStorage.removeItem(SK.versions);
    } catch {}
  }, [versions]);
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
  useEffect(() => { if (arq.projectId && step === "projeto") go("ambiente"); }, [arq.projectId]);

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
      const { render_id } = await apiPost("/api/arch/ai-render", {
        project_id: arq.projectId ?? undefined, original_image_url: imageDataUrl, mode: "preservar",
        ambiente: ambiente.toLowerCase().replace(/\s+/g, "_"),
        render_presets: [renderPreset],
        user_notes: "Preservação rígida: manter exatamente cores, materiais, texturas-base, medidas, posição, orientação e proporções de todo mobiliário e marcenaria; manter câmera, perspectiva, layout, circulação e aberturas. Melhorar somente fotorealismo, resolução de textura, iluminação, reflexos, sombras e definição. Não adicionar decoração nem realocar objetos.",
      });
      setRenderId(render_id); setProcessingStage("Gerando render…");
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

  // Apply melhoria (P2-17: structured preservation; P2-18: parentVersionId)
  async function applyMelhoria() {
    if (!renderId || loading) return;

    const automaticQualityPrompt =
      "STRICT PRESERVATION MODE. Treat the current render as the immutable design source. Preserve the exact count, position, XYZ placement, orientation, dimensions, proportions and visible shape of every existing furniture item, cabinet, countertop, appliance, fixture and built-in. Preserve the exact perceived colors and material identity of furniture, cabinetry, walls, floors, stone, wood, metals and fabrics. Keep wood species/color and grain direction, stone tone and veining, fabric color and weave, painted finish color and metal finish unchanged. Improve only texture resolution, micro-detail, roughness, reflectance, realistic glass/metal reflections, global illumination, bounce light, soft contact shadows, ambient occlusion, exposure, tonal separation and photographic sharpness. Preserve architecture, geometry, openings, circulation, camera, framing, perspective and field of view exactly. Do not add, remove, replace, recolor, resize, relocate, rotate, crop, zoom, mirror or redesign anything. Do not add decoration unless explicitly requested. Remove only the flat CG/plastic/low-resolution appearance while keeping the design visually identical.";

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
          selections.length > 0 ? `Aplicar somente na região selecionada: ${selections.map(s => s.label || "seleção").join(", ")}.` : null,
          effectivePrompt,
          melhoriaMode === "improve"
            ? "Executar refino global em alta qualidade sobre a imagem inteira, sem exigir máscara ou seleção."
            : null,
          "Preservar absolutamente medidas, câmera, perspectiva, layout, marcenaria, circulação e proporções. Criar nova versão sem substituir a original.",
        ].filter(Boolean).join(" "),
        mask_zones: melhoriaMode === "improve"
          ? []
          : [...selections.map(s => s.label || "selecao"), melhoriaMode === "change-material" ? "material" : ""].filter(Boolean),
        mask_coordinates: melhoriaMode === "improve"
          ? undefined
          : selections.length > 0
            ? selections.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h }))
            : undefined,
        createNewVersion: true,
        preserveGeometry: preservationLocks.geometry,
        preserveCamera:   preservationLocks.camera,
        preservation_policy: preservationLocks,
        parent_render_id: currentRenderId, // P2-18
        material_id:      selectedMaterial?.id,
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
      };
      setRenderUrl(normalizeRenderMediaUrl(data.result_image_url)); setRenderId(render_id);
      setVersions(v => [newVersion, ...v]);
      logEvent("version_created", `${newVersion.label} criada`);
      // Update comparison B automatically
      if (compareMode) setCompareVersionBId(render_id);
      setSaveState("saved"); setLastSavedAt(new Date());
      setSelections([]); setSelectionMode("off"); setSelectedMaterial(null); setMelhoriaPrompt("");

      // Conecta troca de material com a especificação, se já existir uma
      // gerada — casa a região selecionada (label) com o item de
      // especificação correspondente (por categoria/descrição, comparação
      // solta já que não existe vínculo direto entre seleção e item).
      if (melhoriaMode === "change-material" && selectedMaterial && specificationId && specData.length > 0) {
        const selecaoLabel = (selections[0]?.label ?? "").toLowerCase().trim();
        const itemCorrespondente = selecaoLabel
          ? specData.find((item: any) =>
              item.categoria?.toLowerCase().includes(selecaoLabel) ||
              item.descricao?.toLowerCase().includes(selecaoLabel) ||
              selecaoLabel.includes(item.categoria?.toLowerCase() ?? "__none__"))
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
            logEvent("spec_material_synced", `Item "${itemCorrespondente.descricao}" atualizado com material "${selectedMaterial.nome}"`);
          } catch {
            // Não trava o fluxo de render por causa disso — a especificação
            // pode ser corrigida manualmente depois se a sincronização falhar.
          }
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
      setSaveState("saved"); setLastSavedAt(new Date()); go("especificacao");
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

  async function handleSalvarMedidasItem(itemId: string, patch: { larguraCm?: string; alturaCm?: string; profundidadeCm?: string }) {
    setSpecData(prev => prev.map((item: any) => item.id === itemId ? { ...item, ...patch } : item));
    try {
      await apiPatch(`/api/arch/specification/item/${itemId}`, patch);
    } catch (e: unknown) { setErr(categorizeError(e)); }
  }

  // Enviar especificação pro orçamento — ponte real (antes só existia render
  // → especificação; especificação → orçamento nunca tinha sido conectada).
  async function handleEnviarOrcamento() {
    if (!specificationId) return;
    setEnviandoOrcamento(true); setErr(null); setOrcamentoMsg(null);
    try {
      const data = await apiPost(`/api/arch/specification/${specificationId}/enviar-orcamento`, {});
      logEvent("spec_sent_to_budget", `Especificação enviada pro orçamento · ${data.itensCriados} itens`);
      setOrcamentoMsg(`${data.itensCriados} item(ns) enviado(s) pro orçamento.`);
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
    setSpecDone(false);
    setSpecData([]);
    setSpecificationId(null);
    setErr(null);
    setSaveState("saved");
    setLastSavedAt(new Date());
    logEvent("version_selected", `${version.label} selecionada`);
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
    if (step === "especificacao")                  { void handleSendToSpec(); return; }
    go(next.id);
  }

  // P1-9: step click with confirmation guard
  function handleStepClick(s: Step) {
    if (stepIndex(s) < stepIndex("render") && renderUrl) { setPendingNavStep(s); return; }
    if (s === "aprovar" && approved) { go("especificacao"); return; }
    go(s);
  }

  // P0-1: create project
  async function handleCreateProject(name: string) { await arq.createProject(name); go("ambiente"); }

  // P2-13: handle new selection from canvas
  function handleNewSelection(sel: Omit<SelectionRect, "id" | "label">) {
    const newSel: SelectionRect = { ...sel, id: crypto.randomUUID(), label: `Região ${selections.length + 1}` };
    setSelections(prev => [...prev, newSel]);
    if (step !== "melhoria") go("melhoria");
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
    renderPreset,
    setRenderPreset,
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
  };
}
