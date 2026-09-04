import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SocialIntegrationsPanel } from "@/components/SocialIntegrationsPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  useGenerateContentStrategy,
} from "@workspace/api-client-react";
import {
  Sparkles, Copy, Trash2, Loader2, Instagram, Clapperboard, Image, ImageIcon,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp, ExternalLink, Upload,
  Pencil, Check, X, Wand2, Download, Archive, Eye, RefreshCw, Megaphone, Linkedin, Youtube, Music2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarketingContextSelector, type MarketingContextValue } from "@/components/marketing/MarketingContextSelector";
import JSZip from "jszip";

type ContentType = "feed" | "stories" | "reels" | "linkedin" | "youtube" | "tiktok";
type ProductSource = "catalog" | "varejo" | "supermercado" | "insumo";

interface FeedVariation { caption: string; hashtags: string[]; imageUrl?: string; imageUrls?: string[] }
interface StoriesVariation { text: string; cta: string; imageUrl?: string; imageUrls?: string[] }
interface ReelsScene { visual: string; fala: string; duracao: string }
interface ReelsVariation { title: string; scenes: ReelsScene[]; audioSuggestion: string; cta: string; videoUrl?: string }
interface LinkedInVariation { hook: string; caption: string; hashtags: string[] }
interface YouTubeScriptBlock { bloco: string; conteudo: string }
interface YouTubeVariation { titulo: string; descricao: string; tags: string[]; roteiro: YouTubeScriptBlock[] }
type ContentVariation = FeedVariation | StoriesVariation | ReelsVariation | LinkedInVariation | YouTubeVariation;

interface ContentStrategy {
  strategy: string;
  prompts: string[];
  headlines: string[];
  ctas: string[];
  captions: string[];
  hashtags: string[];
  approaches: string[];
  visualStyle: string;
}

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
  linkedin: {
    label: "LinkedIn",
    icon: Linkedin,
    description: "Post profissional (hook + corpo + hashtags) — tom consultivo, sem geração de imagem",
    placeholder: "Ex: Como reduzimos o tempo de resposta ao cliente em 40% — bastidores de um case real",
  },
  youtube: {
    label: "YouTube",
    icon: Youtube,
    description: "Roteiro pra gravar (gancho + desenvolvimento + encerramento) + título/descrição/tags prontos",
    placeholder: "Ex: Tutorial mostrando como funciona nosso processo de instalação, passo a passo",
  },
  tiktok: {
    label: "TikTok",
    icon: Music2,
    description: "Roteiro curto pra vídeo vertical (gancho + desenvolvimento + CTA), mesmo formato de Reels",
    placeholder: "Ex: Bastidores rápidos do processo de produção, formato dinâmico e envolvente",
  },
};

const VERTICAL_PLACEHOLDERS: Record<string, Partial<Record<ContentType, string>>> = {
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

function downloadImage(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function downloadAllImagesZip(
  variations: ContentVariation[],
  type: ContentType,
  setZipping?: (v: boolean) => void,
  toast?: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void,
) {
  try {
    setZipping?.(true);
    const zip = new JSZip();
    const folder = zip.folder(`${type}-images`);
    if (!folder) throw new Error("Falha ao criar pasta ZIP");

    const allUrls: { url: string; name: string }[] = [];
    variations.forEach((v, vi) => {
      const urls = (v as { imageUrls?: string[]; imageUrl?: string }).imageUrls ??
        ((v as { imageUrl?: string }).imageUrl ? [(v as { imageUrl?: string }).imageUrl!] : []);
      urls.forEach((url, ii) => {
        allUrls.push({ url, name: `${type}-v${vi + 1}-img${ii + 1}.png` });
      });
    });

    if (allUrls.length === 0) {
      toast?.({ title: "Nenhuma imagem para baixar", variant: "destructive" });
      return;
    }

    await Promise.all(
      allUrls.map(async ({ url, name }) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Falha ao buscar ${name}`);
        const blob = await res.blob();
        folder.file(name, blob);
      }),
    );

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = zipUrl;
    a.download = `${type}-images-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(zipUrl);
    toast?.({ title: `${allUrls.length} imagens baixadas em ZIP` });
  } catch (err) {
    toast?.({
      title: "Erro ao criar ZIP",
      description: err instanceof Error ? err.message : "Tente novamente",
      variant: "destructive",
    });
  } finally {
    setZipping?.(false);
  }
}

function SmartImageButton({
  imageUrl,
  tenantId,
  onDescribe,
}: {
  imageUrl: string;
  tenantId: string;
  onDescribe?: (desc: string) => void;
}) {
  const [describing, setDescribing] = useState(false);
  const { toast } = useToast();

  async function handleDescribe() {
    try {
      setDescribing(true);
      const res = await fetch(`/api/tenants/${tenantId}/content/describe-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify({ imageUrl }),
      });
      if (!res.ok) throw new Error("Falha ao descrever");
      const data = await res.json();
      onDescribe?.(data.description);
      toast({ title: "Imagem descrita!", description: "Tema atualizado com a descrição da imagem." });
    } catch (err) {
      toast({
        title: "Erro ao descrever imagem",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setDescribing(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      className="h-6 text-[10px] px-1.5 gap-0.5"
      onClick={handleDescribe}
      disabled={describing}
    >
      {describing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
      Descrever
    </Button>
  );
}

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
  onRemoveImage,
  onUploadClick,
}: {
  v: FeedVariation;
  editing?: boolean;
  editedCaption?: string;
  editedHashtags?: string;
  onChangeCaption?: (val: string) => void;
  onChangeHashtags?: (val: string) => void;
  onRemoveImage?: (imgIdx: number) => void;
  onUploadClick?: () => void;
}) {
  const displayCaption = editing ? editedCaption : v.caption;
  const displayHashtagsStr = editing ? editedHashtags : (v.hashtags ?? []).join(" ");
  const fullText = `${displayCaption}\n\n${displayHashtagsStr}`;
  const images = v.imageUrls ?? (v.imageUrl ? [v.imageUrl] : []);

  return (
    <div className="space-y-3">
      {images.length > 0 ? (
        <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1 max-w-sm mx-auto" : images.length === 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
          {images.map((url, idx) => (
            <div key={idx} className="rounded-lg overflow-hidden border bg-muted/30 aspect-square relative group">
              <img
                src={url}
                alt={`Imagem ${idx + 1} gerada para o Feed`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => onRemoveImage?.(idx)}
                  className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-red-600 text-white rounded-full p-0.5 transition-colors"
                  title="Remover imagem"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                    onClick={() => downloadImage(url, `feed-${idx + 1}.png`)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Baixar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : onUploadClick ? (
        <button
          onClick={onUploadClick}
          className="w-full border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 rounded-lg aspect-square max-w-sm mx-auto flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors bg-muted/10 hover:bg-primary/5"
        >
          <Upload className="h-7 w-7" />
          <span className="text-xs font-medium">Adicionar imagens</span>
          <span className="text-[10px] opacity-60">Clique para selecionar uma ou várias</span>
        </button>
      ) : null}
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
          {(v.hashtags ?? []).map((h) => (
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
  onRemoveImage,
  onUploadClick,
}: {
  v: StoriesVariation;
  editing?: boolean;
  editedText?: string;
  editedCta?: string;
  onChangeText?: (val: string) => void;
  onChangeCta?: (val: string) => void;
  onRemoveImage?: (imgIdx: number) => void;
  onUploadClick?: () => void;
}) {
  const displayText = editing ? editedText : v.text;
  const displayCta = editing ? editedCta : v.cta;
  const images = v.imageUrls ?? (v.imageUrl ? [v.imageUrl] : []);
  return (
    <div className="space-y-3">
      {images.length > 0 ? (
        <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1 max-w-[200px] mx-auto" : "grid-cols-2 max-w-[420px] mx-auto"}`}>
          {images.map((url, idx) => (
            <div key={idx} className="rounded-lg overflow-hidden border bg-muted/30 aspect-[9/16] relative group" style={{ maxWidth: "200px" }}>
              <img
                src={url}
                alt={`Imagem ${idx + 1} gerada para Stories`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => onRemoveImage?.(idx)}
                  className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-red-600 text-white rounded-full p-0.5 transition-colors"
                  title="Remover imagem"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                    onClick={() => downloadImage(url, `stories-${idx + 1}.png`)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Baixar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : onUploadClick ? (
        <button
          onClick={onUploadClick}
          className="mx-auto border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors bg-muted/10 hover:bg-primary/5"
          style={{ width: "200px", aspectRatio: "9/16" }}
        >
          <Upload className="h-7 w-7" />
          <span className="text-xs font-medium">Adicionar imagem</span>
          <span className="text-[10px] opacity-60">Clique para upload</span>
        </button>
      ) : null}
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
    ...(v.scenes ?? []).map((s, i) => `Cena ${i + 1} (${s.duracao})\nVisual: ${s.visual}\nFala: ${s.fala}`),
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
        {(v.scenes ?? []).map((scene, i) => (
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

function LinkedInCard({ v }: { v: LinkedInVariation }) {
  const fullText = [v.hook, "", v.caption, "", (v.hashtags ?? []).join(" ")].join("\n");
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-sm flex-1">💼 {v.hook}</h4>
        <CopyButton text={fullText} />
      </div>
      <p className="text-sm whitespace-pre-wrap">{v.caption}</p>
      {(v.hashtags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {v.hashtags.map((h, i) => (
            <Badge key={i} variant="outline" className="text-xs">{h}</Badge>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Sem publicação automática — copie e publique direto no LinkedIn.</p>
    </div>
  );
}

function YouTubeCard({ v }: { v: YouTubeVariation }) {
  const fullText = [
    `📹 ${v.titulo}`,
    "",
    v.descricao,
    "",
    `Tags: ${(v.tags ?? []).join(", ")}`,
    "",
    ...(v.roteiro ?? []).map((b) => `[${b.bloco}]\n${b.conteudo}`),
  ].join("\n");
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-sm flex-1">📹 {v.titulo}</h4>
        <CopyButton text={fullText} />
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{v.descricao}</p>
      {(v.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {v.tags.map((t, i) => (
            <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {(v.roteiro ?? []).map((bloco, i) => (
          <div key={i} className="border rounded-md p-3 bg-muted/30 text-sm space-y-1">
            <Badge variant="outline" className="text-xs font-mono">{bloco.bloco}</Badge>
            <p className="text-muted-foreground">{bloco.conteudo}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Roteiro pra gravar — nenhum vídeo é gerado automaticamente. Título/descrição/tags já vêm prontos pra colar no YouTube.</p>
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
      const data = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        const normalizedError = data.error?.toLowerCase() ?? "";
        const tokenInvalid = data.code === "INSTAGRAM_TOKEN_INVALID" ||
          normalizedError.includes("não conectado") ||
          normalizedError.includes("credenciais de publicação") ||
          normalizedError.includes("expirou");
        const permissionMissing = data.code === "INSTAGRAM_PERMISSION_MISSING";
        const reconnectRequired = tokenInvalid || permissionMissing;
        toast({
          title: tokenInvalid
            ? "Reconecte o Instagram"
            : permissionMissing
              ? "Permissão para publicar ausente"
              : "A Meta recusou a publicação",
          description: data.error ?? "A Meta não informou o motivo. Tente novamente.",
          variant: "destructive",
          action: reconnectRequired ? (
            <ToastAction altText="Reautorizar Instagram" onClick={() => navigate("/configuracoes?tab=integracoes")}>
              Reautorizar Instagram
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
  triggerRef,
  allowMultipleImages = false,
  currentImageCount = 0,
}: {
  contentId: string;
  variationIndex: number;
  tenantId: string;
  mediaType: "image" | "video";
  onUploaded: (mediaUrl: string, imageUrls?: string[]) => void;
  triggerRef?: React.MutableRefObject<(() => void) | null>;
  allowMultipleImages?: boolean;
  currentImageCount?: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (triggerRef) {
      triggerRef.current = () => inputRef.current?.click();
      return () => { if (triggerRef) triggerRef.current = null; };
    }
    return undefined;
  }, [triggerRef]);

  const isVideo = mediaType === "video";
  const allowedTypes = isVideo
    ? ["video/mp4", "video/quicktime", "video/webm"]
    : ["image/jpeg", "image/png", "image/webp"];
  const maxBytes = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
  const accept = isVideo ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp";
  const field = isVideo ? "videoUrl" : "imageUrl";
  const maxFeedImages = 10;

  function validateFile(file: File): string | null {
    if (!allowedTypes.includes(file.type)) {
      return isVideo ? "Use MP4, MOV ou WebM." : "Use JPG, PNG ou WebP.";
    }
    if (file.size > maxBytes) {
      return `Máximo ${isVideo ? "100" : "10"} MB por arquivo.`;
    }
    return null;
  }

  async function uploadFile(file: File, append: boolean): Promise<{ mediaUrl: string; imageUrls?: string[] }> {
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
        body: JSON.stringify({ objectPath, field, append }),
      }
    );
    const patchData = (await patchRes.json().catch(() => ({}))) as { mediaUrl?: string; imageUrls?: string[]; error?: string };
    if (!patchRes.ok || !patchData.mediaUrl) {
      throw new Error(patchData.error ?? `Falha ao salvar ${isVideo ? "vídeo" : "imagem"}`);
    }
    return { mediaUrl: patchData.mediaUrl, imageUrls: patchData.imageUrls };
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    const selectedFiles = !isVideo && allowMultipleImages ? files : files.slice(0, 1);

    for (const file of selectedFiles) {
      const validationError = validateFile(file);
      if (validationError) {
        toast({
          title: allowedTypes.includes(file.type) ? `${isVideo ? "Vídeo" : "Imagem"} muito grande` : "Formato inválido",
          description: validationError,
          variant: "destructive",
        });
        return;
      }
    }

    if (!isVideo && allowMultipleImages && currentImageCount + selectedFiles.length > maxFeedImages) {
      toast({
        title: "Máximo de 10 imagens",
        description: `Este post já tem ${currentImageCount} imagem(ns). Remova alguma antes de adicionar ${selectedFiles.length}.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: selectedFiles.length });
    try {
      let lastMediaUrl = "";
      let latestImageUrls: string[] | undefined;

      for (let i = 0; i < selectedFiles.length; i++) {
        setUploadProgress({ current: i + 1, total: selectedFiles.length });
        const result = await uploadFile(selectedFiles[i]!, !isVideo && allowMultipleImages);
        lastMediaUrl = result.mediaUrl;
        if (result.imageUrls) latestImageUrls = result.imageUrls;
      }

      if (lastMediaUrl) onUploaded(lastMediaUrl, latestImageUrls);
      qc.invalidateQueries({ queryKey: ["content", tenantId] });
      toast({
        title: !isVideo && selectedFiles.length > 1
          ? `${selectedFiles.length} imagens adicionadas!`
          : `${isVideo ? "Vídeo" : "Imagem"} atualizado!`,
        description: !isVideo && allowMultipleImages
          ? "As imagens ficaram salvas no post e podem ser publicadas como carrossel."
          : `${isVideo ? "Vídeo" : "Imagem"} salvo e pronto para publicar.`,
      });
    } catch (err) {
      toast({ title: "Erro no upload", description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  const uploadLabel = uploading && uploadProgress
    ? `Enviando ${uploadProgress.current}/${uploadProgress.total}…`
    : isVideo
      ? "Meu vídeo"
      : allowMultipleImages
        ? "Adicionar imagens"
        : "Minha imagem";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={!isVideo && allowMultipleImages}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void handleFiles(files);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || (!isVideo && allowMultipleImages && currentImageCount >= maxFeedImages)}
        title={isVideo ? "Usar meu vídeo" : allowMultipleImages ? "Adicionar uma ou várias imagens" : "Usar minha imagem"}
        className="h-7 px-2 text-xs gap-1"
      >
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {uploadLabel}
      </Button>
    </>
  );
}

function ImageActionPanel({
  contentId,
  variationIndex,
  tenantId,
  onGenerated,
  referenceImageUrl,
  hasImage,
}: {
  contentId: string;
  variationIndex: number;
  tenantId: string;
  onGenerated: (imageUrl: string) => void;
  referenceImageUrl?: string | null;
  hasImage?: boolean;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "form" | "pending">("idle");
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    try {
      const endpoint = hasImage
        ? `/api/tenants/${tenantId}/content/${contentId}/variations/${variationIndex}/regenerate-image`
        : `/api/tenants/${tenantId}/content/${contentId}/variations/${variationIndex}/generate-image`;

      let body: Record<string, unknown>;
      if (hasImage) {
        body = {
          observations: observations.trim() || undefined,
          imageCount: 1,
          referenceImageUrl: referenceImageUrl || undefined,
        };
      } else {
        body = referenceImageUrl ? { referenceImageUrl } : {};
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { imageUrl?: string; imageUrls?: string[]; error?: string };
      const url = data.imageUrl ?? data.imageUrls?.[0];
      if (!res.ok || !url) {
        toast({ title: "Erro ao gerar imagem", description: data.error ?? "Tente novamente.", variant: "destructive" });
        return;
      }
      setPendingUrl(url);
      setStep("pending");
      setObservations("");
    } catch {
      toast({ title: "Erro ao gerar imagem", description: "Verifique sua conexão e tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (step === "pending" && pendingUrl) {
    return (
      <div className="mt-3 rounded-lg border bg-muted/20 p-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Nova imagem gerada — aprovar?</p>
        <img
          src={pendingUrl}
          alt="Imagem gerada para aprovação"
          className="w-full rounded-lg object-cover max-h-72"
        />
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700 gap-1.5"
            onClick={() => { onGenerated(pendingUrl); setStep("idle"); setPendingUrl(null); toast({ title: "Imagem aprovada!" }); }}
          >
            <Check className="h-4 w-4" />
            Aprovar
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-1.5"
            onClick={() => { setStep("form"); setPendingUrl(null); }}
          >
            <RefreshCw className="h-4 w-4" />
            Refazer
          </Button>
          <Button
            variant="ghost"
            className="px-3"
            onClick={() => { setStep("idle"); setPendingUrl(null); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === "form") {
    return (
      <div className="mt-3 rounded-lg border bg-muted/20 p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {hasImage ? "Observações para regeneração (opcional)" : "Gerar imagem com IA"}
        </p>
        <Textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Ex: ângulo frontal, fundo branco, mais luminoso, produto em primeiro plano..."
          className="text-xs min-h-[64px] resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {loading ? "Gerando..." : "Gerar imagem"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setStep("idle"); setObservations(""); }}
            disabled={loading}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex justify-center">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setStep("form")}
        className="gap-1.5 text-xs"
      >
        <Wand2 className="h-3.5 w-3.5" />
        {hasImage ? "Regenerar imagem" : "Gerar imagem com IA"}
      </Button>
    </div>
  );
}

function VariationCard({
  index,
  type,
  variation,
  contentId,
  tenantId,
  theme,
  referenceImageUrl,
}: {
  index: number;
  type: ContentType;
  variation: ContentVariation;
  contentId?: string;
  tenantId?: string;
  theme?: string;
  referenceImageUrl?: string | null;
}) {
  const [localImageUrl, setLocalImageUrl] = useState<string | undefined>(undefined);
  const [localImageUrls, setLocalImageUrls] = useState<string[] | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | undefined>(undefined);
  const uploadTriggerRef = useRef<(() => void) | null>(null);
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const effectiveVariation =
    (type === "reels" || type === "tiktok")
      ? localVideoUrl ? { ...variation, videoUrl: localVideoUrl } : variation
      : (() => {
          const base = localImageUrl ? { ...variation, imageUrl: localImageUrl } : variation;
          if (localImageUrls !== null) {
            return { ...base, imageUrls: localImageUrls.length > 0 ? localImageUrls : undefined, imageUrl: localImageUrls[0] ?? undefined };
          }
          return base;
        })();

  const hasImage = !!(effectiveVariation as { imageUrl?: string }).imageUrl ||
    !!((effectiveVariation as { imageUrls?: string[] }).imageUrls?.length);

  async function handleRemoveImage(imgIdx: number) {
    const ev = effectiveVariation as FeedVariation | StoriesVariation;
    const currentUrls = ev.imageUrls ?? (ev.imageUrl ? [ev.imageUrl] : []);
    const newUrls = currentUrls.filter((_, i) => i !== imgIdx);
    setLocalImageUrls(newUrls);
    setLocalImageUrl(newUrls[0] ?? undefined);

    if (contentId && tenantId) {
      try {
        await fetch(
          `/api/tenants/${tenantId}/content/${contentId}/variations/${index}/image?imageIndex=${imgIdx}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` } }
        );
        qc.invalidateQueries({ queryKey: ["content", tenantId] });
      } catch {
        toast({ title: "Erro ao remover imagem", variant: "destructive" });
      }
    }
  }

  const { toast } = useToast();

  const [improvedVariation, setImprovedVariation] = useState<ContentVariation | null>(null);

  const improveMutation = useMutation<{ variation: ContentVariation }, Error, void>({
    mutationFn: async () => {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/tenants/${tenantId}/content/improve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, variation: displayVariation, theme }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error ?? "Falha ao melhorar");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setImprovedVariation(data.variation);
      toast({ title: "Texto melhorado!", description: "O conteúdo foi reescrito com mais impacto." });
    },
    onError: (err) => {
      toast({ title: "Erro ao melhorar", description: err.message, variant: "destructive" });
    },
  });

  const [savedToLibrary, setSavedToLibrary] = useState(false);

  const saveMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/tenants/${tenantId}/content/library`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, variation: displayVariation, theme }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error ?? "Falha ao salvar");
      }
      return res.json();
    },
    onSuccess: () => {
      setSavedToLibrary(true);
      toast({ title: "Salvo na Biblioteca!", description: "Disponível na seção Biblioteca de Conteúdo abaixo." });
    },
    onError: (err) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

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

  const baseVariation = improvedVariation ?? effectiveVariation;

  const displayVariation: ContentVariation = (() => {
    if (type === "feed") {
      const v = baseVariation as FeedVariation;
      return {
        ...v,
        caption: savedCaption ?? v.caption,
        hashtags: savedHashtags !== undefined
          ? savedHashtags.split(/\s+/).filter(Boolean)
          : v.hashtags,
      };
    }
    if (type === "stories") {
      const v = baseVariation as StoriesVariation;
      return { ...v, text: savedText ?? v.text, cta: savedCta ?? v.cta };
    }
    return baseVariation;
  })();

  const captionOverride: string | undefined = (() => {
    if (!hasEdits) return undefined;
    if (type === "feed") {
      const v = displayVariation as FeedVariation;
      return `${v.caption}\n\n${(v.hashtags ?? []).join(" ")}`;
    }
    return undefined;
  })();

  function sendToSponsoredAds() {
    if (!contentId) return;

    let headlines: string[] = [];
    let descriptions: string[] = [];
    let imagens: string[] = [];

    if (type === "feed") {
      const v = displayVariation as FeedVariation;
      headlines = [(theme || v.caption || "Conteúdo patrocinado").slice(0, 80)];
      descriptions = [`${v.caption}${(v.hashtags?.length ?? 0) ? `\n\n${(v.hashtags ?? []).join(" ")}` : ""}`];
      imagens = v.imageUrls?.length ? v.imageUrls : v.imageUrl ? [v.imageUrl] : [];
    } else if (type === "stories") {
      const v = displayVariation as StoriesVariation;
      headlines = [(theme || v.text || "Story patrocinado").slice(0, 80)];
      descriptions = [`${v.text}${v.cta ? `\n\nCTA: ${v.cta}` : ""}`];
      imagens = v.imageUrls?.length ? v.imageUrls : v.imageUrl ? [v.imageUrl] : [];
    } else {
      const v = displayVariation as ReelsVariation;
      headlines = [(v.title || theme || "Reel patrocinado").slice(0, 80)];
      descriptions = [
        [...(v.scenes ?? []).map((scene) => scene.fala).filter(Boolean), v.cta].filter(Boolean).join(" ").slice(0, 4000),
      ];
    }

    sessionStorage.setItem("vendorai_ads_content_draft_v1", JSON.stringify({
      contentGenerationId: contentId,
      variationIndex: index,
      theme: theme || "Conteúdo do Marketing",
      sourceType: type,
      suggestedPlatform: "meta",
      sourceVariationIndex: index,
      creativeDraft: { headlines, descriptions, imagens },
    }));
    setLocation("/ads?from=content");
  }

  function startEdit() {
    if (type === "feed") {
      const v = displayVariation as FeedVariation;
      setEditCaption(v.caption);
      setEditHashtags((v.hashtags ?? []).join(" "));
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

  const canEdit = type !== "reels" && type !== "tiktok";

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
                {contentId && tenantId && (type === "feed" || type === "stories" || type === "reels" || type === "tiktok") && (
                  <MediaUploadButton
                    contentId={contentId}
                    variationIndex={index}
                    tenantId={tenantId}
                    mediaType={(type === "reels" || type === "tiktok") ? "video" : "image"}
                    allowMultipleImages={type === "feed"}
                    currentImageCount={type === "feed"
                      ? ((effectiveVariation as FeedVariation).imageUrls?.length ?? ((effectiveVariation as FeedVariation).imageUrl ? 1 : 0))
                      : 0}
                    onUploaded={(type === "reels" || type === "tiktok")
                      ? (url) => setLocalVideoUrl(url)
                      : type === "feed"
                        ? (url, imageUrls) => {
                            const nextUrls = imageUrls?.length ? imageUrls : [url];
                            setLocalImageUrls(nextUrls);
                            setLocalImageUrl(nextUrls[0]);
                          }
                        : (url) => { setLocalImageUrl(url); setLocalImageUrls(null); }}
                    triggerRef={(type !== "reels" && type !== "tiktok") ? uploadTriggerRef : undefined}
                  />
                )}
                {type === "feed" || type === "stories" ? (
                  contentId && tenantId && (
                    <PublishInstagramButton
                      contentId={contentId}
                      variationIndex={index}
                      hasImage={hasImage}
                      tenantId={tenantId}
                      captionOverride={captionOverride}
                    />
                  )
                ) : null}
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
            onRemoveImage={contentId && tenantId ? handleRemoveImage : undefined}
            onUploadClick={contentId && tenantId ? () => uploadTriggerRef.current?.() : undefined}
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
            onRemoveImage={contentId && tenantId ? handleRemoveImage : undefined}
            onUploadClick={contentId && tenantId ? () => uploadTriggerRef.current?.() : undefined}
          />
        )}
        {type === "reels" && <ReelsCard v={effectiveVariation as ReelsVariation} />}
        {type === "tiktok" && <ReelsCard v={effectiveVariation as ReelsVariation} />}
        {type === "linkedin" && <LinkedInCard v={displayVariation as LinkedInVariation} />}
        {type === "youtube" && <YouTubeCard v={displayVariation as YouTubeVariation} />}
        {(type === "feed" || type === "stories") && contentId && tenantId && (
          <ImageActionPanel
            contentId={contentId}
            variationIndex={index}
            tenantId={tenantId}
            onGenerated={(url) => { setLocalImageUrl(url); setLocalImageUrls(null); }}
            referenceImageUrl={referenceImageUrl}
            hasImage={hasImage}
          />
        )}

        {tenantId && (
          <div className="flex items-center gap-2 pt-2 border-t mt-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1 h-7"
              onClick={() => improveMutation.mutate()}
              disabled={improveMutation.isPending || saveMutation.isPending}
              title="Reescreve o texto com mais impacto usando IA"
            >
              {improveMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Wand2 className="h-3 w-3" />}
              {improveMutation.isPending ? "Melhorando..." : "Melhorar texto"}
            </Button>
            <Button
              variant={savedToLibrary ? "secondary" : "outline"}
              size="sm"
              className="text-xs gap-1 h-7"
              onClick={() => { if (!savedToLibrary) saveMutation.mutate(); }}
              disabled={saveMutation.isPending || savedToLibrary}
              title="Salva na Biblioteca para reutilizar depois"
            >
              {saveMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : savedToLibrary
                  ? <CheckCircle2 className="h-3 w-3 text-green-600" />
                  : <Archive className="h-3 w-3" />}
              {saveMutation.isPending ? "Salvando..." : savedToLibrary ? "Salvo!" : "Salvar na Biblioteca"}
            </Button>
            {contentId && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1 h-7"
                onClick={sendToSponsoredAds}
                title="Se esta variação já foi publicada no Instagram, impulsiona a publicação existente; se ainda não foi, cria um anúncio Meta usando este conteúdo."
              >
                <Megaphone className="h-3 w-3" />
                Patrocinar este conteúdo
              </Button>
            )}
            {improvedVariation && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1 h-7 text-muted-foreground"
                onClick={() => { setImprovedVariation(null); setSavedToLibrary(false); }}
              >
                <RefreshCw className="h-3 w-3" />
                Restaurar original
              </Button>
            )}
          </div>
        )}
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
  const historyVariations = Array.isArray(item.result?.variations) ? item.result.variations : [];
  const date = new Date(item.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="py-3 border-b last:border-0">
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

      {expanded && (
        <div className="mt-3 space-y-3 px-1">
          <div className="flex items-start gap-1.5 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
            <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Para publicar: copie o texto e publique manualmente no Instagram.
              {item.type !== "reels" && item.type !== "tiktok" && " Imagens geradas pela IA ficam disponíveis por até 1h após a geração."}
            </span>
          </div>
          {historyVariations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Sem variações salvas.</p>
          ) : (
            historyVariations.map((v, i) => (
              <VariationCard key={i} index={i} type={item.type} variation={v} contentId={item.id} tenantId={item.tenantId} theme={item.theme} />
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

export default function Content() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tenantId = user?.tenantId ?? "";
  const vertical = user?.tenantVertical ?? null;
  const productSource = verticalToSource(vertical);

  const [activeTab, setActiveTab] = useState<ContentType>("feed");
  const [feedSubFormat, setFeedSubFormat] = useState<"feed_square" | "feed_portrait">("feed_square");
  const [theme, setTheme] = useState("");
  const [produtoInternoId, setProdutoInternoId] = useState<string>("none");
  const [produtosInternos, setProdutosInternos] = useState<{ id: string; categoria: string; nome: string; descricaoUso: string }[]>([]);

  useEffect(() => {
    fetch("/api/produtos-internos", { headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setProdutosInternos)
      .catch(() => setProdutosInternos([]));
  }, []);
  const [marketingContext, setMarketingContext] = useState<MarketingContextValue>({ nicheId: "", nicheName: "", productIds: [], productNames: [] });
  const [productId, setProductId] = useState<string>("none");
  const [variations, setVariations] = useState(1);
  const [imageCount, setImageCount] = useState(2);
  const [lastResult, setLastResult] = useState<ContentGeneration | null>(null);
  const [zipping, setZipping] = useState(false);

  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; url: string; purpose: "style_reference" | "post_material"; uploading?: boolean }>>([]);
  const [sessionId] = useState(() => crypto.randomUUID());
  const multiUploadRef = useRef<HTMLInputElement>(null);

  const contentFormat = activeTab === "stories" ? "stories" : (activeTab === "reels" || activeTab === "tiktok") ? "reels" : feedSubFormat;
  const aspectRatio = contentFormat === "feed_portrait" ? "4:5" : contentFormat === "feed_square" ? "1:1" : "9:16";

  const [simpleCommand, setSimpleCommand] = useState("");
  const [strategyResult, setStrategyResult] = useState<ContentStrategy | null>(null);
  const [strategyMode, setStrategyMode] = useState(false);

  const [customerPain, setCustomerPain] = useState("");
  const [postObjective, setPostObjective] = useState("");
  const [voiceTone, setVoiceTone] = useState("");
  const [desiredCta, setDesiredCta] = useState("");
  const [showCreativeControls, setShowCreativeControls] = useState(false);

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
    ? varejoProducts?.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome }))
    : isSupermercado
    ? supermercadoProducts?.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome }))
    : isInsumo
    ? insumosProducts?.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome }))
    : catalogProducts?.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome }));

  type ContentLibraryItem = { id: string; tenantId: string; type: ContentType; variation: ContentVariation; theme: string | null; title: string | null; savedAt: string; contentGenerationId?: string | null; variationIndex?: number | null };

  const { data: library, isLoading: libraryLoading } = useQuery<{ items: ContentLibraryItem[] }>({
    queryKey: ["content-library", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/content/library`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
  });

  const deleteLibraryMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/tenants/${tenantId}/content/library/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-library", tenantId] });
    },
  });

  const [libraryFilter, setLibraryFilter] = useState<ContentType | "all">("all");
  const [expandedLibraryItem, setExpandedLibraryItem] = useState<ContentLibraryItem | null>(null);

  // Proporção de miniatura por formato — cada rede tem uma "forma" real
  // (Feed é quase quadrado, Stories/Reels/TikTok são verticais 9:16), então
  // a grade respeita isso em vez de forçar tudo no mesmo quadrado.
  const LIBRARY_ASPECT: Record<ContentType, string> = {
    feed: "aspect-[4/5]",
    stories: "aspect-[9/16]",
    reels: "aspect-[9/16]",
    tiktok: "aspect-[9/16]",
    linkedin: "aspect-square",
    youtube: "aspect-video",
  };

  function getLibraryThumbnail(item: ContentLibraryItem): { url?: string; kind: "image" | "video" } {
    if (item.type === "reels" || item.type === "tiktok") {
      return { url: (item.variation as ReelsVariation).videoUrl, kind: "video" };
    }
    if (item.type === "feed" || item.type === "stories") {
      const v = item.variation as FeedVariation | StoriesVariation;
      return { url: v.imageUrl ?? v.imageUrls?.[0], kind: "image" };
    }
    return { url: undefined, kind: "image" };
  }

  const libraryItems = library?.items ?? [];
  const libraryCounts = libraryItems.reduce<Partial<Record<ContentType, number>>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, {});
  const filteredLibraryItems = libraryFilter === "all" ? libraryItems : libraryItems.filter((item) => item.type === libraryFilter);

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

  const generateMutation = useMutation<ContentGeneration, Error, { type: ContentType; theme: string; productId?: string; productSource?: ProductSource; variations: number; imageCount: number; imageUrls?: string[]; postMaterialUrls?: string[]; contentFormat?: string; aspectRatio?: string; customerPain?: string; postObjective?: string; voiceTone?: string; desiredCta?: string }>({
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

  const strategyMutation = useMutation<ContentStrategy, Error, { command: string; contentType: string; variations: number }>({
    mutationFn: async (body) => {
      const res = await fetch(`/api/tenants/${tenantId}/content/strategy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error ?? "Falha na geração de estratégia");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setStrategyResult(data);
      toast({ title: "Estratégia gerada com sucesso!" });
    },
    onError: (err) => {
      toast({ title: "Erro na estratégia", description: err.message, variant: "destructive" });
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

  async function handleMultiUpload(files: FileList) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    const validFiles = Array.from(files).filter((f) => {
      if (!allowed.includes(f.type)) {
        toast({ title: `${f.name}: formato inválido`, description: "Use JPG, PNG ou WebP.", variant: "destructive" });
        return false;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast({ title: `${f.name}: muito grande`, description: "Máximo 10 MB por imagem.", variant: "destructive" });
        return false;
      }
      return true;
    });
    if (!validFiles.length) return;

    const placeholders = validFiles.map((f) => ({
      id: crypto.randomUUID(),
      url: URL.createObjectURL(f),
      purpose: "style_reference" as const,
      uploading: true,
    }));
    setUploadedImages((prev) => [...prev, ...placeholders]);

    await Promise.all(
      validFiles.map(async (file, i) => {
        const placeholderId = placeholders[i]!.id;
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

          const finalUrl = `/api/storage${objectPath}`;
          const token = localStorage.getItem("vendorai_token");
          await fetch(`/api/tenants/${tenantId}/content/uploads`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ sessionId, fileUrl: finalUrl, purpose: "style_reference" }),
          });
          setUploadedImages((prev) =>
            prev.map((img) => img.id === placeholderId ? { ...img, url: finalUrl, uploading: false } : img)
          );
        } catch (err) {
          toast({ title: `Erro no upload de ${file.name}`, description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
          setUploadedImages((prev) => prev.filter((img) => img.id !== placeholderId));
        }
      })
    );
  }

  async function handleTogglePurpose(id: string, newPurpose: "style_reference" | "post_material") {
    setUploadedImages((prev) => prev.map((img) => img.id === id ? { ...img, purpose: newPurpose } : img));
    const token = localStorage.getItem("vendorai_token");
    await fetch(`/api/tenants/${tenantId}/content/uploads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ purpose: newPurpose }),
    }).catch(() => {});
  }

  async function handleRemoveUpload(id: string) {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
    const token = localStorage.getItem("vendorai_token");
    await fetch(`/api/tenants/${tenantId}/content/uploads/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  function handleGenerate() {
    if (!marketingContext.nicheId || marketingContext.productIds.length === 0) {
      toast({ title: "Defina o público e ao menos uma oferta", variant: "destructive" });
      return;
    }

    const resolvedTheme = theme.trim()
      || marketingContext.campaignGoal?.trim()
      || `Divulgar ${marketingContext.productNames.join(", ")} para ${marketingContext.audienceNiche || marketingContext.audienceSegment || "o público selecionado"}`;

    setLastResult(null);
    const styleRefs = uploadedImages.filter((img) => img.purpose === "style_reference" && !img.uploading).map((img) => img.url);
    const materialImgs = uploadedImages.filter((img) => img.purpose === "post_material" && !img.uploading).map((img) => img.url);
    generateMutation.mutate({
      type: activeTab,
      theme: `${resolvedTheme} | Nicho: ${marketingContext.nicheName} | Produtos: ${marketingContext.productNames.join(", ")}`,
      productId: productId !== "none" ? productId : undefined,
      productSource,
      variations,
      imageCount: (activeTab === "reels" || activeTab === "tiktok") ? 1 : imageCount,
      imageUrls: styleRefs.length > 0 ? styleRefs : undefined,
      postMaterialUrls: materialImgs.length > 0 ? materialImgs : undefined,
      contentFormat,
      aspectRatio,
      customerPain: customerPain.trim() || undefined,
      postObjective: postObjective || undefined,
      voiceTone: voiceTone || undefined,
      desiredCta: desiredCta || undefined,
    });
  }

  const monthlyUsed = history?.monthlyUsed ?? 0;
  const monthlyLimit = history?.monthlyLimit ?? 20;
  const usagePct = Math.min((monthlyUsed / monthlyLimit) * 100, 100);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Criar conteúdo</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Um único gerador para Feed, Stories, Reels, LinkedIn, YouTube e TikTok — usando o mesmo público, oferta e objetivo.
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

      <MarketingContextSelector
        tenantId={tenantId}
        value={marketingContext}
        compact
        productsOverride={products}
        onChange={(next) => {
          setMarketingContext(next);
          const selectedCatalogId = next.productIds.find((id) => !id.startsWith("custom:"));
          setProductId(selectedCatalogId ?? "none");
        }}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-muted/20 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Como você quer orientar a IA?</p>
          <p className="text-[11px] text-muted-foreground">É o mesmo gerador. Muda apenas quanto controle você quer exercer sobre a peça.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={!strategyMode ? "default" : "outline"}
            size="sm"
            onClick={() => { setStrategyMode(false); setStrategyResult(null); }}
          >
            Configurar detalhes
          </Button>
          <Button
            variant={strategyMode ? "default" : "outline"}
            size="sm"
            onClick={() => { setStrategyMode(true); setLastResult(null); }}
          >
            Comando simples
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as ContentType); setLastResult(null); setStrategyResult(null); }}>
        <TabsList className="grid grid-cols-6 w-full max-w-2xl">
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
            {(key === "youtube" || key === "linkedin" || key === "tiktok") && (
              <div className="mb-4">
                <SocialIntegrationsPanel providers={[key]} mode="publish" />
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {strategyMode ? "Comando simples" : "Detalhes da peça"}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {strategyMode
                        ? "Descreva o que você quer e a IA cria a estratégia completa"
                        : TYPE_CONFIG[key].description}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {strategyMode ? (
                      <>
                        <div className="space-y-1.5">
                          <Label>O que você quer publicar? <span className="text-destructive">*</span></Label>
                          <Textarea
                            placeholder={`Ex: "Quero promover meu novo produto de skincare para mulheres de 25-35 anos, com tom elegante e sofisticado"`}
                            value={simpleCommand}
                            onChange={(e) => setSimpleCommand(e.target.value)}
                            rows={5}
                            className="resize-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Nº de variações</Label>
                          <div className="flex gap-2">
                            {[2, 3, 4, 5].map((n) => (
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
                        <Button
                          className="w-full"
                          onClick={() => {
                            if (!simpleCommand.trim()) {
                              toast({ title: "Descreva o que você quer publicar", variant: "destructive" });
                              return;
                            }
                            strategyMutation.mutate({
                              command: [
                                marketingContext.nicheName && `Contexto estratégico: ${marketingContext.nicheName}`,
                                marketingContext.productNames.length > 0 && `Ofertas: ${marketingContext.productNames.join(", ")}`,
                                `Pedido do usuário: ${simpleCommand.trim()}`,
                              ].filter(Boolean).join("\n"),
                              contentType: key,
                              variations,
                            });
                          }}
                          disabled={strategyMutation.isPending || monthlyUsed >= monthlyLimit}
                        >
                          {strategyMutation.isPending ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando estratégia...</>
                          ) : (
                            <><Wand2 className="h-4 w-4 mr-2" />Criar estratégia com IA</>
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <Label>Direção criativa <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                          <Textarea
                            placeholder={
                              (vertical && VERTICAL_PLACEHOLDERS[vertical]?.[key as ContentType]) ??
                              `Opcional — descreva uma ideia específica, ou deixe em branco para a IA definir a abordagem com base na estratégia acima. Ex.: ${TYPE_CONFIG[key].placeholder.replace("Ex: ", "")}`
                            }
                            value={theme}
                            onChange={(e) => setTheme(e.target.value)}
                            rows={4}
                            className="resize-none text-sm"
                          />
                        </div>

                        <div className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setShowCreativeControls((open) => !open)}
                            className="w-full flex items-center justify-between gap-3 p-3 text-left"
                          >
                            <div>
                              <p className="text-xs font-semibold">Ajustes avançados</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">Opcional — se ficar fechado, a IA define dor, objetivo da peça, tom e CTA a partir da estratégia acima.</p>
                            </div>
                            {showCreativeControls ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </button>

                          {showCreativeControls && (
                            <div className="border-t p-3 space-y-3 bg-background/60">
                              {produtosInternos.length > 0 && (
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Produto interno VendorAI <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                  <Select
                                    value={produtoInternoId}
                                    onValueChange={(id) => {
                                      setProdutoInternoId(id);
                                      const p = produtosInternos.find((x) => x.id === id);
                                      if (p) setTheme(`${p.nome}: ${p.descricaoUso}`);
                                    }}
                                  >
                                    <SelectTrigger className="text-sm h-9">
                                      <SelectValue placeholder="Usar uma funcionalidade do VendorAI como tema" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Nenhum</SelectItem>
                                      {produtosInternos.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>{p.categoria} — {p.nome}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              <div className="space-y-1.5">
                                <Label className="text-xs">Dor do cliente <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                <Textarea
                                  placeholder="Se quiser forçar uma dor específica, descreva aqui."
                                  value={customerPain}
                                  onChange={(e) => setCustomerPain(e.target.value)}
                                  rows={2}
                                  className="resize-none text-sm"
                                />
                              </div>

                              <div className="grid sm:grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Objetivo da peça <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                  <Select value={postObjective} onValueChange={setPostObjective}>
                                    <SelectTrigger className="text-sm h-9"><SelectValue placeholder="IA decide" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="atrair_dor">Atrair atenção pra dor</SelectItem>
                                      <SelectItem value="prova_social">Prova social</SelectItem>
                                      <SelectItem value="educar">Educar</SelectItem>
                                      <SelectItem value="vender_direto">Vender direto</SelectItem>
                                      <SelectItem value="bastidores">Bastidores</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1.5">
                                  <Label className="text-xs">Tom de voz <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                  <Select value={voiceTone} onValueChange={setVoiceTone}>
                                    <SelectTrigger className="text-sm h-9"><SelectValue placeholder="IA decide" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="direto_comercial">Direto e comercial</SelectItem>
                                      <SelectItem value="storytelling">Storytelling</SelectItem>
                                      <SelectItem value="educativo">Educativo</SelectItem>
                                      <SelectItem value="bastidores_casual">Bastidores casual</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1.5">
                                  <Label className="text-xs">CTA <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                  <Select value={desiredCta} onValueChange={setDesiredCta}>
                                    <SelectTrigger className="text-sm h-9"><SelectValue placeholder="IA decide" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="comentar_palavra">Comentar palavra-chave</SelectItem>
                                      <SelectItem value="chamar_direct">Chamar no direct</SelectItem>
                                      <SelectItem value="clicar_link">Clicar no link</SelectItem>
                                      <SelectItem value="sem_cta">Nenhum (sem CTA)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {key === "feed" && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label>Formato</Label>
                              <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                                {feedSubFormat === "feed_square" ? "1:1 · 1080×1080" : "4:5 · 1080×1350"}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setFeedSubFormat("feed_square")}
                                className={cn(
                                  "flex flex-col items-center gap-1 border rounded-lg py-2 px-3 transition-colors text-xs",
                                  feedSubFormat === "feed_square"
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-border hover:border-primary/40 text-muted-foreground"
                                )}
                              >
                                <div className="w-8 h-8 border-2 rounded border-current" />
                                Feed 1:1
                              </button>
                              <button
                                type="button"
                                onClick={() => setFeedSubFormat("feed_portrait")}
                                className={cn(
                                  "flex flex-col items-center gap-1 border rounded-lg py-2 px-3 transition-colors text-xs",
                                  feedSubFormat === "feed_portrait"
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-border hover:border-primary/40 text-muted-foreground"
                                )}
                              >
                                <div className="w-6 h-8 border-2 rounded border-current" />
                                Feed 4:5
                              </button>
                            </div>
                          </div>
                        )}
                        {(key === "stories" || key === "reels" || key === "tiktok") && (
                          <div className="flex items-center gap-2 rounded-lg bg-muted/50 border px-3 py-2">
                            <div className="w-5 h-8 border-2 border-primary rounded flex-shrink-0" />
                            <div>
                              <p className="text-xs font-medium">Formato 9:16 — Vertical</p>
                              <p className="text-[10px] text-muted-foreground">1080×1920 px — exigido pelo Instagram</p>
                            </div>
                          </div>
                        )}

                        {(() => {
                          const hasMaterial = uploadedImages.some((img) => img.purpose === "post_material" && !img.uploading);
                          return (
                            <div className="space-y-1.5">
                              <Label className={cn((key === "reels" || key === "tiktok" || hasMaterial) && "text-muted-foreground")}>
                                Quantidade de imagens
                                {(key === "reels" || key === "tiktok") && <span className="ml-1 text-[10px] font-normal">({key === "tiktok" ? "TikTok" : "Reels"} gera 1 thumbnail)</span>}
                                {key === "stories" && !hasMaterial && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(carrossel sequencial)</span>}
                                {hasMaterial && <span className="ml-1 text-[10px] font-normal text-emerald-600">(usando fotos do cliente)</span>}
                              </Label>
                              {hasMaterial ? (
                                <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
                                  <ImageIcon className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                                    {uploadedImages.filter((img) => img.purpose === "post_material" && !img.uploading).length} foto{uploadedImages.filter((img) => img.purpose === "post_material" && !img.uploading).length !== 1 ? "s" : ""} do cliente serão usadas como slides do post
                                  </p>
                                </div>
                              ) : (
                                <div className="flex gap-2 flex-wrap">
                                  {[1, 2, 4, 6, 8, 10].map((n) => (
                                    <Button
                                      key={n}
                                      variant={imageCount === n ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => setImageCount(n)}
                                      className="w-12"
                                      disabled={key === "reels" || key === "tiktok"}
                                    >
                                      {n}
                                    </Button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Imagens do cliente (opcional)</Label>
                            {uploadedImages.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">{uploadedImages.length} imagem{uploadedImages.length !== 1 ? "s" : ""}</span>
                            )}
                          </div>

                          <input
                            ref={multiUploadRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files?.length) handleMultiUpload(e.target.files);
                              e.target.value = "";
                            }}
                          />

                          {uploadedImages.length > 0 && (
                            <div className="grid grid-cols-3 gap-1.5">
                              {uploadedImages.map((img) => (
                                <div key={img.id} className="relative group rounded-md overflow-hidden border bg-muted/30">
                                  <div className="aspect-square">
                                    {img.uploading ? (
                                      <div className="w-full h-full flex items-center justify-center min-h-[70px]">
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                      </div>
                                    ) : (
                                      <img src={img.url} alt="Upload" className="w-full h-full object-cover min-h-[70px]" loading="lazy" />
                                    )}
                                  </div>
                                  {!img.uploading && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveUpload(img.id)}
                                        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                      <button
                                        type="button"
                                        title={img.purpose === "style_reference" ? "Referência de estilo — clique para usar como material" : "Material para postar — clique para usar como referência"}
                                        onClick={() => handleTogglePurpose(img.id, img.purpose === "style_reference" ? "post_material" : "style_reference")}
                                        className={cn(
                                          "absolute bottom-0 left-0 right-0 text-[9px] text-center py-0.5 font-medium transition-colors truncate px-1",
                                          img.purpose === "style_reference"
                                            ? "bg-blue-600/80 text-white"
                                            : "bg-emerald-600/80 text-white"
                                        )}
                                      >
                                        {img.purpose === "style_reference" ? "Referência" : "Material"}
                                      </button>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => multiUploadRef.current?.click()}
                            disabled={uploadedImages.some((img) => img.uploading)}
                            className="w-full border-2 border-dashed border-border rounded-lg py-3 flex flex-col items-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50 text-xs"
                          >
                            <Upload className="h-4 w-4" />
                            <span>Importar imagens</span>
                            <span className="text-[10px]">JPG, PNG ou WebP · até 10 MB · múltiplas</span>
                          </button>

                          {uploadedImages.some((img) => !img.uploading) && (
                            <p className="text-[10px] text-muted-foreground leading-snug">
                              <span className="text-blue-600 font-medium">Referência</span>: a IA usa como inspiração de estilo.{" "}
                              <span className="text-emerald-600 font-medium">Material</span>: imagem vai direto para postagem. Toque no badge para alternar.
                            </p>
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
                      </>
                    )}

                    {monthlyUsed >= monthlyLimit && (
                      <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Limite mensal atingido. Upgrade de plano para continuar.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-3 space-y-4">
                {strategyMode ? (
                  <>
                    {strategyMutation.isPending && (
                      <Card>
                        <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground">
                            Criando estratégia de conteúdo com IA...
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {!strategyMutation.isPending && strategyResult && (
                      <div className="space-y-3">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold">Estratégia</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">{strategyResult.strategy}</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold">Estilo Visual</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">{strategyResult.visualStyle}</p>
                          </CardContent>
                        </Card>
                        {(strategyResult.approaches ?? []).map((approach, i) => (
                          <Card key={i}>
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-semibold">Variação {i + 1} — {approach}</CardTitle>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1"
                                  onClick={() => {
                                    setTheme(strategyResult.prompts[i] ?? "");
                                    setStrategyMode(false);
                                    setStrategyResult(null);
                                  }}
                                >
                                  <Sparkles className="h-3 w-3" />
                                  Usar esta
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                              <div><span className="font-medium text-xs text-muted-foreground uppercase">Headline</span><p>{strategyResult.headlines[i]}</p></div>
                              <div><span className="font-medium text-xs text-muted-foreground uppercase">CTA</span><p>{strategyResult.ctas[i]}</p></div>
                              <div><span className="font-medium text-xs text-muted-foreground uppercase">Legenda</span><p className="text-muted-foreground">{strategyResult.captions[i]}</p></div>
                              <div><span className="font-medium text-xs text-muted-foreground uppercase">Hashtags</span><p className="text-primary">{strategyResult.hashtags[i]}</p></div>
                              <div><span className="font-medium text-xs text-muted-foreground uppercase">Prompt de imagem</span><p className="text-xs text-muted-foreground bg-muted rounded p-2">{strategyResult.prompts[i]}</p></div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}

                    {!strategyMutation.isPending && !strategyResult && (
                      <Card className="border-dashed">
                        <CardContent className="py-12 flex flex-col items-center gap-3 text-center text-muted-foreground">
                          <Wand2 className="h-10 w-10 opacity-30" />
                          <p className="text-sm">Descreva o que você quer publicar e clique em <strong>Criar estratégia com IA</strong></p>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <>
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
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="text-sm font-medium text-muted-foreground">
                            {lastResult.result?.variations?.length ?? 0} variações geradas
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1"
                              onClick={handleGenerate}
                              disabled={generateMutation.isPending}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Regerar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1"
                              onClick={() => downloadAllImagesZip(lastResult.result?.variations ?? [], lastResult.type, setZipping, toast)}
                              disabled={zipping}
                            >
                              {zipping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                              {zipping ? "Criando ZIP..." : "Baixar todas (ZIP)"}
                            </Button>
                          </div>
                        </div>
                        {(lastResult.result?.variations ?? []).map((v, i) => (
                          <VariationCard key={i} index={i} type={lastResult.type} variation={v} contentId={lastResult.id} tenantId={tenantId} theme={lastResult.theme} referenceImageUrl={uploadedImages.find((img) => img.purpose === "style_reference" && !img.uploading)?.url ?? null} />
                        ))}
                      </div>
                    )}

                    {!generateMutation.isPending && !lastResult && (
                      <Card className="border-dashed">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Resumo da peça
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid sm:grid-cols-2 gap-2 text-xs">
                            <div className="rounded-md bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Oferta</p>
                              <p className="font-medium mt-0.5">{marketingContext.productNames.join(", ") || "Defina acima"}</p>
                            </div>
                            <div className="rounded-md bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Público</p>
                              <p className="font-medium mt-0.5">{[marketingContext.audienceSegment, marketingContext.audienceNiche].filter(Boolean).join(" · ") || "Defina acima"}</p>
                            </div>
                            <div className="rounded-md bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Objetivo</p>
                              <p className="font-medium mt-0.5">{marketingContext.campaignGoal || "A IA usará a melhor abordagem para o contexto"}</p>
                            </div>
                            <div className="rounded-md bg-muted/40 p-2.5">
                              <p className="text-muted-foreground">Canal e formato</p>
                              <p className="font-medium mt-0.5">{TYPE_CONFIG[key].label} · {aspectRatio}</p>
                            </div>
                          </div>
                          <div className="rounded-md border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
                            A IA define automaticamente tema, dor, tom e CTA quando você não especificar esses itens em <strong>Ajustes avançados</strong>.
                          </div>
                          <p className="text-xs text-center text-muted-foreground">Revise a estratégia acima e toque em <strong>Gerar com IA</strong>.</p>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {((library?.items?.length ?? 0) > 0 || libraryLoading) && (
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Archive className="h-4 w-4 text-muted-foreground" />
            Biblioteca de Conteúdo
            {(library?.items?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="text-xs">{library!.items.length}</Badge>
            )}
          </h2>

          {!libraryLoading && libraryItems.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <Button
                variant={libraryFilter === "all" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setLibraryFilter("all")}
              >
                Todos
                <Badge variant="outline" className="ml-1.5 text-xs">{libraryItems.length}</Badge>
              </Button>
              {(Object.keys(TYPE_CONFIG) as ContentType[])
                .filter((type) => libraryCounts[type])
                .map((type) => {
                  const Icon = TYPE_CONFIG[type].icon;
                  return (
                    <Button
                      key={type}
                      variant={libraryFilter === type ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 px-2.5 text-xs gap-1.5"
                      onClick={() => setLibraryFilter(type)}
                    >
                      <Icon className="h-3 w-3" />
                      {TYPE_CONFIG[type].label}
                      <Badge variant="outline" className="ml-0.5 text-xs">{libraryCounts[type]}</Badge>
                    </Button>
                  );
                })}
            </div>
          )}

          <Card>
            <CardContent className="p-3">
              {libraryLoading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLibraryItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nada nesse formato ainda.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {filteredLibraryItems.map((item) => {
                    const Icon = TYPE_CONFIG[item.type]?.icon ?? Image;
                    const thumb = getLibraryThumbnail(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setExpandedLibraryItem(item)}
                        className={cn(
                          "group relative w-full overflow-hidden rounded-lg border bg-muted/40 text-left hover:ring-2 hover:ring-primary/40 transition",
                          LIBRARY_ASPECT[item.type],
                        )}
                      >
                        {thumb.url ? (
                          thumb.kind === "video" ? (
                            <video src={thumb.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                          ) : (
                            <img src={thumb.url} alt={item.theme ?? TYPE_CONFIG[item.type]?.label ?? item.type} className="h-full w-full object-cover" />
                          )
                        ) : (
                          <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-3 text-center">
                            <Icon className="h-6 w-6 text-muted-foreground" />
                            <p className="text-[11px] text-muted-foreground line-clamp-3">{item.theme || TYPE_CONFIG[item.type]?.label}</p>
                          </div>
                        )}

                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                          <span className="flex items-center gap-1 text-[10px] font-medium text-white">
                            <Icon className="h-3 w-3" />
                            {new Date(item.savedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteLibraryMutation.mutate(item.id);
                            }}
                            className="rounded p-0.5 text-white/80 hover:text-white hover:bg-black/30"
                          >
                            <Trash2 className="h-3 w-3" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={!!expandedLibraryItem} onOpenChange={(open) => !open && setExpandedLibraryItem(null)}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              {expandedLibraryItem && (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-xs">
                        {TYPE_CONFIG[expandedLibraryItem.type]?.label ?? expandedLibraryItem.type}
                      </Badge>
                      {expandedLibraryItem.theme && (
                        <span className="text-muted-foreground font-normal truncate">{expandedLibraryItem.theme}</span>
                      )}
                    </DialogTitle>
                  </DialogHeader>
                  <VariationCard
                    index={expandedLibraryItem.variationIndex ?? 0}
                    type={expandedLibraryItem.type}
                    variation={expandedLibraryItem.variation}
                    contentId={expandedLibraryItem.contentGenerationId ?? undefined}
                    tenantId={tenantId}
                    theme={expandedLibraryItem.theme ?? undefined}
                  />
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}

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
                {history?.items?.map((item) => (
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
