import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  useListProdutosCatalogo,
  getListProdutosCatalogoQueryKey,
  useListVarejoProdutos,
  getListVarejoProdutosQueryKey,
  useListSupermercadoProdutos,
  getListSupermercadoProdutosQueryKey,
  useListInsumos,
  getListInsumosQueryKey,
} from "@workspace/api-client-react";
import {
  Sparkles, Copy, Trash2, Loader2, Instagram, Clapperboard, Image,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp, ExternalLink, Upload,
  Pencil, Check, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ContentType = "feed" | "stories" | "reels";
type ProductSource = "catalog" | "varejo" | "supermercado" | "insumo";

interface FeedVariation { caption: string; hashtags: string[]; imageUrl?: string }
interface StoriesVariation { text: string; cta: string; imageUrl?: string }
interface ReelsScene { visual: string; fala: string; duracao: string }
interface ReelsVariation { title: string; scenes: ReelsScene[]; audioSuggestion: string; cta: string; videoUrl?: string }
type ContentVariation = FeedVariation | StoriesVariation | ReelsVariation;

interface ContentGenerationResult { variations: ContentVariation[] }

interface ContentGeneration {
  id: string;
  tenantId: string;
  type: ContentType;
  productId?: string | null;
  productName?: string | null;
  theme: string;
  result: ContentGenerationResult;
  tokensUsed: number;
  createdAt: string;
}

interface ListContentResponse {
  items: ContentGeneration[];
  monthlyUsed: number;
  monthlyLimit: number;
}

const TYPE_CONFIG = {
  feed: {
    label: "Feed",
    icon: Image,
    description: "Legenda completa + hashtags para publicação no Feed",
    placeholder: "Ex: Lançamento do nosso produto premium de verão, ressaltando qualidade e exclusividade",
  },
  stories: {
    label: "Stories",
    icon: Instagram,
    description: "Texto curto + CTA para Stories (formato 9:16)",
    placeholder: "Ex: Promoção relâmpago só hoje — desconto especial para seguidores",
  },
  reels: {
    label: "Reels",
    icon: Clapperboard,
    description: "Roteiro completo com cenas, falas e sugestão de trilha",
    placeholder: "Ex: Mostrar bastidores do processo de produção de forma dinâmica e envolvente",
  },
};

const VERTICAL_PLACEHOLDERS: Record<string, Record<ContentType, string>> = {
  "Varejo de Roupas & Acessórios": {
    feed: "Ex: Nova coleção de inverno chegou — looks exclusivos para arrasar na temporada",
    stories: "Ex: Grade completa de tamanhos P ao GG disponível — corre que vai esgotar!",
    reels: "Ex: Mostrar um unboxing da nova coleção com transição de looks do dia a dia",
  },
  Supermercado: {
    feed: "Ex: Oferta da semana no filé mignon — qualidade premium com preço imbatível",
    stories: "Ex: Hortifrúti fresquinho todo dia — direto do produtor para a sua mesa",
    reels: "Ex: Receita rápida usando produtos em promoção desta semana",
  },
  "Construção & Reforma": {
    feed: "Ex: Lançamento da linha premium de porcelanato — acabamento de alto padrão para sua obra",
    stories: "Ex: Entrega expressa de materiais na sua obra — peça hoje e receba amanhã",
    reels: "Ex: Antes e depois de uma reforma com nossos materiais — transformação incrível",
  },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2 text-xs">
      {copied ? (
        <><CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />Copiado</>
      ) : (
        <><Copy className="h-3 w-3 mr-1" />Copiar</>
      )}
    </Button>
  );
}

function FeedCard({
  v,
  editing = false,
  editedCaption = "",
  editedHashtags = "",
  onChangeCaption,
  onChangeHashtags,
}: {
  v: FeedVariation;
  editing?: boolean;
  editedCaption?: string;
  editedHashtags?: string;
  onChangeCaption?: (val: string) => void;
  onChangeHashtags?: (val: string) => void;
}) {
  const displayCaption = editing ? editedCaption : v.caption;
  const displayHashtagsStr = editing ? editedHashtags : v.hashtags.join(" ");
  const fullText = `${displayCaption}\n\n${displayHashtagsStr}`;
  return (
    <div className="space-y-3">
      {v.imageUrl && (
        <div className="rounded-lg overflow-hidden border bg-muted/30 aspect-square max-w-sm mx-auto">
          <img
            src={v.imageUrl}
            alt="Imagem gerada para o Feed"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <Textarea
            value={editedCaption}
            onChange={(e) => onChangeCaption?.(e.target.value)}
            className="text-sm flex-1 min-h-[120px] resize-y"
            placeholder="Legenda do post…"
          />
        ) : (
          <>
            <p className="text-sm leading-relaxed whitespace-pre-wrap flex-1">{v.caption}</p>
            <CopyButton text={fullText} />
          </>
        )}
      </div>
      {editing ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Hashtags (separadas por espaço)</Label>
          <input
            value={editedHashtags}
            onChange={(e) => onChangeHashtags?.(e.target.value)}
            className="w-full text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="#hashtag1 #hashtag2 #hashtag3"
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {v.hashtags.map((h) => (
            <span key={h} className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">{h}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function StoriesCard({
  v,
  editing = false,
  editedText = "",
  editedCta = "",
  onChangeText,
  onChangeCta,
}: {
  v: StoriesVariation;
  editing?: boolean;
  editedText?: string;
  editedCta?: string;
  onChangeText?: (val: string) => void;
  onChangeCta?: (val: string) => void;
}) {
  const displayText = editing ? editedText : v.text;
  const displayCta = editing ? editedCta : v.cta;
  return (
    <div className="space-y-3">
      {v.imageUrl && (
        <div className="rounded-lg overflow-hidden border bg-muted/30 mx-auto" style={{ maxWidth: "200px", aspectRatio: "9/16" }}>
          <img
            src={v.imageUrl}
            alt="Imagem gerada para Stories"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          {editing ? (
            <Textarea
              value={editedText}
              onChange={(e) => onChangeText?.(e.target.value)}
              className="text-sm min-h-[80px] resize-y"
              placeholder="Texto do Stories…"
            />
          ) : (
            <p className="text-sm font-medium leading-relaxed">{displayText}</p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CTA:</span>
            {editing ? (
              <input
                value={editedCta}
                onChange={(e) => onChangeCta?.(e.target.value)}
                className="flex-1 text-xs border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Ex: Arrasta pra cima"
              />
            ) : (
              <span className="text-xs bg-muted px-2 py-1 rounded font-medium">{displayCta}</span>
            )}
          </div>
        </div>
        {!editing && <CopyButton text={`${displayText}\n\n${displayCta}`} />}
      </div>
    </div>
  );
}

function ReelsCard({ v }: { v: ReelsVariation }) {
  const scriptText = [
    `🎬 ${v.title}`,
    "",
    ...v.scenes.map((s, i) => `Cena ${i + 1} (${s.duracao})\nVisual: ${s.visual}\nFala: ${s.fala}`),
    "",
    `🎵 Trilha sugerida: ${v.audioSuggestion}`,
    `📢 CTA: ${v.cta}`,
  ].join("\n");

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-sm flex-1">🎬 {v.title}</h4>
        <CopyButton text={scriptText} />
      </div>
      {v.videoUrl && (
        <video
          src={v.videoUrl}
          controls
          className="w-full rounded-md max-h-72 bg-black"
        />
      )}
      <div className="space-y-2">
        {v.scenes.map((scene, i) => (
          <div key={i} className="border rounded-md p-3 bg-muted/30 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono">Cena {i + 1}</Badge>
              <span className="text-xs text-muted-foreground">{scene.duracao}</span>
            </div>
            <p className="text-muted-foreground"><span className="font-medium text-foreground">Visual:</span> {scene.visual}</p>
            <p className="text-muted-foreground"><span className="font-medium text-foreground">Fala/texto:</span> {scene.fala}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="text-muted-foreground">🎵 <span className="font-medium text-foreground">{v.audioSuggestion}</span></span>
        <span className="text-muted-foreground">📢 <span className="font-medium text-foreground">{v.cta}</span></span>
      </div>
    </div>
  );
}

function PublishInstagramButton({
  contentId,
  variationIndex,
  hasImage,
  tenantId,
  captionOverride,
}: {
  contentId: string;
  variationIndex: number;
  hasImage: boolean;
  tenantId: string;
  captionOverride?: string;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [publishing, setPublishing] = useState(false);

  async function handlePublish() {
    if (!hasImage) {
      toast({
        title: "Imagem expirada",
        description: "Imagens do DALL-E expiram em ~1h. Regere o conteúdo para publicar.",
        variant: "destructive",
      });
      return;
    }
    setPublishing(true);
    try {
      const body: Record<string, unknown> = { variationIndex };
      if (captionOverride !== undefined) body["captionOverride"] = captionOverride;
      const res = await fetch(`/api/tenants/${tenantId}/content/${contentId}/publish-instagram`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        const isNotConnected = data.error?.toLowerCase().includes("não conectado") ||
          data.error?.toLowerCase().includes("page access");
        toast({
          title: isNotConnected ? "Instagram não configurado" : "Falha ao publicar",
          description: isNotConnected
            ? "Configure o Page Access Token e o Page ID em Configurações para publicar no Instagram."
            : (data.error ?? "Erro desconhecido"),
          variant: "destructive",
          action: isNotConnected ? (
            <ToastAction altText="Ir para Configurações" onClick={() => navigate("/configuracoes")}>
              Configurar agora
            </ToastAction>
          ) : undefined,
        });
      } else {
        toast({ title: "Publicado no Instagram!", description: "Post publicado com sucesso." });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handlePublish}
      disabled={publishing}
      title={!hasImage ? "Imagem expirada — regere o conteúdo para publicar" : "Publicar no Instagram"}
      className={cn("h-7 px-2 text-xs gap-1", !hasImage && "opacity-50")}
    >
      {publishing
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <Instagram className="h-3 w-3" />}
      {publishing ? "Publicando…" : "Publicar"}
    </Button>
  );
}

function MediaUploadButton({
  contentId,
  variationIndex,
  tenantId,
  mediaType,
  onUploaded,
}: {
  contentId: string;
  variationIndex: number;
  tenantId: string;
  mediaType: "image" | "video";
  onUploaded: (mediaUrl: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isVideo = mediaType === "video";
  const allowedTypes = isVideo
    ? ["video/mp4", "video/quicktime", "video/webm"]
    : ["image/jpeg", "image/png", "image/webp"];
  const maxBytes = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
  const accept = isVideo ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp";
  const field = isVideo ? "videoUrl" : "imageUrl";

  async function handleFile(file: File) {
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Formato inválido",
        description: isVideo ? "Use MP4, MOV ou WebM." : "Use JPG, PNG ou WebP.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > maxBytes) {
      toast({
        title: `${isVideo ? "Vídeo" : "Imagem"} muito grande`,
        description: `Máximo ${isVideo ? "100" : "10"} MB.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) throw new Error("Falha ao obter URL de upload");
      const { uploadURL, objectPath } = (await metaRes.json()) as { uploadURL: string; objectPath: string };

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error(`Falha ao enviar ${isVideo ? "vídeo" : "imagem"}`);

      const patchRes = await fetch(
        `/api/tenants/${tenantId}/content/${contentId}/variations/${variationIndex}/image`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
          },
          body: JSON.stringify({ objectPath, field }),
        }
      );
      if (!patchRes.ok) throw new Error(`Falha ao salvar ${isVideo ? "vídeo" : "imagem"}`);
      const { mediaUrl } = (await patchRes.json()) as { mediaUrl: string };

      onUploaded(mediaUrl);
      qc.invalidateQueries({ queryKey: ["content", tenantId] });
      toast({
        title: `${isVideo ? "Vídeo" : "Imagem"} atualizado!`,
        description: `${isVideo ? "Vídeo" : "Imagem"} salvo e pronto para publicar.`,
      });
    } catch (err) {
      toast({ title: "Erro no upload", description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title={isVideo ? "Usar meu vídeo" : "Usar minha imagem"}
        className="h-7 px-2 text-xs gap-1"
      >
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {uploading ? "Enviando…" : isVideo ? "Meu vídeo" : "Minha imagem"}
      </Button>
    </>
  );
}

function VariationCard({
  index,
  type,
  variation,
  contentId,
  tenantId,
}: {
  index: number;
  type: ContentType;
  variation: ContentVariation;
  contentId?: string;
  tenantId?: string;
}) {
  const [localImageUrl, setLocalImageUrl] = useState<string | undefined>(undefined);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | undefined>(undefined);

  const effectiveVariation =
    type === "reels"
      ? localVideoUrl ? { ...variation, videoUrl: localVideoUrl } : variation
      : localImageUrl ? { ...variation, imageUrl: localImageUrl } : variation;

  const hasImage = !!(effectiveVariation as { imageUrl?: string }).imageUrl;

  const [editing, setEditing] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editHashtags, setEditHashtags] = useState("");
  const [editText, setEditText] = useState("");
  const [editCta, setEditCta] = useState("");
  const [savedCaption, setSavedCaption] = useState<string | undefined>(undefined);
  const [savedHashtags, setSavedHashtags] = useState<string | undefined>(undefined);
  const [savedText, setSavedText] = useState<string | undefined>(undefined);
  const [savedCta, setSavedCta] = useState<string | undefined>(undefined);

  const hasEdits =
    savedCaption !== undefined || savedHashtags !== undefined ||
    savedText !== undefined || savedCta !== undefined;

  const displayVariation: ContentVariation = (() => {
    if (type === "feed") {
      const v = effectiveVariation as FeedVariation;
      return {
        ...v,
        caption: savedCaption ?? v.caption,
        hashtags: savedHashtags !== undefined
          ? savedHashtags.split(/\s+/).filter(Boolean)
          : v.hashtags,
      };
    }
    if (type === "stories") {
      const v = effectiveVariation as StoriesVariation;
      return { ...v, text: savedText ?? v.text, cta: savedCta ?? v.cta };
    }
    return effectiveVariation;
  })();

  const captionOverride: string | undefined = (() => {
    if (!hasEdits) return undefined;
    if (type === "feed") {
      const v = displayVariation as FeedVariation;
      return `${v.caption}\n\n${v.hashtags.join(" ")}`;
    }
    return undefined;
  })();

  function startEdit() {
    if (type === "feed") {
      const v = displayVariation as FeedVariation;
      setEditCaption(v.caption);
      setEditHashtags(v.hashtags.join(" "));
    } else if (type === "stories") {
      const v = displayVariation as StoriesVariation;
      setEditText(v.text);
      setEditCta(v.cta);
    }
    setEditing(true);
  }

  function saveEdit() {
    if (type === "feed") {
      setSavedCaption(editCaption);
      setSavedHashtags(editHashtags);
    } else if (type === "stories") {
      setSavedText(editText);
      setSavedCta(editCta);
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  const canEdit = type !== "reels";

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Variação {index + 1}
            </CardTitle>
            {hasEdits && !editing && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">editado</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelEdit}
                  className="h-7 px-2 text-xs gap-1 text-muted-foreground"
                >
                  <X className="h-3 w-3" />
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={saveEdit}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <Check className="h-3 w-3" />
                  Salvar
                </Button>
              </>
            ) : (
              <>
                {canEdit && contentId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startEdit}
                    className="h-7 px-2 text-xs gap-1 text-muted-foreground"
                    title="Editar texto antes de publicar"
                  >
                    <Pencil className="h-3 w-3" />
                    Editar
                  </Button>
                )}
                {contentId && tenantId && (
                  <MediaUploadButton
                    contentId={contentId}
                    variationIndex={index}
                    tenantId={tenantId}
                    mediaType={type === "reels" ? "video" : "image"}
                    onUploaded={type === "reels" ? setLocalVideoUrl : setLocalImageUrl}
                  />
                )}
                {type !== "reels" && contentId && tenantId && (
                  <PublishInstagramButton
                    contentId={contentId}
                    variationIndex={index}
                    hasImage={hasImage}
                    tenantId={tenantId}
                    captionOverride={captionOverride}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {type === "feed" && (
          <FeedCard
            v={displayVariation as FeedVariation}
            editing={editing}
            editedCaption={editCaption}
            editedHashtags={editHashtags}
            onChangeCaption={setEditCaption}
            onChangeHashtags={setEditHashtags}
          />
        )}
        {type === "stories" && (
          <StoriesCard
            v={displayVariation as StoriesVariation}
            editing={editing}
            editedText={editText}
            editedCta={editCta}
            onChangeText={setEditText}
            onChangeCta={setEditCta}
          />
        )}
        {type === "reels" && <ReelsCard v={effectiveVariation as ReelsVariation} />}
      </CardContent>
    </Card>
  );
}

function HistoryItem({
  item,
  onDelete,
}: {
  item: ContentGeneration;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[item.type];
  const Icon = cfg.icon;
  const date = new Date(item.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="py-3 border-b last:border-0">
      {/* ── Header row — click to expand ──────────────────────── */}
      <div
        className="flex items-start gap-3 cursor-pointer hover:bg-muted/30 rounded-md -mx-2 px-2 py-1 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.theme}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant="secondary" className="text-xs capitalize">{cfg.label}</Badge>
            {item.productName && (
              <span className="text-xs text-muted-foreground truncate">{item.productName}</span>
            )}
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* ── Expanded content ───────────────────────────────────── */}
      {expanded && (
        <div className="mt-3 space-y-3 px-1">
          <div className="flex items-start gap-1.5 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
            <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Para publicar: copie o texto e publique manualmente no Instagram.
              {item.type !== "reels" && " Imagens geradas pela IA ficam disponíveis por até 1h após a geração."}
            </span>
          </div>
          {item.result.variations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Sem variações salvas.</p>
          ) : (
            item.result.variations.map((v, i) => (
              <VariationCard key={i} index={i} type={item.type} variation={v} contentId={item.id} tenantId={item.tenantId} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function verticalToSource(vertical: string | null | undefined): ProductSource {
  if (vertical?.includes("Varejo") || vertical?.includes("Roupa")) return "varejo";
  if (vertical?.includes("Supermercado") || vertical?.includes("Mercado")) return "supermercado";
  if (vertical?.includes("Construção") || vertical?.includes("Reforma")) return "insumo";
  return "catalog";
}

function verticalProductLabel(vertical: string | null | undefined): string {
  if (vertical?.includes("Varejo") || vertical?.includes("Roupa")) return "Produto do catálogo de moda";
  if (vertical?.includes("Supermercado") || vertical?.includes("Mercado")) return "Produto do supermercado";
  if (vertical?.includes("Construção") || vertical?.includes("Reforma")) return "Insumo / material";
  return "Produto do catálogo";
}

export default function Content() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tenantId = user?.tenantId ?? "";
  const vertical = user?.tenantVertical ?? null;
  const productSource = verticalToSource(vertical);

  const [activeTab, setActiveTab] = useState<ContentType>("feed");
  const [theme, setTheme] = useState("");
  const [productId, setProductId] = useState<string>("none");
  const [variations, setVariations] = useState(2);
  const [lastResult, setLastResult] = useState<ContentGeneration | null>(null);
  const [preImageUrl, setPreImageUrl] = useState<string | null>(null);
  const [preImageUploading, setPreImageUploading] = useState(false);
  const preImageInputRef = useRef<HTMLInputElement>(null);

  const isVarejo = productSource === "varejo";
  const isSupermercado = productSource === "supermercado";
  const isInsumo = productSource === "insumo";
  const isCatalog = productSource === "catalog";

  const { data: catalogProducts } = useListProdutosCatalogo(tenantId, {
    query: { enabled: !!tenantId && isCatalog, queryKey: getListProdutosCatalogoQueryKey(tenantId) },
  });
  const { data: varejoProducts } = useListVarejoProdutos(tenantId, undefined, {
    query: { enabled: !!tenantId && isVarejo, queryKey: getListVarejoProdutosQueryKey(tenantId) },
  });
  const { data: supermercadoProducts } = useListSupermercadoProdutos(tenantId, undefined, {
    query: { enabled: !!tenantId && isSupermercado, queryKey: getListSupermercadoProdutosQueryKey(tenantId) },
  });
  const { data: insumosProducts } = useListInsumos(tenantId, undefined, {
    query: { enabled: !!tenantId && isInsumo, queryKey: getListInsumosQueryKey(tenantId) },
  });

  const products: { id: string; nome: string }[] | undefined = isVarejo
    ? varejoProducts?.map((p) => ({ id: p.id, nome: p.nome }))
    : isSupermercado
    ? supermercadoProducts?.map((p) => ({ id: p.id, nome: p.nome }))
    : isInsumo
    ? insumosProducts?.map((p) => ({ id: p.id, nome: p.nome }))
    : catalogProducts?.map((p) => ({ id: p.id, nome: p.nome }));

  const { data: history, isLoading: historyLoading } = useQuery<ListContentResponse>({
    queryKey: ["content", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/content`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
  });

  const generateMutation = useMutation<ContentGeneration, Error, { type: ContentType; theme: string; productId?: string; productSource?: ProductSource; variations: number; imageUrl?: string }>({
    mutationFn: async (body) => {
      const res = await fetch(`/api/tenants/${tenantId}/content/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error ?? "Falha na geração");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setLastResult(data);
      qc.invalidateQueries({ queryKey: ["content", tenantId] });
    },
    onError: (err) => {
      toast({ title: "Erro na geração", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/tenants/${tenantId}/content/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (!res.ok) throw new Error("Erro ao deletar");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content", tenantId] });
    },
    onError: () => {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    },
  });

  async function handlePreImageUpload(file: File) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Formato inválido", description: "Use JPG, PNG ou WebP.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "Máximo 10 MB.", variant: "destructive" });
      return;
    }
    setPreImageUploading(true);
    try {
      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!metaRes.ok) throw new Error("Falha ao obter URL de upload");
      const { uploadURL, objectPath } = (await metaRes.json()) as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("Falha ao enviar imagem");
      setPreImageUrl(`/api/storage${objectPath}`);
      toast({ title: "Imagem carregada!", description: "Será usada em todas as variações geradas." });
    } catch (err) {
      toast({ title: "Erro no upload", description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setPreImageUploading(false);
    }
  }

  function handleGenerate() {
    if (!theme.trim()) {
      toast({ title: "Descreva o tema da publicação", variant: "destructive" });
      return;
    }
    setLastResult(null);
    generateMutation.mutate({
      type: activeTab,
      theme: theme.trim(),
      productId: productId !== "none" ? productId : undefined,
      productSource,
      variations,
      imageUrl: preImageUrl ?? undefined,
    });
  }

  const monthlyUsed = history?.monthlyUsed ?? 0;
  const monthlyLimit = history?.monthlyLimit ?? 20;
  const usagePct = Math.min((monthlyUsed / monthlyLimit) * 100, 100);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conteúdo para Instagram</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gere legendas, Stories e roteiros de Reels com IA, usando o contexto da sua marca.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Gerações este mês</p>
            <p className="text-sm font-semibold">
              {monthlyUsed}
              <span className="text-muted-foreground font-normal">/{monthlyLimit}</span>
            </p>
          </div>
          <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                usagePct >= 90 ? "bg-destructive" : usagePct >= 70 ? "bg-yellow-500" : "bg-primary"
              )}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as ContentType); setLastResult(null); }}>
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          {(Object.keys(TYPE_CONFIG) as ContentType[]).map((key) => {
            const Icon = TYPE_CONFIG[key].icon;
            return (
              <TabsTrigger key={key} value={key} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {TYPE_CONFIG[key].label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(Object.keys(TYPE_CONFIG) as ContentType[]).map((key) => (
          <TabsContent key={key} value={key} className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* ── Left: form ── */}
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Configurar geração</CardTitle>
                    <p className="text-xs text-muted-foreground">{TYPE_CONFIG[key].description}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>{verticalProductLabel(vertical)} (opcional)</Label>
                      <Select value={productId} onValueChange={setProductId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um produto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum — tema livre</SelectItem>
                          {products?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Tema / contexto da publicação <span className="text-destructive">*</span></Label>
                      <Textarea
                        placeholder={
                          (vertical && VERTICAL_PLACEHOLDERS[vertical]?.[key as ContentType]) ??
                          TYPE_CONFIG[key].placeholder
                        }
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                        rows={4}
                        className="resize-none text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Nº de variações</Label>
                      <div className="flex gap-2">
                        {[2, 3].map((n) => (
                          <Button
                            key={n}
                            variant={variations === n ? "default" : "outline"}
                            size="sm"
                            onClick={() => setVariations(n)}
                            className="w-12"
                          >
                            {n}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Image upload */}
                    <div className="space-y-1.5">
                      <Label>Imagem do cliente (opcional)</Label>
                      <input
                        ref={preImageInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handlePreImageUpload(f);
                          e.target.value = "";
                        }}
                      />
                      {preImageUrl ? (
                        <div className="relative rounded-lg overflow-hidden border border-border">
                          <img src={preImageUrl} alt="Imagem selecionada" className="w-full h-32 object-cover" />
                          <button
                            type="button"
                            onClick={() => setPreImageUrl(null)}
                            className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">
                            Imagem será incluída em todas as variações
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => preImageInputRef.current?.click()}
                          disabled={preImageUploading}
                          className="w-full border-2 border-dashed border-border rounded-lg py-4 flex flex-col items-center gap-1.5 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
                        >
                          {preImageUploading
                            ? <><Loader2 className="h-5 w-5 animate-spin" /><span className="text-xs">Enviando...</span></>
                            : <><Upload className="h-5 w-5" /><span className="text-xs">Clique para importar imagem</span><span className="text-[10px]">JPG, PNG ou WebP — máx. 10 MB</span></>
                          }
                        </button>
                      )}
                    </div>

                    <Button
                      className="w-full"
                      onClick={handleGenerate}
                      disabled={generateMutation.isPending || monthlyUsed >= monthlyLimit}
                    >
                      {generateMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</>
                      ) : (
                        <><Sparkles className="h-4 w-4 mr-2" />Gerar com IA</>
                      )}
                    </Button>

                    {monthlyUsed >= monthlyLimit && (
                      <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Limite mensal atingido. Upgrade de plano para continuar.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ── Right: results ── */}
              <div className="lg:col-span-3 space-y-4">
                {generateMutation.isPending && (
                  <Card>
                    <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        Gerando {variations} variações com IA...
                      </p>
                    </CardContent>
                  </Card>
                )}

                {!generateMutation.isPending && lastResult && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">
                      {lastResult.result.variations.length} variações geradas
                    </p>
                    {lastResult.result.variations.map((v, i) => (
                      <VariationCard key={i} index={i} type={lastResult.type} variation={v} contentId={lastResult.id} tenantId={tenantId} />
                    ))}
                  </div>
                )}

                {!generateMutation.isPending && !lastResult && (
                  <Card className="border-dashed">
                    <CardContent className="py-12 flex flex-col items-center gap-3 text-center text-muted-foreground">
                      <Sparkles className="h-10 w-10 opacity-30" />
                      <p className="text-sm">Preencha o tema ao lado e clique em <strong>Gerar com IA</strong></p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* History */}
      <div>
        <h2 className="text-base font-semibold mb-3">Histórico recente</h2>
        <Card>
          <CardContent className="p-0">
            {historyLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : history?.items?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma geração ainda — comece criando seu primeiro conteúdo acima.
              </p>
            ) : (
              <div className="px-4 divide-y">
                {history?.items.map((item) => (
                  <HistoryItem
                    key={item.id}
                    item={item}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
