import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload,
  ImageIcon,
  Loader2,
  Wand2,
  Download,
  RefreshCw,
  X,
  Clapperboard,
  Sparkles,
  Pencil,
  BookmarkPlus,
  Search,
  Check,
  User,
} from "lucide-react";

function getBase() {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

const LIGHTING_TIMES = [
  { value: "auto",     label: "Automático",  desc: "Manter original",    icon: "🔆" },
  { value: "manha",    label: "Manhã",       desc: "07h – 09h",          icon: "🌅" },
  { value: "tarde",    label: "Tarde",       desc: "13h – 16h",          icon: "☀️" },
  { value: "golden",   label: "Golden Hour", desc: "17h – 18h",          icon: "🌇" },
  { value: "pordosol", label: "Pôr do Sol",  desc: "18h – 19h",          icon: "🌆" },
  { value: "noturno",  label: "Noturno",     desc: "20h+ (luminárias on)", icon: "🌙" },
  { value: "nublado",  label: "Nublado",     desc: "Luz difusa",         icon: "☁️" },
];

const ANGLES = [
  { value: "frontal",    label: "Frontal",         desc: "Vista direta" },
  { value: "angular45",  label: "Angular 45°",     desc: "Perspectiva diagonal" },
  { value: "lateral",    label: "Lateral",         desc: "Vista do lado" },
  { value: "ampla",      label: "Vista Ampla",     desc: "Grande angular" },
  { value: "closeup",    label: "Close-up",        desc: "Detalhe próximo" },
  { value: "aerea",      label: "Vista Aérea",     desc: "De cima para baixo" },
];

const STYLES = [
  { value: "nenhum",       label: "Só melhorar qualidade" },
  { value: "moderno",      label: "Moderno" },
  { value: "rústico",      label: "Rústico" },
  { value: "clássico",     label: "Clássico" },
  { value: "minimalista",  label: "Minimalista" },
  { value: "industrial",   label: "Industrial" },
  { value: "escandinavo",  label: "Escandinavo" },
];

const ROOM_TYPES = [
  { value: "sala de estar",   label: "Sala de Estar" },
  { value: "quarto",          label: "Quarto" },
  { value: "cozinha",         label: "Cozinha" },
  { value: "banheiro",        label: "Banheiro" },
  { value: "escritório",      label: "Escritório" },
  { value: "varanda",         label: "Varanda" },
  { value: "área gourmet",    label: "Área Gourmet" },
  { value: "sala de jantar",  label: "Sala de Jantar" },
  { value: "fachada externa", label: "Fachada Externa" },
];

export default function ArchRender() {
  const { token, user } = useAuth();
  const tenantId = user?.tenantId;
  const { toast } = useToast();

  const [previewSrc, setPreviewSrc]         = useState<string | null>(null);
  const [file, setFile]                     = useState<File | null>(null);
  const [dragging, setDragging]             = useState(false);
  const [style, setStyle]                   = useState("nenhum");
  const [lighting, setLighting]             = useState("auto");
  const [angle, setAngle]                   = useState("frontal");
  const [roomType, setRoomType]             = useState("sala de estar");
  const [notes, setNotes]                   = useState("");
  const [rendering, setRendering]           = useState(false);
  const [resultUrl, setResultUrl]           = useState<string | null>(null);
  const [refineOpen, setRefineOpen]         = useState(false);
  const [refineNote, setRefineNote]         = useState("");
  const [refining, setRefining]             = useState(false);
  // Material / Textura
  const [materialFile, setMaterialFile]     = useState<File | null>(null);
  const [materialPreview, setMaterialPreview] = useState<string | null>(null);
  const [materialDragging, setMaterialDragging] = useState(false);
  const [materialSurface, setMaterialSurface] = useState("todos");
  const materialInputRef                    = useRef<HTMLInputElement>(null);
  // Salvar no Lead
  const [saveOpen, setSaveOpen]             = useState(false);
  const [leadSearch, setLeadSearch]         = useState("");
  const [leads, setLeads]                   = useState<{ id: string; nome: string; empresa?: string }[]>([]);
  const [loadingLeads, setLoadingLeads]     = useState(false);
  const [selectedLead, setSelectedLead]     = useState<{ id: string; nome: string } | null>(null);
  const [savingLead, setSavingLead]         = useState(false);
  const fileInputRef                        = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast({ title: "Formato inválido", description: "Envie uma imagem (JPG, PNG, WEBP).", variant: "destructive" });
      return;
    }
    setFile(f);
    setResultUrl(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreviewSrc(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleMaterialFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast({ title: "Formato inválido", description: "Envie uma imagem de textura.", variant: "destructive" });
      return;
    }
    setMaterialFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setMaterialPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const onMaterialDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setMaterialDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleMaterialFile(f);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleRender = async () => {
    if (!file) {
      toast({ title: "Selecione uma imagem primeiro", variant: "destructive" });
      return;
    }
    setRendering(true);
    setResultUrl(null);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("style", style);
      form.append("lighting", lighting);
      form.append("angle", angle);
      form.append("roomType", roomType);
      form.append("notes", notes);
      if (materialFile) {
        form.append("materialImage", materialFile);
        form.append("materialSurface", materialSurface);
      }

      const res = await fetch(`${getBase()}/api/render/quick`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: "Erro na renderização", description: data.error ?? "Tente novamente.", variant: "destructive" });
        return;
      }
      setResultUrl(data.imageUrl);
      toast({ title: "Renderização concluída!", description: "Sua imagem foi gerada com sucesso." });
    } catch {
      toast({ title: "Erro de conexão", description: "Verifique sua rede e tente novamente.", variant: "destructive" });
    } finally {
      setRendering(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = `${getBase()}${resultUrl}`;
    a.download = `render-${Date.now()}.png`;
    a.click();
  };

  // Busca leads ao abrir o diálogo
  useEffect(() => {
    if (!saveOpen || !tenantId) return;
    setLoadingLeads(true);
    setSelectedLead(null);
    setLeadSearch("");
    fetch(`${getBase()}/api/tenants/${tenantId}/leads?limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setLeads(Array.isArray(d) ? d : (d.data ?? [])))
      .catch(() => setLeads([]))
      .finally(() => setLoadingLeads(false));
  }, [saveOpen, tenantId, token]);

  const handleSaveToLead = async () => {
    if (!selectedLead || !resultUrl || !tenantId) return;
    setSavingLead(true);
    try {
      const res = await fetch(`${getBase()}/api/activities`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          leadId:         selectedLead.id,
          tipo:           "tarefa",
          titulo:         `Renderização: ${style} — ${roomType}`,
          descricao:      notes || undefined,
          status:         "concluida",
          anexoUrl:       resultUrl,
          anexoNome:      `render-${Date.now()}.png`,
          anexoMimeType:  "image/png",
          anexoCategoria: "imagem",
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      toast({ title: "Imagem salva!", description: `Adicionada ao card de ${selectedLead.nome}.` });
      setSaveOpen(false);
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSavingLead(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreviewSrc(null);
    setResultUrl(null);
    setNotes("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRefine = async () => {
    if (!resultUrl || !refineNote.trim()) return;
    setRefining(true);
    try {
      // Fetch the generated image and use it as the new input
      const imgRes = await fetch(`${getBase()}${resultUrl}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!imgRes.ok) throw new Error("Não foi possível carregar a imagem gerada");
      const blob = await imgRes.blob();
      const imgFile = new File([blob], "render-atual.png", { type: "image/png" });

      const form = new FormData();
      form.append("image", imgFile);
      form.append("style", style);
      form.append("lighting", lighting);
      form.append("angle", angle);
      form.append("roomType", roomType);
      form.append("notes", refineNote.trim());
      if (materialFile) {
        form.append("materialImage", materialFile);
        form.append("materialSurface", materialSurface);
      }

      const res = await fetch(`${getBase()}/api/render/quick`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Erro ao ajustar imagem");

      setResultUrl(data.imageUrl);
      setRefineOpen(false);
      setRefineNote("");
      toast({ title: "Imagem ajustada!", description: "O ajuste foi aplicado com sucesso." });
    } catch (err: any) {
      toast({ title: "Erro ao ajustar", description: err.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setRefining(false);
    }
  };

  return (
    <div className="w-full p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
          <Clapperboard className="h-6 w-6 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Renderização de Imagens</h1>
          <p className="text-sm text-muted-foreground">
            Faça upload de uma foto e transforme com IA em uma renderização profissional
          </p>
        </div>
      </div>

      {/* Layout principal — painel estreito esquerdo + resultado largo */}
      <div className="flex flex-col xl:flex-row gap-4 items-start">

        {/* Painel de configuração — largura fixa */}
        <div className="w-full xl:w-72 shrink-0 space-y-3">

          {/* Upload */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Imagem de referência</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {previewSrc ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img src={previewSrc} alt="Preview" className="w-full object-cover max-h-48 rounded-lg" />
                  <button
                    onClick={handleReset}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded truncate max-w-[80%]">
                    {file?.name}
                  </div>
                </div>
              ) : (
                <div
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    dragging
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-950/20"
                      : "border-muted-foreground/30 hover:border-violet-400 hover:bg-muted/30"
                  }`}
                >
                  <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-xs font-medium">Arraste ou clique para selecionar</p>
                  <p className="text-[10px] text-muted-foreground mt-1">JPG, PNG, WEBP — máx. 20MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </CardContent>
          </Card>

          {/* Material / Textura */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Material / Textura
                  <span className="ml-1 normal-case font-normal">(opcional)</span>
                </CardTitle>
                {materialFile && (
                  <button
                    type="button"
                    onClick={() => { setMaterialFile(null); setMaterialPreview(null); }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-2">
              {materialPreview ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img
                    src={materialPreview}
                    alt="Material"
                    className="w-full h-24 object-cover rounded-lg"
                  />
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent">
                    <p className="text-[10px] text-white/90 truncate">{materialFile?.name}</p>
                  </div>
                </div>
              ) : (
                <div
                  onDrop={onMaterialDrop}
                  onDragOver={(e) => { e.preventDefault(); setMaterialDragging(true); }}
                  onDragLeave={() => setMaterialDragging(false)}
                  onClick={() => materialInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    materialDragging
                      ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20"
                      : "border-muted-foreground/30 hover:border-orange-300 hover:bg-muted/30"
                  }`}
                >
                  <Upload className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                  <p className="text-xs font-medium">Foto do material</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Pedra, madeira, cerâmica, tecido…</p>
                </div>
              )}
              <input
                ref={materialInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMaterialFile(f); }}
              />
              {/* Superfície alvo */}
              {materialFile && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Aplicar em:</p>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { value: "todos",   label: "Todas" },
                      { value: "paredes", label: "Paredes" },
                      { value: "piso",    label: "Piso" },
                      { value: "teto",    label: "Teto" },
                      { value: "fachada", label: "Fachada" },
                      { value: "moveis",  label: "Móveis" },
                    ].map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setMaterialSurface(s.value)}
                        className={`rounded border px-2 py-1 text-[10px] font-medium transition-all cursor-pointer ${
                          materialSurface === s.value
                            ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300"
                            : "border-border hover:border-orange-300 hover:bg-muted/40"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Iluminação — Horário */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Horário da Iluminação</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-1.5">
                {LIGHTING_TIMES.map((lt) => (
                  <button
                    key={lt.value}
                    type="button"
                    onClick={() => setLighting(lt.value)}
                    className={`rounded-lg border px-2 py-2 text-left transition-all cursor-pointer ${
                      lighting === lt.value
                        ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
                        : "border-border hover:border-amber-300 hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-medium leading-tight">{lt.icon} {lt.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{lt.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Ângulo */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ângulo</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-1.5">
                {ANGLES.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => setAngle(a.value)}
                    className={`rounded-lg border px-2 py-2 text-left transition-all cursor-pointer ${
                      angle === a.value
                        ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300"
                        : "border-border hover:border-violet-300 hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-medium leading-tight">{a.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{a.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Estilo */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estilo <span className="normal-case font-normal">(opcional)</span></CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="flex flex-wrap gap-1.5">
                {STYLES.map((s) => (
                  <Button
                    key={s.value}
                    type="button"
                    size="sm"
                    variant="outline"
                    className={`text-xs h-7 ${style === s.value ? "bg-violet-600 text-white border-violet-600 hover:bg-violet-700 hover:text-white" : ""}`}
                    onClick={() => setStyle(s.value)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Ambiente */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ambiente</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="flex flex-wrap gap-1.5">
                {ROOM_TYPES.map((r) => (
                  <Button
                    key={r.value}
                    type="button"
                    size="sm"
                    variant="outline"
                    className={`text-xs h-7 ${roomType === r.value ? "bg-violet-600 text-white border-violet-600 hover:bg-violet-700 hover:text-white" : ""}`}
                    onClick={() => setRoomType(r.value)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Instruções */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instruções <span className="normal-case font-normal">(opcional)</span></CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <Textarea
                placeholder="Ex: iluminação quente, piso de madeira..."
                className="text-xs min-h-[64px] resize-none"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Botão Renderizar */}
          <Button
            onClick={handleRender}
            disabled={rendering || !file}
            className="w-full gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white h-11"
          >
            {rendering ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Renderizando com IA...</>
            ) : (
              <><Wand2 className="h-4 w-4" />Renderizar</>
            )}
          </Button>

          {rendering && (
            <p className="text-xs text-center text-muted-foreground animate-pulse">
              Pode levar até 60 segundos...
            </p>
          )}
        </div>

        {/* Área de resultado — ocupa o restante da tela */}
        <div className="flex-1 min-w-0">
          <Card className="w-full">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  Resultado
                </CardTitle>
                {resultUrl && (
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={handleReset}>
                      <RefreshCw className="h-3 w-3" /> Nova
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs gap-1 h-7 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/40" onClick={() => { setRefineNote(""); setRefineOpen(true); }}>
                      <Pencil className="h-3 w-3" /> Ajustar
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs gap-1 h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40" onClick={() => setSaveOpen(true)}>
                      <BookmarkPlus className="h-3 w-3" /> Salvar no Lead
                    </Button>
                    <Button size="sm" className="text-xs gap-1 h-7 bg-violet-600 hover:bg-violet-700" onClick={handleDownload}>
                      <Download className="h-3 w-3" /> Baixar
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {resultUrl ? (
                <div className="space-y-3">
                  <img
                    src={`${getBase()}${resultUrl}`}
                    alt="Renderização gerada"
                    className="w-full rounded-xl shadow-xl object-contain max-h-[75vh]"
                  />
                  <p className="text-xs text-center text-muted-foreground">
                    {style === "nenhum" ? "Melhoria de qualidade" : <span>Estilo: <span className="font-medium">{style}</span></span>}
                    {" · "}Ângulo: <span className="font-medium">{ANGLES.find(a => a.value === angle)?.label ?? angle}</span>
                    {" · "}Ambiente: <span className="font-medium">{roomType}</span>
                  </p>
                </div>
              ) : rendering ? (
                <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground min-h-[60vh]">
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full border-4 border-violet-200 dark:border-violet-800" />
                    <div className="h-20 w-20 rounded-full border-4 border-t-violet-600 border-transparent absolute top-0 left-0 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Gerando renderização...</p>
                    <p className="text-xs mt-1">A IA está transformando sua imagem</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground min-h-[60vh]">
                  <ImageIcon className="h-24 w-24 text-muted-foreground/20" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Aguardando renderização</p>
                    <p className="text-xs mt-1">
                      Faça upload de uma imagem, configure as opções<br />e clique em Renderizar
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Diálogo — Salvar no Lead */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="h-4 w-4 text-emerald-500" />
              Salvar imagem no card do lead
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Buscar lead pelo nome ou empresa..."
                className="pl-8 text-sm h-9"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
              />
            </div>

            {/* Lista de leads */}
            <div className="border rounded-lg max-h-52 overflow-y-auto divide-y text-sm">
              {loadingLeads ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando leads...
                </div>
              ) : leads.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-xs">Nenhum lead encontrado</div>
              ) : (
                leads
                  .filter((l) => {
                    const q = leadSearch.toLowerCase();
                    return !q || l.nome.toLowerCase().includes(q) || (l.empresa ?? "").toLowerCase().includes(q);
                  })
                  .slice(0, 50)
                  .map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setSelectedLead(l)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        selectedLead?.id === l.id
                          ? "bg-emerald-50 dark:bg-emerald-950/30"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{l.nome}</p>
                        {l.empresa && <p className="text-xs text-muted-foreground truncate">{l.empresa}</p>}
                      </div>
                      {selectedLead?.id === l.id && (
                        <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                      )}
                    </button>
                  ))
              )}
            </div>

            {selectedLead && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
                <User className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  Salvar em: <span className="font-semibold">{selectedLead.nome}</span>
                </span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              A imagem será adicionada à seção de anexos do lead com categoria <Badge variant="secondary" className="text-[10px] px-1 py-0">Imagem</Badge>.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={savingLead}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveToLead}
              disabled={savingLead || !selectedLead}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {savingLead ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</>
              ) : (
                <><BookmarkPlus className="h-3.5 w-3.5" /> Salvar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de ajuste da imagem gerada */}
      <Dialog open={refineOpen} onOpenChange={setRefineOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-violet-500" />
              Ajustar imagem gerada
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Descreva o que deseja alterar na imagem atual. A IA usará a renderização gerada como base e aplicará apenas os ajustes solicitados.
            </p>
            <Textarea
              autoFocus
              placeholder="Ex: trocar a cor da parede para branco, adicionar cortinas bege, iluminação mais quente..."
              className="min-h-[100px] resize-none text-sm"
              value={refineNote}
              onChange={(e) => setRefineNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleRefine();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Dica: seja específico. Ex: "parede azul petróleo" em vez de "mudar a cor".
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRefineOpen(false)} disabled={refining}>
              Cancelar
            </Button>
            <Button
              onClick={handleRefine}
              disabled={refining || !refineNote.trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              {refining ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Ajustando…</>
              ) : (
                <><Wand2 className="h-3.5 w-3.5" /> Aplicar ajuste</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
