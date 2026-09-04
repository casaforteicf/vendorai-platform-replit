import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  CheckCircle2,
  Eye,
  FileText,
  Film,
  GripVertical,
  Image as ImageIcon,
  Library,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import AdvancedImageEditPanel from "@/components/media/AdvancedImageEditPanel";
import AudioRightsPanel from "@/components/media/AudioRightsPanel";
import {
  MediaAssetPicker,
  mediaAssetUrl,
  type MediaPickerAsset,
  type MediaPickerType,
} from "@/components/media/MediaAssetPicker";

export type VideoGenerationMode = "ai_only" | "hybrid" | "media_only";
export type MediaInputImportance = "required" | "preferred" | "reference";
export type MediaInputRole =
  | "auto"
  | "main_scene"
  | "broll"
  | "visual_reference"
  | "product"
  | "person"
  | "environment"
  | "opening"
  | "closing"
  | "music"
  | "voiceover"
  | "sfx"
  | "briefing";

export type VideoGenerationMediaInput = {
  assetId: string;
  type: MediaPickerType;
  role: MediaInputRole;
  importance: MediaInputImportance;
  order: number;
  note?: string;
  originalFilename?: string | null;
  storageUrl?: string | null;
  mimeType?: string | null;
  metadata?: Record<string, unknown> | null;
};

type Props = {
  tenantId: string;
  mode: VideoGenerationMode;
  onModeChange: (mode: VideoGenerationMode) => void;
  inputs: VideoGenerationMediaInput[];
  onInputsChange: (inputs: VideoGenerationMediaInput[]) => void;
};

type EditTarget = VideoGenerationMediaInput | null;

const MODE_OPTIONS: Array<{ id: VideoGenerationMode; title: string; description: string }> = [
  { id: "ai_only", title: "Somente IA", description: "A IA cria todas as cenas a partir do briefing." },
  { id: "hybrid", title: "Minhas mídias + IA", description: "Usa seus arquivos e a IA complementa apenas o que faltar." },
  { id: "media_only", title: "Somente minhas mídias", description: "Monta o vídeo sem inventar novas cenas visuais." },
];

const IMPORTANCE_OPTIONS: Array<{ value: MediaInputImportance; label: string }> = [
  { value: "required", label: "Obrigatória" },
  { value: "preferred", label: "Preferencial" },
  { value: "reference", label: "Referência" },
];

const ROLE_LABELS: Record<MediaInputRole, string> = {
  auto: "IA decide",
  main_scene: "Cena principal",
  broll: "B-roll",
  visual_reference: "Referência visual",
  product: "Produto",
  person: "Pessoa",
  environment: "Cenário / ambiente",
  opening: "Abertura",
  closing: "Encerramento",
  music: "Trilha",
  voiceover: "Locução",
  sfx: "Efeito sonoro",
  briefing: "Briefing / contexto",
};

function rolesFor(type: MediaPickerType): MediaInputRole[] {
  if (type === "audio") return ["auto", "music", "voiceover", "sfx"];
  if (type === "document") return ["briefing"];
  return ["auto", "main_scene", "broll", "visual_reference", "product", "person", "environment", "opening", "closing"];
}

function defaultRole(type: MediaPickerType): MediaInputRole {
  if (type === "document") return "briefing";
  return "auto";
}

function defaultImportance(type: MediaPickerType): MediaInputImportance {
  return type === "document" ? "reference" : "preferred";
}

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function inferType(file: File): MediaPickerType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  const name = file.name.toLowerCase();
  if (
    file.type === "application/pdf"
    || file.type.startsWith("text/")
    || file.type.includes("wordprocessingml")
    || name.endsWith(".pdf")
    || name.endsWith(".docx")
    || name.endsWith(".txt")
    || name.endsWith(".md")
  ) return "document";
  return null;
}

function iconFor(type: MediaPickerType) {
  return type === "image" ? ImageIcon : type === "video" ? Film : type === "audio" ? AudioLines : FileText;
}

function normalizedInputs(inputs: VideoGenerationMediaInput[]): VideoGenerationMediaInput[] {
  return inputs.map((input, index) => ({ ...input, order: index }));
}

function isMusic(input: VideoGenerationMediaInput): boolean {
  return input.type === "audio" && input.role === "music";
}

export default function VideoGenerationMediaInputs({ tenantId, mode, onModeChange, inputs, onInputsChange }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const counts = useMemo(() => ({
    image: inputs.filter((item) => item.type === "image").length,
    video: inputs.filter((item) => item.type === "video").length,
    audio: inputs.filter((item) => item.type === "audio").length,
    document: inputs.filter((item) => item.type === "document").length,
  }), [inputs]);

  function addAssets(assets: MediaPickerAsset[]) {
    const existing = new Set(inputs.map((item) => item.assetId));
    const additions = assets
      .filter((asset) => !existing.has(asset.id))
      .map<VideoGenerationMediaInput>((asset, index) => ({
        assetId: asset.id,
        type: asset.type,
        role: defaultRole(asset.type),
        importance: defaultImportance(asset.type),
        order: inputs.length + index,
        originalFilename: asset.originalFilename,
        storageUrl: asset.storageUrl,
        mimeType: asset.mimeType,
        metadata: asset.metadata,
      }));
    if (!additions.length) {
      toast({ title: "Essas mídias já estão selecionadas" });
      return;
    }
    onInputsChange(normalizedInputs([...inputs, ...additions]));
    if (mode === "ai_only") onModeChange("hybrid");
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!tenantId || !files.length) return;
    setUploading(true);
    const uploaded: MediaPickerAsset[] = [];
    try {
      for (const file of Array.from(files)) {
        const type = inferType(file);
        if (!type) {
          toast({ title: `Arquivo ignorado: ${file.name}`, description: "Use imagem, vídeo, áudio, PDF, DOCX, TXT ou MD." });
          continue;
        }
        const requestRes = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({
            name: file.name,
            contentType: file.type || "application/octet-stream",
            type,
            size: file.size,
          }),
        });
        const requestBody = await requestRes.json().catch(() => ({}));
        if (!requestRes.ok) throw new Error(requestBody.error || `Falha ao preparar ${file.name}`);

        const putRes = await fetch(requestBody.uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error(`Falha ao enviar ${file.name}`);

        const registerRes = await fetch(`/api/tenants/${tenantId}/media/assets`, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({
            type,
            role: "source",
            source: "upload",
            storageUrl: requestBody.objectPath,
            originalFilename: file.name,
            mimeType: file.type || null,
            fileSize: file.size,
            metadata: {
              uploadedFrom: "video_generation_workspace",
              uploadedAt: new Date().toISOString(),
              ...(type === "audio" ? { audioKind: "other" } : {}),
            },
          }),
        });
        const registerBody = await registerRes.json().catch(() => ({}));
        if (!registerRes.ok) throw new Error(registerBody.error || `Falha ao registrar ${file.name}`);
        const asset = registerBody.asset ?? registerBody;
        if (!asset?.id) throw new Error(`Upload de ${file.name} não retornou o ativo criado`);
        uploaded.push({
          id: String(asset.id),
          type,
          role: asset.role ?? "source",
          storageUrl: String(asset.storageUrl ?? requestBody.objectPath),
          originalFilename: asset.originalFilename ?? file.name,
          mimeType: asset.mimeType ?? file.type ?? null,
          source: asset.source ?? "upload",
          metadata: asset.metadata ?? { uploadedFrom: "video_generation_workspace" },
        });
      }
      if (uploaded.length) {
        addAssets(uploaded);
        toast({ title: `${uploaded.length} mídia(s) adicionada(s)`, description: "Os arquivos também ficaram salvos na Biblioteca." });
      }
    } catch (error) {
      toast({ title: "Falha no upload", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  function updateInput(assetId: string, patch: Partial<VideoGenerationMediaInput>) {
    onInputsChange(inputs.map((item) => item.assetId === assetId ? { ...item, ...patch } : item));
    setEditTarget((current) => current?.assetId === assetId ? { ...current, ...patch } : current);
  }

  function removeInput(assetId: string) {
    onInputsChange(normalizedInputs(inputs.filter((item) => item.assetId !== assetId)));
    setEditTarget((current) => current?.assetId === assetId ? null : current);
  }

  function move(assetId: string, direction: -1 | 1) {
    const index = inputs.findIndex((item) => item.assetId === assetId);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= inputs.length) return;
    const next = [...inputs];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onInputsChange(normalizedInputs(next));
  }

  function dropOn(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const from = inputs.findIndex((item) => item.assetId === draggedId);
    const to = inputs.findIndex((item) => item.assetId === targetId);
    if (from < 0 || to < 0) return;
    const next = [...inputs];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setDraggedId(null);
    onInputsChange(normalizedInputs(next));
  }

  function edit(input: VideoGenerationMediaInput) {
    if (input.type === "video") {
      navigate(`/content-studio/video/edicao?mediaAssetId=${encodeURIComponent(input.assetId)}`);
      return;
    }
    setEditTarget(input);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Library className="h-4 w-4 text-cyan-300" />
            <p className="text-sm font-bold text-white">Mídias para usar na geração</p>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">Use fotos, vídeos, áudios e documentos da Biblioteca ou faça upload sem sair desta tela.</p>
        </div>
        {inputs.length > 0 && (
          <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex items-center gap-1.5 self-start rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/10">
            <Eye className="h-3.5 w-3.5" /> Pré-visualizar estrutura
          </button>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onModeChange(option.id)}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              mode === option.id ? "border-purple-500/50 bg-purple-500/15" : "border-white/10 bg-white/[0.02] hover:bg-white/5",
            )}
          >
            <p className="text-xs font-semibold text-white">{option.title}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-gray-500">{option.description}</p>
          </button>
        ))}
      </div>

      {mode !== "ai_only" && (
        <>
          <input
            ref={uploadRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.docx,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => { if (event.target.files?.length) void uploadFiles(event.target.files); }}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setPickerOpen(true)} className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-xs font-semibold text-gray-300 hover:border-purple-500/40 hover:bg-purple-500/5">
              <Library className="h-4 w-4 text-purple-300" /> Selecionar da Biblioteca
            </button>
            <button type="button" onClick={() => uploadRef.current?.click()} disabled={uploading} className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-xs font-semibold text-gray-300 hover:border-cyan-500/40 hover:bg-cyan-500/5 disabled:opacity-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : <Upload className="h-4 w-4 text-cyan-300" />}
              {uploading ? "Enviando arquivos..." : "Fazer upload"}
            </button>
          </div>
          <p className="text-[9px] leading-relaxed text-gray-600">Logo, intro e outro oficiais continuam centralizados no Brand Video Kit. Aqui você adiciona cenas, referências, B-roll, áudio e briefing do projeto.</p>

          {inputs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-7 text-center">
              <Plus className="mx-auto h-5 w-5 text-gray-600" />
              <p className="mt-2 text-xs font-semibold text-gray-400">Nenhuma mídia adicionada</p>
              <p className="mt-1 text-[10px] text-gray-600">Adicione arquivos e defina quais são obrigatórios, preferenciais ou apenas referências.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-[10px] text-gray-500">
                <span>{inputs.length} mídia(s)</span><span>•</span><span>{counts.image} foto(s)</span><span>{counts.video} vídeo(s)</span><span>{counts.audio} áudio(s)</span><span>{counts.document} arquivo(s)</span>
              </div>
              {inputs.map((input, index) => {
                const Icon = iconFor(input.type);
                return (
                  <div
                    key={input.assetId}
                    draggable
                    onDragStart={() => setDraggedId(input.assetId)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropOn(input.assetId)}
                    className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 lg:grid-cols-[92px_minmax(0,1fr)_180px_150px]"
                  >
                    <div className="relative flex min-h-20 items-center justify-center overflow-hidden rounded-lg bg-black/30">
                      {input.type === "image" && input.storageUrl ? <img src={mediaAssetUrl(input.storageUrl)} alt={input.originalFilename || "Mídia"} className="h-20 w-full object-cover" /> : input.type === "video" && input.storageUrl ? <video src={mediaAssetUrl(input.storageUrl)} muted preload="metadata" className="h-20 w-full object-cover" /> : <Icon className="h-7 w-7 text-gray-500" />}
                      <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">{index + 1}</span>
                    </div>

                    <div className="min-w-0 space-y-2">
                      <div className="flex items-start gap-2">
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-gray-700" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-white">{input.originalFilename || `${input.type} ${index + 1}`}</p>
                          <p className="mt-0.5 text-[9px] uppercase text-gray-600">{input.type}</p>
                        </div>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => move(input.assetId, -1)} disabled={index === 0} className="rounded p-1 text-gray-500 hover:bg-white/5 hover:text-white disabled:opacity-20" title="Mover para cima"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => move(input.assetId, 1)} disabled={index === inputs.length - 1} className="rounded p-1 text-gray-500 hover:bg-white/5 hover:text-white disabled:opacity-20" title="Mover para baixo"><ArrowDown className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => edit(input)} className="rounded p-1 text-purple-300 hover:bg-purple-500/10" title="Editar mídia"><Pencil className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => removeInput(input.assetId)} className="rounded p-1 text-red-400 hover:bg-red-500/10" title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      <input
                        value={input.note ?? ""}
                        onChange={(event) => updateInput(input.assetId, { note: event.target.value.slice(0, 500) })}
                        placeholder={input.type === "document" ? "Como este documento deve orientar o vídeo?" : "Observação opcional para a IA..."}
                        className="h-8 w-full rounded-lg border border-white/10 bg-black/20 px-2.5 text-[10px] text-gray-300 outline-none placeholder:text-gray-700 focus:border-purple-500/40"
                      />
                    </div>

                    <label className="space-y-1">
                      <span className="text-[9px] font-semibold uppercase text-gray-600">Usar como</span>
                      <select value={input.role} onChange={(event) => updateInput(input.assetId, { role: event.target.value as MediaInputRole })} className="h-9 w-full rounded-lg border border-white/10 bg-[#171126] px-2 text-[10px] text-gray-300">
                        {rolesFor(input.type).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-[9px] font-semibold uppercase text-gray-600">Prioridade</span>
                      <select value={input.importance} onChange={(event) => updateInput(input.assetId, { importance: event.target.value as MediaInputImportance })} className="h-9 w-full rounded-lg border border-white/10 bg-[#171126] px-2 text-[10px] text-gray-300">
                        {IMPORTANCE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {mode === "ai_only" && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-3 py-2.5 text-[10px] text-purple-200">
          A IA criará as cenas visuais. Você ainda poderá editar o resultado na timeline depois da geração.
        </div>
      )}

      <MediaAssetPicker
        tenantId={tenantId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={["image", "video", "audio", "document"]}
        maxSelection={20}
        title="Adicionar mídias ao vídeo"
        confirmLabel="Adicionar ao projeto"
        onConfirm={addAssets}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>Prévia da estrutura do vídeo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
              Esta prévia valida ordem e função das mídias sem gastar um render final. A duração exata é definida pelo Media Engine.
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inputs.map((input, index) => {
                const Icon = iconFor(input.type);
                return (
                  <div key={input.assetId} className="overflow-hidden rounded-xl border bg-background">
                    <div className="relative aspect-video bg-muted">
                      {input.type === "image" && input.storageUrl ? <img src={mediaAssetUrl(input.storageUrl)} alt="" className="h-full w-full object-cover" /> : input.type === "video" && input.storageUrl ? <video src={mediaAssetUrl(input.storageUrl)} muted controls preload="metadata" className="h-full w-full object-cover" /> : input.type === "audio" && input.storageUrl ? <div className="flex h-full flex-col items-center justify-center gap-2 p-3"><AudioLines className="h-8 w-8 text-primary" /><audio src={mediaAssetUrl(input.storageUrl)} controls className="w-full" /></div> : <div className="flex h-full items-center justify-center"><Icon className="h-9 w-9 text-muted-foreground" /></div>}
                      <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white">Entrada {index + 1}</span>
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="truncate text-xs font-semibold">{input.originalFilename || `Mídia ${index + 1}`}</p>
                      <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[input.role]} · {IMPORTANCE_OPTIONS.find((item) => item.value === input.importance)?.label}</p>
                      {input.note && <p className="line-clamp-2 text-[10px] text-muted-foreground">{input.note}</p>}
                    </div>
                  </div>
                );
              })}
              {mode === "hybrid" && (
                <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed bg-purple-500/[0.03] p-4 text-center">
                  <div><Sparkles className="mx-auto h-6 w-6 text-purple-500" /><p className="mt-2 text-xs font-semibold">IA complementa o storyboard</p><p className="mt-1 text-[10px] text-muted-foreground">Novas cenas só são criadas quando necessárias para completar a narrativa.</p></div>
                </div>
              )}
            </div>
            <div className="flex justify-end"><Button type="button" onClick={() => setPreviewOpen(false)}><CheckCircle2 className="mr-2 h-4 w-4" />Estrutura conferida</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Editar mídia</DialogTitle></DialogHeader>
          {editTarget?.type === "image" && (
            <div className="space-y-3">
              {editTarget.storageUrl && <img src={mediaAssetUrl(editTarget.storageUrl)} alt={editTarget.originalFilename || "Imagem"} className="max-h-[45vh] w-full rounded-xl border object-contain" />}
              <AdvancedImageEditPanel assetId={editTarget.assetId} filename={editTarget.originalFilename} />
              <p className="text-[10px] text-muted-foreground">As ferramentas geram uma nova versão na Biblioteca e preservam o arquivo original.</p>
            </div>
          )}
          {editTarget?.type === "audio" && (
            <div className="space-y-3">
              {editTarget.storageUrl && <audio src={mediaAssetUrl(editTarget.storageUrl)} controls className="w-full" />}
              <div className="grid gap-2 sm:grid-cols-3">
                {["music", "voiceover", "sfx"].map((role) => (
                  <button key={role} type="button" onClick={() => updateInput(editTarget.assetId, { role: role as MediaInputRole })} className={cn("rounded-lg border p-2 text-xs", editTarget.role === role ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>{ROLE_LABELS[role as MediaInputRole]}</button>
                ))}
              </div>
              {isMusic(editTarget) ? <AudioRightsPanel tenantId={tenantId} asset={{ id: editTarget.assetId, metadata: editTarget.metadata }} /> : <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">Escolha “Trilha” para revisar direitos. Locuções e efeitos entram como áudio de apoio no projeto.</p>}
            </div>
          )}
          {editTarget?.type === "document" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-4"><FileText className="h-8 w-8 text-primary" /><div><p className="text-sm font-semibold">{editTarget.originalFilename || "Documento"}</p><p className="text-xs text-muted-foreground">PDF, DOCX, TXT e MD podem orientar roteiro e cenas sem entrar visualmente no MP4.</p></div></div>
              <textarea value={editTarget.note ?? ""} onChange={(event) => updateInput(editTarget.assetId, { note: event.target.value.slice(0, 500) })} rows={4} placeholder="Diga à IA o que é mais importante neste documento..." className="w-full rounded-xl border bg-background p-3 text-sm" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
