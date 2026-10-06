import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AudioLines,
  Ban,
  CheckCircle2,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";

type AttachmentType = "image" | "video" | "audio" | "document";
type FilterType = "all" | AttachmentType | "project";
type MarketingStatus = "only_attachment" | "candidate" | "approved" | "blocked";
type SourceKind = "lead" | "activity" | "work_card" | "media";

type StoredLeadAttachment = {
  id: string;
  name: string;
  storageUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
  type: AttachmentType;
  folderPath?: string;
  category?: string;
  marketingStatus?: MarketingStatus;
  createdAt: string;
};

type AttachmentOverride = {
  name?: string;
  folderPath?: string;
  marketingStatus?: MarketingStatus;
  mediaAssetId?: string;
};

type AttachmentState = {
  files: StoredLeadAttachment[];
  folders: string[];
  overrides: Record<string, AttachmentOverride>;
};

type LeadRecord = {
  id: string;
  nome?: string | null;
  empresa?: string | null;
  discoveryData?: Record<string, unknown> | null;
};

type WorkCard = {
  id: string;
  leadId?: string | null;
  pipeline?: string | null;
  codigo?: string | null;
  titulo?: string | null;
};

type WorkAttachment = {
  id: string;
  nome: string;
  url: string;
  mimeType?: string | null;
  tamanho?: number | null;
  origem?: string | null;
  descricao?: string | null;
  createdAt?: string | null;
};

type Activity = {
  id: string;
  titulo?: string | null;
  anexoNome?: string | null;
  anexoUrl?: string | null;
  anexoMimeType?: string | null;
  anexoTamanho?: number | null;
  anexoCategoria?: string | null;
  tipo?: string | null;
  createdAt?: string | null;
};

type MediaAsset = {
  id: string;
  type: AttachmentType;
  storageUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
  originalFilename?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
};

type UnifiedAttachment = {
  key: string;
  sourceKind: SourceKind;
  sourceId: string;
  name: string;
  url: string;
  type: AttachmentType;
  category?: string;
  size?: number | null;
  createdAt?: string | null;
  origin: string;
  folderPath: string;
  marketingStatus: MarketingStatus;
  mediaAssetId?: string;
};

const EMPTY_STATE: AttachmentState = { files: [], folders: [], overrides: {} };

const CORE_FOLDERS = [
  "Documentos / Contratos",
  "Documentos / Propostas e Orçamentos",
  "Documentos / Ordens de Serviço",
  "Financeiro / Boletos",
  "Financeiro / PIX",
  "Financeiro / Notas Fiscais",
  "Financeiro / Comprovantes e Recibos",
  "Projetos",
  "Assistência / Suporte",
  "Execução / Obra",
  "Conversas / Arquivos recebidos",
  "Imagens e Fotos",
  "Vídeos",
  "Áudios",
  "Outros",
] as const;

function automaticFolder(input: {
  name?: string | null;
  category?: string | null;
  origin?: string | null;
  type?: AttachmentType | null;
  activityType?: string | null;
  pipeline?: string | null;
}): string {
  const text = [
    input.name,
    input.category,
    input.origin,
    input.activityType,
    input.pipeline,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/contrato|contract|termo assinado|assinad/.test(text)) return "Documentos / Contratos";
  if (/proposta|orçamento|orcamento|cotação|cotacao/.test(text)) return "Documentos / Propostas e Orçamentos";
  if (/ordem de serviço|ordem de servico|\bos\b|service order/.test(text)) return "Documentos / Ordens de Serviço";
  if (/boleto|linha digitável|linha digitavel/.test(text)) return "Financeiro / Boletos";
  if (/\bpix\b|qr code|qrcode/.test(text)) return "Financeiro / PIX";
  if (/nota fiscal|\bnf-e?\b|\bnfe\b|danfe/.test(text)) return "Financeiro / Notas Fiscais";
  if (/comprovante|recibo|pagamento|baixa financeira/.test(text)) return "Financeiro / Comprovantes e Recibos";
  if (/projeto|planta|render|fachada|memorial|especificaç|especificac/.test(text)) return "Projetos";
  if (/assistência|assistencia|suporte|garantia|manutenção|manutencao/.test(text)) return "Assistência / Suporte";
  if (/execução|execucao|obra|instalação|instalacao|entrega/.test(text)) return "Execução / Obra";
  if (/whatsapp|e-mail|email|conversa|mensagem|omnichannel/.test(text)) return "Conversas / Arquivos recebidos";
  if (input.type === "image") return "Imagens e Fotos";
  if (input.type === "video") return "Vídeos";
  if (input.type === "audio") return "Áudios";
  if (input.type === "document") return "Outros";
  return "Outros";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function displayUrl(url: string): string {
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  return url;
}

function canonicalStorageUrl(url: string): string {
  if (url.startsWith("/api/storage/objects/")) return url.replace("/api/storage", "");
  return url;
}

function inferType(mimeType?: string | null, name?: string | null): AttachmentType {
  const mime = String(mimeType ?? "").toLowerCase();
  const filename = String(name ?? "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|avif)$/i.test(filename)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|mov|webm|m4v|avi)$/i.test(filename)) return "video";
  if (mime.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|aac)$/i.test(filename)) return "audio";
  return "document";
}

function normalizeFolder(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" / ");
}

function parseAttachmentState(lead: LeadRecord | null): AttachmentState {
  const discovery = asRecord(lead?.discoveryData);
  const root = asRecord(discovery.vendoraiAttachments);
  const files = Array.isArray(root.files)
    ? root.files.filter((item): item is StoredLeadAttachment => Boolean(item && typeof item === "object" && (item as StoredLeadAttachment).id))
    : [];
  const folders = Array.isArray(root.folders)
    ? root.folders.filter((item): item is string => typeof item === "string").map(normalizeFolder).filter(Boolean)
    : [];
  const overrides = asRecord(root.overrides) as Record<string, AttachmentOverride>;
  return { files, folders: [...new Set(folders)], overrides };
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function formatBytes(value?: number | null): string {
  if (!value) return "—";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function uploadLimitBytes(type: AttachmentType): number {
  if (type === "image") return 50 * 1024 * 1024;
  if (type === "video") return 2 * 1024 * 1024 * 1024;
  return 500 * 1024 * 1024;
}

function uploadDirectWithProgress(
  uploadURL: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadURL);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onerror = () => reject(new Error(`Falha de rede ao enviar ${file.name}`));
    xhr.onabort = () => reject(new Error(`Upload cancelado: ${file.name}`));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Falha ao enviar ${file.name} (HTTP ${xhr.status})`));
    };
    xhr.send(file);
  });
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function TypeIcon({ type }: { type: AttachmentType }) {
  if (type === "image") return <ImageIcon className="h-5 w-5" />;
  if (type === "video") return <Film className="h-5 w-5" />;
  if (type === "audio") return <AudioLines className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

function typeLabel(item: UnifiedAttachment): string {
  if (item.category === "projeto") return "Projeto";
  if (item.type === "image") return "Imagem";
  if (item.type === "video") return "Vídeo";
  if (item.type === "audio") return "Áudio";
  return "Documento";
}

function statusLabel(status: MarketingStatus): string {
  if (status === "approved") return "Aprovado para mídia";
  if (status === "candidate") return "Candidato a mídia";
  if (status === "blocked") return "Não usar em marketing";
  return "Somente anexo";
}

function statusClass(status: MarketingStatus): string {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "candidate") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "blocked") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

export default function LeadAttachmentsTab() {
  const { id: leadId } = useParams<{ id: string }>();
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [workCards, setWorkCards] = useState<WorkCard[]>([]);
  const [workAttachments, setWorkAttachments] = useState<Array<WorkAttachment & { workCardId: string; pipeline?: string | null }>>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; loaded: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [folderFilter, setFolderFilter] = useState<string>("");
  const [uploadTargetFolder, setUploadTargetFolder] = useState<string>("");

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [editItem, setEditItem] = useState<UnifiedAttachment | null>(null);
  const [editName, setEditName] = useState("");
  const [editFolder, setEditFolder] = useState("");

  const attachmentState = useMemo(() => parseAttachmentState(lead), [lead]);
  const leadName = lead?.nome || lead?.empresa || "Cliente";

  async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: { ...authHeaders(Boolean(options?.body)), ...(options?.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `Erro ${response.status}`);
    return body as T;
  }

  async function refresh() {
    if (!tenantId || !leadId) return;
    setLoading(true);
    try {
      const [leadResult, activitiesResult, cardsResult, mediaResult] = await Promise.allSettled([
        requestJson<LeadRecord>(`/api/leads/${leadId}`),
        requestJson<Activity[]>(`/api/tenants/${tenantId}/activities?leadId=${encodeURIComponent(leadId)}`),
        requestJson<WorkCard[]>(`/api/tenants/${tenantId}/work-cards?leadId=${encodeURIComponent(leadId)}&includeClosed=1`),
        requestJson<{ assets: MediaAsset[] }>(`/api/tenants/${tenantId}/media/assets?limit=150`),
      ]);

      const failures: string[] = [];

      if (leadResult.status === "fulfilled") {
        setLead(leadResult.value);
      } else {
        failures.push(`Dados do lead: ${String(leadResult.reason)}`);
      }

      if (activitiesResult.status === "fulfilled") {
        setActivities(activitiesResult.value);
      } else {
        setActivities([]);
        failures.push(`Atividades: ${String(activitiesResult.reason)}`);
      }

      const cardRows = cardsResult.status === "fulfilled" ? cardsResult.value : [];
      if (cardsResult.status === "fulfilled") {
        setWorkCards(cardRows);
      } else {
        setWorkCards([]);
        failures.push(`Execução: ${String(cardsResult.reason)}`);
      }

      if (mediaResult.status === "fulfilled") {
        setMediaAssets(mediaResult.value.assets ?? []);
      } else {
        setMediaAssets([]);
        failures.push(`Mídias: ${String(mediaResult.reason)}`);
      }

      const attachmentResults = await Promise.allSettled(
        cardRows.map(async (card) => {
          const rows = await requestJson<WorkAttachment[]>(`/api/work-cards/${card.id}/attachments`);
          return rows.map((row) => ({ ...row, workCardId: card.id, pipeline: card.pipeline }));
        }),
      );

      const cardAttachmentRows = attachmentResults.flatMap((result, index) => {
        if (result.status === "fulfilled") return result.value;
        const card = cardRows[index];
        failures.push(`Anexos de ${card?.codigo || card?.titulo || "card operacional"}: ${String(result.reason)}`);
        return [];
      });
      setWorkAttachments(cardAttachmentRows);

      if (failures.length > 0) {
        toast({
          title: leadResult.status === "rejected"
            ? "Não foi possível carregar os dados principais do cliente"
            : "Alguns dados não puderam ser carregados",
          description: failures.join(" • "),
          variant: leadResult.status === "rejected" ? "destructive" : "default",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, leadId]);

  async function persistAttachmentState(next: AttachmentState) {
    if (!lead || !leadId) return;
    setSaving(true);
    try {
      const discovery = asRecord(lead.discoveryData);
      const updated = await requestJson<LeadRecord>(`/api/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({
          discoveryData: {
            ...discovery,
            vendoraiAttachments: next,
          },
        }),
      });
      setLead(updated);
    } finally {
      setSaving(false);
    }
  }

  function overrideFor(key: string): AttachmentOverride {
    return attachmentState.overrides[key] ?? {};
  }

  const unified = useMemo<UnifiedAttachment[]>(() => {
    const rows: UnifiedAttachment[] = [];
    const mediaBySourceKey = new Map<string, MediaAsset>();

    for (const asset of mediaAssets) {
      const sourceKey = metadataString(asset.metadata, "sourceAttachmentKey");
      if (sourceKey) mediaBySourceKey.set(sourceKey, asset);
    }

    for (const file of attachmentState.files) {
      const key = `lead:${file.id}`;
      const override = overrideFor(key);
      const promoted = override.mediaAssetId
        ? mediaAssets.find((asset) => asset.id === override.mediaAssetId)
        : mediaBySourceKey.get(key);
      rows.push({
        key,
        sourceKind: "lead",
        sourceId: file.id,
        name: override.name || file.name,
        url: file.storageUrl,
        type: file.type,
        category: file.category,
        size: file.fileSize,
        createdAt: file.createdAt,
        origin: "Upload no cliente",
        folderPath: normalizeFolder(
          override.folderPath ??
          file.folderPath ??
          automaticFolder({ name: file.name, category: file.category, origin: "Upload no cliente", type: file.type })
        ),
        marketingStatus: promoted ? "approved" : (override.marketingStatus ?? file.marketingStatus ?? "only_attachment"),
        mediaAssetId: promoted?.id ?? override.mediaAssetId,
      });
    }

    for (const activity of activities) {
      if (!activity.anexoUrl) continue;
      const key = `activity:${activity.id}`;
      const override = overrideFor(key);
      const promoted = override.mediaAssetId
        ? mediaAssets.find((asset) => asset.id === override.mediaAssetId)
        : mediaBySourceKey.get(key);
      rows.push({
        key,
        sourceKind: "activity",
        sourceId: activity.id,
        name: override.name || activity.anexoNome || activity.titulo || "Anexo da atividade",
        url: activity.anexoUrl,
        type: inferType(activity.anexoMimeType, activity.anexoNome),
        category: activity.anexoCategoria ?? undefined,
        size: activity.anexoTamanho,
        createdAt: activity.createdAt,
        origin: activity.tipo === "assistencia" ? "Assistência" : "Atividade",
        folderPath: normalizeFolder(
          override.folderPath ??
          automaticFolder({
            name: activity.anexoNome || activity.titulo,
            category: activity.anexoCategoria,
            origin: activity.tipo === "assistencia" ? "Assistência" : "Atividade",
            type: inferType(activity.anexoMimeType, activity.anexoNome),
            activityType: activity.tipo,
          })
        ),
        marketingStatus: promoted ? "approved" : (override.marketingStatus ?? "only_attachment"),
        mediaAssetId: promoted?.id ?? override.mediaAssetId,
      });
    }

    for (const attachment of workAttachments) {
      const key = `work:${attachment.id}`;
      const override = overrideFor(key);
      const promoted = override.mediaAssetId
        ? mediaAssets.find((asset) => asset.id === override.mediaAssetId)
        : mediaBySourceKey.get(key);
      rows.push({
        key,
        sourceKind: "work_card",
        sourceId: attachment.id,
        name: override.name || attachment.nome,
        url: attachment.url,
        type: inferType(attachment.mimeType, attachment.nome),
        size: attachment.tamanho,
        createdAt: attachment.createdAt,
        origin: attachment.pipeline === "suporte" || String(attachment.origem ?? "").includes("assist") ? "Assistência" : "Execução",
        folderPath: normalizeFolder(
          override.folderPath ??
          automaticFolder({
            name: attachment.nome,
            origin: attachment.origem,
            type: inferType(attachment.mimeType, attachment.nome),
            pipeline: attachment.pipeline,
          })
        ),
        marketingStatus: promoted ? "approved" : (override.marketingStatus ?? "only_attachment"),
        mediaAssetId: promoted?.id ?? override.mediaAssetId,
      });
    }

    for (const asset of mediaAssets) {
      const metadata = asRecord(asset.metadata);
      if (metadataString(metadata, "leadId") !== leadId) continue;
      const sourceKey = metadataString(metadata, "sourceAttachmentKey");
      if (sourceKey && rows.some((row) => row.key === sourceKey)) continue;
      const context = asRecord(metadata.context);
      const key = `media:${asset.id}`;
      const override = overrideFor(key);
      rows.push({
        key,
        sourceKind: "media",
        sourceId: asset.id,
        name: override.name || metadataString(metadata, "displayName") || asset.originalFilename || "Mídia",
        url: asset.storageUrl,
        type: asset.type,
        size: asset.fileSize,
        createdAt: asset.createdAt,
        origin: context.type === "client" ? "Mídias do cliente" : "Central de Mídias",
        folderPath: normalizeFolder(
          override.folderPath ??
          metadataString(metadata, "folderPath") ??
          automaticFolder({
            name: metadataString(metadata, "displayName") || asset.originalFilename,
            category: metadataString(metadata, "category"),
            origin: asset.source,
            type: asset.type,
          })
        ),
        marketingStatus: "approved",
        mediaAssetId: asset.id,
      });
    }

    const seen = new Set<string>();
    return rows
      .filter((row) => {
        const fingerprint = `${canonicalStorageUrl(row.url)}|${row.name}`;
        if (seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
      })
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentState, activities, workAttachments, mediaAssets, leadId]);

  const folders = useMemo(() => {
    const all = new Set<string>([...CORE_FOLDERS, ...attachmentState.folders]);
    unified.forEach((item) => { if (item.folderPath) all.add(item.folderPath); });
    return [...all].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [attachmentState.folders, unified]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return unified.filter((item) => {
      if (folderFilter && item.folderPath !== folderFilter) return false;
      if (filter === "project" && item.category !== "projeto") return false;
      if (filter !== "all" && filter !== "project" && item.type !== filter) return false;
      if (term && !`${item.name} ${item.origin} ${item.folderPath} ${typeLabel(item)}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [unified, search, folderFilter, filter]);

  function openFilePicker(folder = "") {
    setUploadTargetFolder(normalizeFolder(folder));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || !leadId) return;
    const targetFolder = normalizeFolder(uploadTargetFolder);
    setUploading(true);
    try {
      const created: StoredLeadAttachment[] = [];
      for (const file of files) {
        const type = inferType(file.type, file.name);
        const maxBytes = uploadLimitBytes(type);
        if (file.size > maxBytes) {
          const label = type === "image" ? "imagem" : type === "video" ? "vídeo" : type === "audio" ? "áudio" : "documento";
          throw new Error(`${file.name}: tamanho máximo para ${label} é ${formatBytes(maxBytes)}`);
        }
        setUploadProgress({ name: file.name, loaded: 0, total: file.size });
        const meta = await requestJson<{ uploadURL: string; objectPath: string }>("/api/storage/uploads/request-url", {
          method: "POST",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        await uploadDirectWithProgress(meta.uploadURL, file, (loaded, total) => {
          setUploadProgress({ name: file.name, loaded, total });
        });
        created.push({
          id: crypto.randomUUID(),
          name: file.name,
          storageUrl: meta.objectPath,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
          type,
          folderPath: targetFolder || automaticFolder({ name: file.name, type, origin: "Importação manual" }),
          marketingStatus: "only_attachment",
          createdAt: new Date().toISOString(),
        });
      }
      await persistAttachmentState({ ...attachmentState, files: [...attachmentState.files, ...created] });
      if (targetFolder) setFolderFilter(targetFolder);
      toast({
        title: created.length === 1 ? "Arquivo adicionado" : `${created.length} arquivos adicionados`,
        description: targetFolder
          ? `Adicionado em ${targetFolder}. Nada foi liberado para marketing automaticamente.`
          : "Entraram em Anexos. Nada foi liberado para marketing automaticamente.",
      });
    } catch (error) {
      toast({
        title: "Falha no upload",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setUploadTargetFolder("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function createFolder() {
    const folder = normalizeFolder(folderDraft);
    if (!folder) return;
    const nextFolders = [...new Set([...attachmentState.folders, folder])];
    try {
      await persistAttachmentState({ ...attachmentState, folders: nextFolders });
      setFolderFilter(folder);
      setFolderDraft("");
      setFolderDialogOpen(false);
      toast({ title: "Pasta criada" });
    } catch (error) {
      toast({ title: "Não foi possível criar a pasta", description: String(error), variant: "destructive" });
    }
  }

  function openEdit(item: UnifiedAttachment) {
    setEditItem(item);
    setEditName(item.name);
    setEditFolder(item.folderPath);
  }

  async function saveEdit() {
    if (!editItem || !editName.trim()) return;
    const overrides = {
      ...attachmentState.overrides,
      [editItem.key]: {
        ...attachmentState.overrides[editItem.key],
        name: editName.trim(),
        folderPath: normalizeFolder(editFolder),
      },
    };
    try {
      await persistAttachmentState({ ...attachmentState, overrides });
      setEditItem(null);
      toast({ title: "Anexo atualizado" });
    } catch (error) {
      toast({ title: "Não foi possível atualizar", description: String(error), variant: "destructive" });
    }
  }

  async function setMarketingStatus(item: UnifiedAttachment, status: MarketingStatus) {
    const overrides = {
      ...attachmentState.overrides,
      [item.key]: {
        ...attachmentState.overrides[item.key],
        marketingStatus: status,
      },
    };
    try {
      await persistAttachmentState({ ...attachmentState, overrides });
      toast({ title: status === "blocked" ? "Arquivo protegido do marketing" : "Classificação atualizada" });
    } catch (error) {
      toast({ title: "Não foi possível alterar a classificação", description: String(error), variant: "destructive" });
    }
  }

  async function approveForMedia(item: UnifiedAttachment) {
    if (!tenantId || !leadId || item.mediaAssetId) return;
    setSaving(true);
    try {
      const created = await requestJson<{ asset: MediaAsset }>(`/api/tenants/${tenantId}/media/assets`, {
        method: "POST",
        body: JSON.stringify({
          type: item.type,
          role: "source",
          storageUrl: canonicalStorageUrl(item.url),
          mimeType: item.type === "image" ? "image/*" : undefined,
          fileSize: item.size ?? undefined,
          originalFilename: item.name,
          source: "imported",
          metadata: {
            leadId,
            sourceAttachmentKey: item.key,
            displayName: item.name,
            folderPath: item.folderPath,
            marketingStatus: "approved",
            marketingApproved: true,
            marketingApprovedAt: new Date().toISOString(),
            sourceOrigin: item.origin,
            context: { type: "client", label: leadName, leadId },
          },
        }),
      });
      const overrides = {
        ...attachmentState.overrides,
        [item.key]: {
          ...attachmentState.overrides[item.key],
          marketingStatus: "approved" as MarketingStatus,
          mediaAssetId: created.asset.id,
        },
      };
      await persistAttachmentState({ ...attachmentState, overrides });
      setMediaAssets((current) => [created.asset, ...current]);
      toast({ title: "Aprovado para Mídias", description: "Agora o arquivo pode ser usado no marketing e pelos geradores de IA." });
    } catch (error) {
      toast({ title: "Não foi possível aprovar para Mídias", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!tenantId || !leadId) {
    return <Card><CardContent className="py-8 text-sm text-muted-foreground">Não foi possível identificar o cliente desta tela.</CardContent></Card>;
  }

  return (
    <Card data-testid="lead-attachments-tab">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Paperclip className="h-4 w-4" />Anexos do cliente</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Repositório central do lead: documentos, financeiro, projetos, imagens, vídeos e áudios aparecem juntos e são organizados automaticamente em pastas. Arquivos externos também podem ser importados.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
              onChange={(event) => void uploadFiles(Array.from(event.target.files ?? []))}
            />
            <Button size="sm" className="gap-1.5" onClick={() => openFilePicker()} disabled={uploading || saving}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading && uploadProgress
                ? ` Enviando ${Math.min(100, Math.round((uploadProgress.loaded / Math.max(1, uploadProgress.total)) * 100))}%`
                : " Importar arquivo"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setFolderDialogOpen(true)} disabled={saving}>
              <Plus className="h-4 w-4" /> Nova pasta
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            {uploading && uploadProgress && (
              <span className="max-w-72 truncate text-xs text-muted-foreground" title={uploadProgress.name}>
                {uploadProgress.name} · {formatBytes(uploadProgress.loaded)} de {formatBytes(uploadProgress.total)}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {([
              ["all", "Todos"], ["image", "Imagens"], ["video", "Vídeos"], ["audio", "Áudios"], ["document", "Documentos"], ["project", "Projetos"],
            ] as Array<[FilterType, string]>).map(([value, label]) => (
              <Button key={value} type="button" size="sm" variant={filter === value ? "secondary" : "ghost"} className="h-8 px-3 text-xs" onClick={() => setFilter(value)}>{label}</Button>
            ))}
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar arquivos, pastas..." className="h-9 pl-9" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Pastas</h3>{folderFilter && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFolderFilter("")}>Ver todos</Button>}</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {folders.length === 0 ? (
              <button type="button" onClick={() => setFolderDialogOpen(true)} className="flex min-h-16 items-center justify-center gap-2 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted/40"><Folder className="h-4 w-4" />Criar primeira pasta</button>
            ) : folders.map((folder) => {
              const count = unified.filter((item) => item.folderPath === folder).length;
              return (
                <div key={folder} className={`group rounded-lg border p-2 transition-colors hover:bg-muted/50 ${folderFilter === folder ? "border-primary bg-primary/5" : ""}`}>
                  <button type="button" onClick={() => setFolderFilter(folder)} className="flex w-full items-center gap-3 p-1 text-left">
                    <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{folder}</p><p className="text-xs text-muted-foreground">{count} arquivo{count === 1 ? "" : "s"}</p></div>
                  </button>
                  <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 w-full justify-start gap-1.5 px-2 text-[11px] text-muted-foreground group-hover:text-foreground" onClick={() => openFilePicker(folder)} disabled={uploading || saving}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar arquivo
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Arquivos</h3>
              {folderFilter && <Badge variant="outline" className="max-w-64 truncate text-[10px]">{folderFilter}</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {folderFilter && (
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => openFilePicker(folderFilter)} disabled={uploading || saving}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Adicionar arquivos nesta pasta
                </Button>
              )}
              <span className="text-xs text-muted-foreground">{visible.length} de {unified.length}</span>
            </div>
          </div>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="h-52 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center"><Paperclip className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-2 text-sm font-medium">Nenhum anexo neste filtro</p><p className="mt-1 text-xs text-muted-foreground">Adicione um arquivo ou altere os filtros.</p></div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((item) => (
                <div key={item.key} className="overflow-hidden rounded-xl border bg-background shadow-sm">
                  <a href={displayUrl(item.url)} target="_blank" rel="noreferrer" className="block">
                    <div className="flex aspect-video items-center justify-center overflow-hidden bg-muted/60">
                      {item.type === "image" ? <img src={displayUrl(item.url)} alt={item.name} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl border bg-background text-muted-foreground"><TypeIcon type={item.type} /></div>}
                    </div>
                  </a>
                  <div className="space-y-2 p-3">
                    <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" title={item.name}>{item.name}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.origin}{item.folderPath ? ` · ${item.folderPath}` : ""}</p></div><button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => openEdit(item)} title="Renomear ou mover"><Pencil className="h-3.5 w-3.5" /></button></div>
                    <div className="flex flex-wrap gap-1"><Badge variant="outline" className="text-[10px]">{typeLabel(item)}</Badge><Badge variant="outline" className={`text-[10px] ${statusClass(item.marketingStatus)}`}>{statusLabel(item.marketingStatus)}</Badge></div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>{formatBytes(item.size)}</span><span>{formatDate(item.createdAt)}</span></div>
                    {item.marketingStatus !== "approved" ? (
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[10px]" onClick={() => void setMarketingStatus(item, "candidate")} disabled={saving}><Sparkles className="h-3 w-3" />Candidato</Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[10px] text-rose-600" onClick={() => void setMarketingStatus(item, "blocked")} disabled={saving}><Ban className="h-3 w-3" />Não usar</Button>
                        <Button size="sm" className="col-span-2 h-7 gap-1 px-2 text-[10px]" onClick={() => void approveForMedia(item)} disabled={saving}><CheckCircle2 className="h-3 w-3" />Aprovar para Mídias</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1.5 text-[10px] font-medium text-emerald-700"><CheckCircle2 className="h-3 w-3" />Disponível para marketing e IA</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-800">
          <p className="font-medium">Regra de segurança para marketing</p>
          <p className="mt-1 text-blue-700">Fotos de problemas, manutenção, evidências técnicas e registros internos permanecem em Anexos. A Central de Mídias e os geradores de marketing recebem somente arquivos explicitamente aprovados.</p>
        </div>
      </CardContent>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Nova pasta</DialogTitle></DialogHeader><div className="space-y-1.5"><label className="text-sm font-medium">Nome da pasta</label><Input value={folderDraft} onChange={(event) => setFolderDraft(event.target.value)} placeholder="Ex: Obras bonitas / Fachadas" onKeyDown={(event) => { if (event.key === "Enter") void createFolder(); }} /></div><DialogFooter><Button variant="outline" onClick={() => setFolderDialogOpen(false)}>Cancelar</Button><Button onClick={() => void createFolder()} disabled={!normalizeFolder(folderDraft) || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar pasta</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(editItem)} onOpenChange={(open) => { if (!open) setEditItem(null); }}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Organizar anexo</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><label className="text-sm font-medium">Nome do arquivo</label><Input value={editName} onChange={(event) => setEditName(event.target.value)} /></div><div className="space-y-1.5"><label className="text-sm font-medium">Pasta</label><Input value={editFolder} onChange={(event) => setEditFolder(event.target.value)} placeholder="Ex: Projetos / Residência" /><p className="text-xs text-muted-foreground">Você pode usar uma pasta existente ou digitar um novo caminho.</p></div></div><DialogFooter><Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button><Button onClick={() => void saveEdit()} disabled={!editName.trim() || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button></DialogFooter></DialogContent>
      </Dialog>
    </Card>
  );
}
