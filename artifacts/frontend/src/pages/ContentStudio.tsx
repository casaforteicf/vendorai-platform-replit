import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Copy, CheckCheck, Sparkles, TrendingUp, Anchor, Clapperboard,
  RefreshCw, Upload, X, Video, Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "workflow",  label: "Fluxo",       icon: RefreshCw,    ph: "Ex: vendas B2B, nutrição, moda..." },
  { id: "trends",   label: "Tendências",   icon: TrendingUp,   ph: "Ex: fitness, finanças pessoais..." },
  { id: "hooks",    label: "Ganchos",      icon: Anchor,       ph: "Ex: marketing digital, emagrecimento..." },
  { id: "script",   label: "Script",       icon: Clapperboard, ph: "Ex: Como dobrar suas vendas em 30 dias" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ContentStudio() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();

  const [tab, setTab]         = useState<TabId>("script");
  const [input, setInput]     = useState("");
  const [result, setResult]   = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]   = useState(false);

  const [photo, setPhoto]     = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef               = useRef<HTMLInputElement>(null);

  const [showVideo, setShowVideo]   = useState(false);
  const [vScript, setVScript]       = useState("");
  const [vStatus, setVStatus]       = useState<"idle" | "generating" | "done" | "error">("idle");
  const [vUrl, setVUrl]             = useState("");
  const [vError, setVError]         = useState("");

  const currentTab = TABS.find((t) => t.id === tab)!;

  const generate = async () => {
    if (!input.trim() || !tenantId) return;
    setLoading(true);
    setResult("");
    try {
      const res = await fetch(`/api/tenants/${tenantId}/content-studio/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify({ tab, input: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na geração");
      const text = data.result ?? "Sem resposta";
      setResult(text);
      setVScript(text.substring(0, 800));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao conectar.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const removePhoto = () => {
    setPhoto(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Content Studio</h1>
          <p className="text-sm text-muted-foreground">
            Gere conteúdo para Instagram com IA em segundos
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
            <TabsList className="grid grid-cols-4 w-full">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <t.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{t.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {TABS.map((t) => (
              <TabsContent key={t.id} value={t.id} className="mt-4">
                <div className="space-y-2">
                  <Label htmlFor="studio-input">
                    {t.id === "workflow"  && "Qual é o nicho ou tema do conteúdo?"}
                    {t.id === "trends"   && "Em qual nicho você quer identificar tendências?"}
                    {t.id === "hooks"    && "Sobre qual nicho ou produto você quer criar ganchos?"}
                    {t.id === "script"   && "Qual é o tema do seu Reel?"}
                  </Label>
                  <Textarea
                    id="studio-input"
                    placeholder={t.ph}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Pressione <kbd className="px-1 py-0.5 text-xs bg-muted rounded border">Ctrl+Enter</kbd> para gerar
                  </p>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <div className="flex items-center gap-3">
            <Button
              onClick={generate}
              disabled={loading || !input.trim()}
              className="gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Gerando..." : "Gerar com IA"}
            </Button>
            <Badge variant="outline" className="text-xs">
              {currentTab.label}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Resultado</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyResult}
                  className="gap-1.5 text-xs"
                >
                  {copied
                    ? <><CheckCheck className="h-3.5 w-3.5 text-green-500" /> Copiado!</>
                    : <><Copy className="h-3.5 w-3.5" /> Copiar</>
                  }
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generate}
                  disabled={loading}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  Regerar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
              {result}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Imagem de referência (opcional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {preview ? (
            <div className="relative w-fit">
              <img
                src={preview}
                alt="Preview"
                className="h-40 w-40 object-cover rounded-lg border"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                onClick={removePhoto}
              >
                <X className="h-3 w-3" />
              </Button>
              <p className="mt-2 text-xs text-muted-foreground truncate max-w-[160px]">
                {photo?.name}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg hover:bg-muted/50 transition-colors gap-2 text-muted-foreground"
            >
              <Upload className="h-5 w-5" />
              <span className="text-sm">Clique para enviar uma imagem</span>
              <span className="text-xs">PNG, JPG ou WEBP</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhoto}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-4 w-4" />
              Vídeo com IA
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowVideo((v) => !v)}
            >
              {showVideo ? "Ocultar" : "Expandir"}
            </Button>
          </div>
        </CardHeader>
        {showVideo && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Script para o vídeo</Label>
              <Textarea
                value={vScript}
                onChange={(e) => setVScript(e.target.value)}
                placeholder="O script gerado aparecerá aqui automaticamente, ou escreva o seu..."
                rows={4}
                className="resize-none"
              />
            </div>

            {vStatus === "idle" && (
              <p className="text-sm text-muted-foreground">
                Geração de vídeo disponível em breve. Gere um script acima para começar.
              </p>
            )}
            {vStatus === "generating" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando vídeo...
              </div>
            )}
            {vStatus === "done" && vUrl && (
              <div className="space-y-2">
                <video src={vUrl} controls className="w-full rounded-lg" />
                <Button variant="outline" size="sm" asChild>
                  <a href={vUrl} download>Baixar vídeo</a>
                </Button>
              </div>
            )}
            {vStatus === "error" && (
              <p className="text-sm text-destructive">{vError}</p>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
