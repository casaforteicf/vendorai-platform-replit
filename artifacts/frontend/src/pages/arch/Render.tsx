import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";

function getBase() {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

const STYLES = [
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
  const { token } = useAuth();
  const { toast } = useToast();

  const [previewSrc, setPreviewSrc]     = useState<string | null>(null);
  const [file, setFile]                 = useState<File | null>(null);
  const [dragging, setDragging]         = useState(false);
  const [style, setStyle]               = useState("moderno");
  const [roomType, setRoomType]         = useState("sala de estar");
  const [notes, setNotes]               = useState("");
  const [rendering, setRendering]       = useState(false);
  const [resultUrl, setResultUrl]       = useState<string | null>(null);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

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

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
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
      form.append("roomType", roomType);
      form.append("notes", notes);

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

  const handleReset = () => {
    setFile(null);
    setPreviewSrc(null);
    setResultUrl(null);
    setNotes("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna esquerda — Upload + Config */}
        <div className="space-y-4">
          {/* Upload */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Imagem de referência</CardTitle>
            </CardHeader>
            <CardContent>
              {previewSrc ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img src={previewSrc} alt="Preview" className="w-full object-cover max-h-64 rounded-lg" />
                  <button
                    onClick={handleReset}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                    {file?.name}
                  </div>
                </div>
              ) : (
                <div
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                    dragging
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-950/20"
                      : "border-muted-foreground/30 hover:border-violet-400 hover:bg-muted/30"
                  }`}
                >
                  <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium">Arraste uma imagem aqui</p>
                  <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground mt-3">JPG, PNG, WEBP — máx. 20MB</p>
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

          {/* Estilo */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Estilo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {STYLES.map((s) => (
                  <Button
                    key={s.value}
                    type="button"
                    size="sm"
                    variant="outline"
                    className={`text-xs ${style === s.value ? "bg-violet-600 text-white border-violet-600 hover:bg-violet-700 hover:text-white" : ""}`}
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Ambiente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {ROOM_TYPES.map((r) => (
                  <Button
                    key={r.value}
                    type="button"
                    size="sm"
                    variant="outline"
                    className={`text-xs ${roomType === r.value ? "bg-violet-600 text-white border-violet-600 hover:bg-violet-700 hover:text-white" : ""}`}
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Instruções adicionais <span className="text-muted-foreground font-normal">(opcional)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Ex: adicionar sofá cinza, iluminação quente, piso de madeira..."
                className="text-xs min-h-[80px] resize-none"
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
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Renderizando com IA...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Renderizar
              </>
            )}
          </Button>

          {rendering && (
            <p className="text-xs text-center text-muted-foreground animate-pulse">
              A renderização pode levar até 60 segundos...
            </p>
          )}
        </div>

        {/* Coluna direita — Resultado */}
        <div>
          <Card className="h-full min-h-[400px]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  Resultado
                </CardTitle>
                {resultUrl && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={handleReset}>
                      <RefreshCw className="h-3 w-3" /> Nova imagem
                    </Button>
                    <Button size="sm" className="text-xs gap-1 h-7 bg-violet-600 hover:bg-violet-700" onClick={handleDownload}>
                      <Download className="h-3 w-3" /> Baixar
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-center h-full min-h-[350px]">
              {resultUrl ? (
                <div className="w-full space-y-3">
                  <img
                    src={`${getBase()}${resultUrl}`}
                    alt="Renderização gerada"
                    className="w-full rounded-lg shadow-lg object-cover"
                  />
                  <p className="text-xs text-center text-muted-foreground">
                    Estilo: <span className="font-medium">{style}</span> · Ambiente: <span className="font-medium">{roomType}</span>
                  </p>
                </div>
              ) : rendering ? (
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-4 border-violet-200 dark:border-violet-800" />
                    <div className="h-16 w-16 rounded-full border-4 border-t-violet-600 border-transparent absolute top-0 left-0 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Gerando renderização...</p>
                    <p className="text-xs mt-1">A IA está transformando sua imagem</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Aguardando renderização</p>
                    <p className="text-xs mt-1">
                      Faça upload de uma imagem e configure<br />o estilo, depois clique em Renderizar
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
