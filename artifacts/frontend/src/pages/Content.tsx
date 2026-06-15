import { useState } from "react";
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
import { useListProdutosCatalogo, getListProdutosCatalogoQueryKey } from "@workspace/api-client-react";
import {
  Sparkles, Copy, Trash2, Loader2, Instagram, Clapperboard, Image,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ContentType = "feed" | "stories" | "reels";

interface FeedVariation { caption: string; hashtags: string[]; imageUrl?: string }
interface StoriesVariation { text: string; cta: string; imageUrl?: string }
interface ReelsScene { visual: string; fala: string; duracao: string }
interface ReelsVariation { title: string; scenes: ReelsScene[]; audioSuggestion: string; cta: string }
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

function FeedCard({ v }: { v: FeedVariation }) {
  const fullText = `${v.caption}\n\n${v.hashtags.join(" ")}`;
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
        <p className="text-sm leading-relaxed whitespace-pre-wrap flex-1">{v.caption}</p>
        <CopyButton text={fullText} />
      </div>
      <div className="flex flex-wrap gap-1">
        {v.hashtags.map((h) => (
          <span key={h} className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">{h}</span>
        ))}
      </div>
    </div>
  );
}

function StoriesCard({ v }: { v: StoriesVariation }) {
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
          <p className="text-sm font-medium leading-relaxed">{v.text}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CTA:</span>
            <span className="text-xs bg-muted px-2 py-1 rounded font-medium">{v.cta}</span>
          </div>
        </div>
        <CopyButton text={`${v.text}\n\n${v.cta}`} />
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

function VariationCard({
  index,
  type,
  variation,
}: {
  index: number;
  type: ContentType;
  variation: ContentVariation;
}) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          Variação {index + 1}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {type === "feed" && <FeedCard v={variation as FeedVariation} />}
        {type === "stories" && <StoriesCard v={variation as StoriesVariation} />}
        {type === "reels" && <ReelsCard v={variation as ReelsVariation} />}
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
  const cfg = TYPE_CONFIG[item.type];
  const Icon = cfg.icon;
  const date = new Date(item.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.theme}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="secondary" className="text-xs capitalize">{cfg.label}</Badge>
          {item.productName && (
            <span className="text-xs text-muted-foreground truncate">{item.productName}</span>
          )}
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onDelete(item.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function Content() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tenantId = user?.tenantId ?? "";

  const [activeTab, setActiveTab] = useState<ContentType>("feed");
  const [theme, setTheme] = useState("");
  const [productId, setProductId] = useState<string>("none");
  const [variations, setVariations] = useState(2);
  const [lastResult, setLastResult] = useState<ContentGeneration | null>(null);

  const { data: products } = useListProdutosCatalogo(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getListProdutosCatalogoQueryKey(tenantId),
    },
  });

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

  const generateMutation = useMutation<ContentGeneration, Error, { type: ContentType; theme: string; productId?: string; variations: number }>({
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
      variations,
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
                      <Label>Produto (opcional)</Label>
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
                        placeholder={TYPE_CONFIG[key].placeholder}
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
                      <VariationCard key={i} index={i} type={lastResult.type} variation={v} />
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
