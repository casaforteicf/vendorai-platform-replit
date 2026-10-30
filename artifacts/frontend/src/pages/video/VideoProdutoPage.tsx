import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "@/components/media/MediaAssetPicker";
import { ProductVideoFinalizePanel } from "@/components/video/ProductVideoFinalizePanel";
import {
  ArrowLeft,
  CheckCheck,
  Copy,
  Film,
  ImagePlus,
  Library,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

type ProductImage = {
  file?: File;
  preview: string;
  assetId?: string;
  name: string;
};

type LibraryImageAsset = {
  id: string;
  type: string;
  storageUrl: string;
  originalFilename?: string | null;
  mimeType?: string | null;
};

type ProductVideoJob = {
  id: string;
  operation: string;
  status: string;
  progress?: number | null;
  total?: number | null;
  error?: string | null;
  output?: {
    videoUrl?: string;
    videoAssetId?: string;
    sourceAssetIds?: string[];
    logoApplied?: boolean;
    introApplied?: boolean;
    outroApplied?: boolean;
    logoWarning?: string | null;
  } | null;
};

function StoryboardResult({ text, format }: { text: string; format: string }) {
  const [copied, setCopied] = useState(false);
  const copyAll = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const sections = text
    .split(/\n(?=(?:TELA \d|GANCHO|PROBLEMA|SOLUÇÃO|PROVA|CTA|INTERESSE|OFERTA))/i)
    .map((section) => section.trim())
    .filter(Boolean);
  const colors = [
    "from-purple-500/20 border-purple-500/30",
    "from-cyan-500/20 border-cyan-500/30",
    "from-pink-500/20 border-pink-500/30",
    "from-amber-500/20 border-amber-500/30",
    "from-emerald-500/20 border-emerald-500/30",
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-semibold">
          STORYBOARD — {format === "story" ? "STORIES" : "REEL"}
        </span>
        <button onClick={copyAll} className="flex items-center gap-1 text-xs text-gray-400 hover:text-cyan-400 transition-colors">
          {copied ? <><CheckCheck className="h-3 w-3 text-green-400" /> Copiado</> : <><Copy className="h-3 w-3" /> Copiar tudo</>}
        </button>
      </div>
      {sections.length > 1 ? (
        <div className="space-y-2">
          {sections.map((section, index) => {
            const lines = section.split("\n").filter(Boolean);
            const title = lines[0] ?? "";
            const body = lines.slice(1).join("\n");
            return (
              <div key={index} className={cn("rounded-xl bg-gradient-to-br p-3.5 border", colors[index % colors.length], "to-transparent")}>
                <p className="text-xs font-bold text-white/90 mb-1.5">{title}</p>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed font-sans">{body}</pre>
              </div>
            );
          })}
        </div>
      ) : (
        <pre className="text-sm text-[#d4cff0] whitespace-pre-wrap leading-relaxed font-sans rounded-xl bg-white/5 border border-white/10 p-4">
          {text}
        </pre>
      )}
    </div>
  );
}

export default function VideoProdutoPage() {
  const [, navigate] = useLocation();
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const requestedAssetIds = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get("mediaAssetIds") ?? "";
    return [...new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 8);
  }, []);

  const [images, setImages] = useState<ProductImage[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [prodName, setProdName] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [prodPrice, setProdPrice] = useState("");
  const [prodBenefits, setProdBenefits] = useState("");
  const [prodCta, setProdCta] = useState("Compre agora");
  const [prodFormat, setProdFormat] = useState<"story" | "reel">("reel");
  const [prodLoading, setProdLoading] = useState(false);
  const [prodResult, setProdResult] = useState("");
  const [projectId, setProjectId] = useState("");
  const [jobId, setJobId] = useState("");
  const [generationId, setGenerationId] = useState("");
  const [job, setJob] = useState<ProductVideoJob | null>(null);
  const [polling, setPolling] = useState(false);

  const videoUrl = job?.output?.videoUrl ?? "";
  const progressPercent = useMemo(() => {
    const progress = Number(job?.progress ?? 0);
    const total = Number(job?.total ?? 0);
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((progress / total) * 100)));
  }, [job?.progress, job?.total]);

  useEffect(() => {
    if (!tenantId || !requestedAssetIds.length) return;
    let cancelled = false;
    void (async () => {
      setLibraryLoading(true);
      setLibraryError("");
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=500`, { headers: authHeader() });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Falha ao consultar a Biblioteca");
        const assets = (Array.isArray(data.assets) ? data.assets : []) as LibraryImageAsset[];
        const byId = new Map(assets.map((asset) => [asset.id, asset]));
        const resolved = requestedAssetIds.map((id) => byId.get(id)).filter((asset): asset is LibraryImageAsset => Boolean(asset));
        if (resolved.length !== requestedAssetIds.length) throw new Error("Uma ou mais fotos não estão disponíveis na Biblioteca deste tenant");
        if (cancelled) return;
        setImages(resolved.map((asset) => ({
          assetId: asset.id,
          preview: mediaAssetUrl(asset.storageUrl),
          name: asset.originalFilename || "Foto da Biblioteca",
        })));
      } catch (error) {
        if (!cancelled) setLibraryError(error instanceof Error ? error.message : "Falha ao carregar fotos da Biblioteca");
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId, requestedAssetIds]);

  const addImages = (files: File[]) => {
    const supported = files.filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type));
    if (supported.length !== files.length) {
      toast({ title: "Alguns arquivos foram ignorados", description: "Use somente JPG, PNG ou WebP.", variant: "destructive" });
    }
    const tooLarge = supported.find((file) => file.size > 20 * 1024 * 1024);
    if (tooLarge) {
      toast({ title: "Imagem muito grande", description: `${tooLarge.name} ultrapassa 20 MB.`, variant: "destructive" });
      return;
    }
    const available = Math.max(0, 8 - images.length);
    const accepted = supported.slice(0, available);
    if (supported.length > available) {
      toast({ title: "Limite de 8 fotos", description: "As fotos excedentes não foram adicionadas." });
    }
    setImages((current) => [
      ...current,
      ...accepted.map((file) => ({ file, preview: URL.createObjectURL(file), name: file.name })),
    ]);
    resetGeneration();
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const addLibraryImages = (assets: MediaPickerAsset[]) => {
    setImages((current) => {
      const currentAssetIds = new Set(current.flatMap((item) => item.assetId ? [item.assetId] : []));
      const available = Math.max(0, 8 - current.length);
      const additions = assets
        .filter((asset) => asset.type === "image" && !currentAssetIds.has(asset.id))
        .slice(0, available)
        .map((asset) => ({
          assetId: asset.id,
          preview: mediaAssetUrl(asset.storageUrl),
          name: asset.originalFilename || "Foto da Biblioteca",
        }));
      if (assets.length > additions.length && available > 0) {
        window.setTimeout(() => toast({ title: "Algumas fotos já estavam selecionadas", description: "Mantivemos apenas imagens novas, até o limite de 8." }), 0);
      }
      return [...current, ...additions];
    });
    resetGeneration();
  };

  const removeImage = (index: number) => {
    setImages((current) => {
      const item = current[index];
      if (item?.file) URL.revokeObjectURL(item.preview);
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const resetGeneration = () => {
    setProdResult("");
    setProjectId("");
    setJobId("");
    setGenerationId("");
    setJob(null);
  };

  const generate = async () => {
    if (!prodName.trim() || !tenantId || images.length === 0) return;
    setProdLoading(true);
    resetGeneration();
    try {
      const form = new FormData();
      images.forEach((item) => { if (item.file) form.append("images", item.file); });
      const libraryAssetIds = images.flatMap((item) => item.assetId ? [item.assetId] : []);
      if (libraryAssetIds.length) form.append("imageAssetIds", JSON.stringify(libraryAssetIds));
      form.append("name", prodName.trim());
      form.append("description", prodDesc.trim());
      form.append("price", prodPrice.trim());
      form.append("benefits", prodBenefits.trim());
      form.append("cta", prodCta.trim() || "Compre agora");
      form.append("format", prodFormat);
      form.append("renderVideo", "true");

      const response = await fetch(`/api/tenants/${tenantId}/content-studio/product-video`, {
        method: "POST",
        headers: authHeader(),
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Erro ao gerar vídeo de produto");

      setProdResult(data.result ?? "");
      setProjectId(data.projectId ?? "");
      setJobId(data.jobId ?? "");
      setGenerationId(data.generationId ?? "");
      toast({
        title: "Render iniciado",
        description: "Storyboard criado. O MP4 está sendo renderizado e será salvo na Biblioteca Audiovisual.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível gerar o vídeo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setProdLoading(false);
    }
  };

  const loadStatus = async () => {
    if (!tenantId || !projectId || !jobId) return;
    setPolling(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}`, { headers: authHeader() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Falha ao consultar render");
      const productJob = (data.jobs ?? []).find((item: ProductVideoJob) => item.id === jobId && item.operation === "product_video") ?? null;
      if (productJob) setJob(productJob);
    } catch (error) {
      console.error("product-video: falha ao atualizar status", error);
    } finally {
      setPolling(false);
    }
  };

  useEffect(() => {
    if (!projectId || !jobId) return;
    void loadStatus();
    if (job?.status === "done" || job?.status === "error") return;
    const timer = window.setInterval(() => { void loadStatus(); }, 3_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, jobId, job?.status]);

  useEffect(() => () => {
    images.forEach((item) => { if (item.file) URL.revokeObjectURL(item.preview); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGenerate = Boolean(prodName.trim() && images.length > 0 && !prodLoading && !libraryLoading && job?.status !== "running");

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8]">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <button onClick={() => navigate("/content-studio/video")} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20"><ShoppingBag className="h-5 w-5 text-amber-300" /></div>
          <div>
            <h1 className="text-xl font-extrabold text-white">Vídeo de Produto</h1>
            <p className="text-sm text-gray-400">Fotos reais → storyboard → movimento de câmera → MP4 vertical → Biblioteca.</p>
          </div>
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-bold text-white">1. Fotos do produto</h2>
              <p className="text-xs text-gray-500 mt-1">Use de 1 a 8 fotos da Biblioteca ou envie JPG, PNG ou WebP. O vídeo usa obrigatoriamente essas imagens.</p>
            </div>
            <span className="text-[11px] rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-amber-200">{images.length}/8 fotos</span>
          </div>

          {libraryLoading && <div className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-200"><Loader2 className="h-4 w-4 animate-spin" /> Carregando fotos da Biblioteca…</div>}
          {libraryError && <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{libraryError}</div>}

          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => addImages(Array.from(event.target.files ?? []))}
          />

          {images.length === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setPickerOpen(true)} className="flex h-32 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cyan-500/20 hover:border-cyan-400/50 hover:bg-cyan-500/5 transition-all gap-2 text-cyan-200">
                <Library className="h-5 w-5" />
                <span className="text-sm font-medium">Escolher da Biblioteca</span>
                <span className="text-xs text-gray-500">Reutiliza a mídia oficial sem duplicar</span>
              </button>
              <button type="button" onClick={() => imageInputRef.current?.click()} className="flex h-32 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/10 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all gap-2 text-gray-500">
                <Upload className="h-5 w-5" />
                <span className="text-sm font-medium">Enviar novas fotos</span>
                <span className="text-xs text-gray-600">Cada foto pode ter até 20 MB</span>
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {images.map((item, index) => (
                  <div key={`${item.assetId ?? item.name}-${index}`} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/20">
                    <img src={item.preview} alt={`Produto ${index + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] text-white">Cena {index + 1}</span>
                    {item.assetId && <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-md bg-cyan-950/90 px-1.5 py-0.5 text-[10px] text-cyan-100"><Library className="h-2.5 w-2.5" /> Biblioteca</span>}
                    <button onClick={() => removeImage(index)} className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              {images.length < 8 && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setPickerOpen(true)} className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/10">
                    <Library className="h-4 w-4" /> Biblioteca
                  </button>
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/10">
                    <ImagePlus className="h-4 w-4" /> Enviar foto
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
          <div>
            <h2 className="font-bold text-white">2. Informações do produto</h2>
            <p className="text-xs text-gray-500 mt-1">A IA cria o roteiro; as imagens reais acima são usadas no vídeo.</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Nome do produto *</label>
              <input value={prodName} onChange={(event) => setProdName(event.target.value)} placeholder="Ex: Creme Hidratante Corporal Premium" className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 focus:outline-none focus:border-amber-500/50" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Descrição breve</label>
              <textarea value={prodDesc} onChange={(event) => setProdDesc(event.target.value)} rows={2} placeholder="Ex: Hidratação profunda com manteiga de karité e vitamina E" className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 resize-none focus:outline-none focus:border-amber-500/50" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">Preço</label>
                <input value={prodPrice} onChange={(event) => setProdPrice(event.target.value)} placeholder="Ex: R$ 49,90" className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">CTA final</label>
                <input value={prodCta} onChange={(event) => setProdCta(event.target.value)} placeholder="Ex: Compre agora" className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 focus:outline-none focus:border-amber-500/50" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Benefícios principais</label>
              <textarea value={prodBenefits} onChange={(event) => setProdBenefits(event.target.value)} rows={2} placeholder="Ex: Absorção rápida, sem oleosidade, dura 24h, vegano" className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 resize-none focus:outline-none focus:border-amber-500/50" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1.5">Formato</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "reel", label: "🎬 Reels", sub: "15–30 segundos" },
                { id: "story", label: "📱 Stories", sub: "5 cenas de 3 segundos" },
              ] as { id: "reel" | "story"; label: string; sub: string }[]).map(({ id, label, sub }) => (
                <button key={id} onClick={() => setProdFormat(id)} className={cn("p-3 rounded-xl border text-left transition-colors", prodFormat === id ? "border-amber-500/60 bg-amber-500/15" : "border-white/[0.08] hover:border-white/20")}>
                  <p className={cn("text-sm font-semibold", prodFormat === id ? "text-amber-300" : "text-gray-300")}>{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => void generate()} disabled={!canGenerate} className={cn("w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all", !canGenerate ? "bg-amber-900/40 text-amber-400/50 cursor-not-allowed" : "bg-gradient-to-r from-blue-400 to-blue-600 text-white hover:opacity-90")}>
            {prodLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {prodLoading ? "Criando storyboard e iniciando render..." : `Gerar vídeo de ${prodFormat === "reel" ? "Reel" : "Stories"}`}
          </button>
          {images.length === 0 && <p className="text-[11px] text-amber-300/80 text-center">Adicione ao menos uma foto para habilitar o vídeo.</p>}
        </section>

        {(prodResult || projectId) && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-white">3. Resultado</h2>
                <p className="text-xs text-gray-500 mt-1">O storyboard aparece primeiro; o MP4 continua sendo processado no Media Engine.</p>
              </div>
              {projectId && (
                <button disabled={polling} onClick={() => void loadStatus()} className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40" title="Atualizar status">
                  <RefreshCw className={cn("h-4 w-4", polling && "animate-spin")} />
                </button>
              )}
            </div>

            {projectId && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                    {job?.status === "done" ? <Film className="h-4 w-4 text-emerald-300" /> : <Loader2 className={cn("h-4 w-4 text-amber-300", job?.status !== "error" && "animate-spin")} />}
                    {job?.status === "done" ? "Vídeo pronto" : job?.status === "error" ? "Falha no render" : "Renderizando MP4"}
                  </div>
                  <span className="text-[11px] text-gray-500">{progressPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-black/30 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-blue-500 transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
                {job?.status === "error" && <p className="text-xs text-red-300">{job.error || "Não foi possível concluir o vídeo."}</p>}
                {job?.output?.logoWarning && <p className="text-[11px] text-amber-300">{job.output.logoWarning}</p>}
              </div>
            )}

            {videoUrl && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                <video controls src={videoUrl} className="w-full max-h-[620px] rounded-xl bg-black" />
                <div className="flex flex-wrap gap-2 text-[10px] text-emerald-200">
                  <span className="rounded-full border border-emerald-500/20 px-2 py-1">MP4 salvo na Biblioteca</span>
                  {job?.output?.logoApplied && <span className="rounded-full border border-emerald-500/20 px-2 py-1">Logo aplicada</span>}
                  {job?.output?.introApplied && <span className="rounded-full border border-emerald-500/20 px-2 py-1">Abertura aplicada</span>}
                  {job?.output?.outroApplied && <span className="rounded-full border border-emerald-500/20 px-2 py-1">Encerramento aplicado</span>}
                </div>
              </div>
            )}

            {videoUrl && generationId && (
              <ProductVideoFinalizePanel
                tenantId={tenantId}
                sourceVideoUrl={videoUrl}
                generationId={generationId}
                format={prodFormat}
              />
            )}

            {prodResult && <StoryboardResult text={prodResult} format={prodFormat} />}

            <button onClick={resetGeneration} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">← Editar e gerar outra versão</button>
          </section>
        )}
      </div>

      <MediaAssetPicker
        tenantId={tenantId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={["image"]}
        maxSelection={Math.max(1, 8 - images.length)}
        title="Escolher fotos da Biblioteca"
        confirmLabel="Usar fotos no vídeo"
        onConfirm={addLibraryImages}
      />
    </div>
  );
}
