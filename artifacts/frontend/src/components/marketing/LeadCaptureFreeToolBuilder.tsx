import { useEffect, useMemo, useState } from "react";
import { Bot, Gift, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type Tool = {
  id?: string;
  toolKey: string;
  toolLabel: string;
  deliveryType?: string;
  enabled?: boolean;
  freePolicy?: { mode?: string; limit?: number; durationDays?: number };
};

type Magnet = { id: string; title: string; promise?: string };

const DEFAULT_MAGNETS = [
  "Calcular uma oportunidade",
  "Diagnosticar a situação atual",
  "Projetar um resultado",
  "Descobrir oportunidades",
  "Montar um plano inicial",
];

function headers() {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    "Content-Type": "application/json",
  };
}

export default function LeadCaptureFreeToolBuilder({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vertical, setVertical] = useState<string | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [suggestedTools, setSuggestedTools] = useState<Tool[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState("Captação com ferramenta gratuita");
  const [jarvisBrief, setJarvisBrief] = useState("");
  const [jarvisBuilding, setJarvisBuilding] = useState(false);
  const [magnets, setMagnets] = useState<Magnet[]>(() =>
    DEFAULT_MAGNETS.map((title, index) => ({ id: `magnet-${index + 1}`, title })),
  );

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/lead-capture`, { headers: headers() });
      if (!response.ok) throw new Error("Não foi possível carregar as entregas de captação");
      const data = await response.json();
      setVertical(data.vertical ?? null);
      setTools(Array.isArray(data.tools) ? data.tools : []);
      setSuggestedTools(Array.isArray(data.suggestedTools) ? data.suggestedTools : []);
      const available = (data.tools?.length ? data.tools : data.suggestedTools) ?? [];
      const availableKeys = new Set(available.map((tool: Tool) => tool.toolKey));
      setSelectedKeys((current) => {
        const valid = current.filter((key) => availableKeys.has(key));
        return valid.length ? valid : available.slice(0, 1).map((tool: Tool) => tool.toolKey);
      });
    } catch (error) {
      toast({ title: "Erro ao carregar captação", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId]);

  const availableTools = useMemo(() => tools.length ? tools : suggestedTools, [tools, suggestedTools]);

  function addMagnet() {
    setMagnets((current) => [...current, { id: crypto.randomUUID(), title: `Nova entrada ${current.length + 1}` }]);
  }

  async function activateSuggestedTool(tool: Tool) {
    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/lead-capture/tools`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ ...tool, vertical }),
      });
      if (!response.ok) throw new Error("Não foi possível habilitar a ferramenta");
      await load();
      toast({ title: "Entrega habilitada", description: `${tool.toolLabel} agora pode ser usada como entrega gratuita.` });
    } catch (error) {
      toast({ title: "Erro ao habilitar ferramenta", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function buildWithJarvis() {
    const brief = jarvisBrief.trim();
    if (brief.length < 8) {
      toast({ title: "Descreva a entrega que você quer criar", description: "Explique em uma frase o que o lead deve conseguir fazer.", variant: "destructive" });
      return;
    }
    setJarvisBuilding(true);
    try {
      const response = await fetch("/api/jarvis/tool-builder", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          brief,
          mode: "auto",
          publish: true,
          freePolicy: { mode: "uses", limit: 1 },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) throw new Error(body.error || "O Vendi não conseguiu preparar a entrega");

      if (body.strategy === "requires_development") {
        toast({
          title: "Capacidade nova necessária",
          description: body.summary || "O Vendi identificou que falta uma capacidade real da plataforma antes de publicar esta ferramenta.",
        });
        return;
      }

      await load();
      if (body.tool?.toolKey) {
        setSelectedKeys((current) => current.includes(body.tool.toolKey) ? current : [...current, body.tool.toolKey]);
      }
      setJarvisBrief("");
      toast({
        title: body.strategy === "reuse" ? "Vendi encontrou uma ferramenta existente" : "Ferramenta criada pelo Vendi",
        description: body.summary,
      });
    } catch (error) {
      toast({ title: "Erro no Vendi", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setJarvisBuilding(false);
    }
  }

  async function saveCampaign() {
    if (!selectedKeys.length) {
      toast({ title: "Selecione ao menos uma entrega gratuita", variant: "destructive" });
      return;
    }
    if (!magnets.length) {
      toast({ title: "Adicione ao menos uma entrada", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      for (const tool of suggestedTools.filter((item) => selectedKeys.includes(item.toolKey))) {
        const toolResponse = await fetch(`/api/tenants/${tenantId}/lead-capture/tools`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ ...tool, vertical }),
        });
        if (!toolResponse.ok) throw new Error(`Falha ao habilitar ${tool.toolLabel}`);
      }

      const response = await fetch(`/api/tenants/${tenantId}/lead-capture/campaigns`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: campaignName,
          objective: "Captar leads entregando gratuitamente uma ferramenta já existente do tenant",
          magnets: magnets.map((m) => ({ ...m, active: true })),
          deliveryToolKeys: selectedKeys,
          status: "draft",
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Não foi possível salvar a campanha");
      }
      toast({ title: "Campanha de captação criada", description: `${magnets.length} entrada(s) ligada(s) a ${selectedKeys.length} entrega(s) free.` });
      await load();
    } catch (error) {
      toast({ title: "Erro ao salvar", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Card><CardContent className="py-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando ferramentas de captação…</CardContent></Card>;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Gift className="h-4 w-4" />Captação com ferramenta gratuita</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Crie quantas entradas quiser e entregue uma ou mais ferramentas que o tenant já possui.</p>
          </div>
          {vertical && <Badge variant="outline">{vertical}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <label className="text-xs font-medium">Nome da campanha</label>
          <input className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Entradas da campanha</p>
              <p className="text-xs text-muted-foreground">A quantidade é livre. Todas podem levar para a mesma entrega.</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addMagnet}><Plus className="mr-1 h-3.5 w-3.5" />Adicionar entrada</Button>
          </div>
          <div className="space-y-2">
            {magnets.map((magnet, index) => (
              <div key={magnet.id} className="flex items-center gap-2">
                <span className="w-6 text-right text-xs text-muted-foreground">{index + 1}.</span>
                <input
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
                  value={magnet.title}
                  onChange={(e) => setMagnets((current) => current.map((item) => item.id === magnet.id ? { ...item, title: e.target.value } : item))}
                />
                <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={() => setMagnets((current) => current.filter((item) => item.id !== magnet.id))} disabled={magnets.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Entrega(s) gratuita(s)</p>
            <p className="text-xs text-muted-foreground">Use ferramentas existentes ou peça ao Vendi para reutilizar, compor ou criar uma nova experiência com as capacidades já disponíveis.</p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Quero outra entrega</p>
            </div>
            <textarea
              className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Ex.: Quero uma ferramenta para o lead informar o tamanho do ambiente e receber uma sugestão inicial usando os produtos do meu catálogo."
              value={jarvisBrief}
              onChange={(e) => setJarvisBrief(e.target.value)}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[11px] text-muted-foreground">O Vendi procura primeiro algo existente. Só cria uma nova experiência quando puder usar capacidades reais e seguras da plataforma.</p>
              <Button type="button" size="sm" variant="outline" disabled={jarvisBuilding} onClick={() => void buildWithJarvis()}>
                {jarvisBuilding ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Bot className="mr-1.5 h-3.5 w-3.5" />}
                Desenvolver com Vendi
              </Button>
            </div>
          </div>
          {availableTools.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma ferramenta foi marcada para captação neste tenant. O cadastro pode ser feito conforme as ferramentas da vertical forem validadas.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {availableTools.map((tool) => {
                const checked = selectedKeys.includes(tool.toolKey);
                const isSuggested = !tool.id;
                return (
                  <label key={tool.toolKey} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${checked ? "border-primary bg-primary/[0.03]" : ""}`}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => setSelectedKeys((current) => checked ? current.filter((key) => key !== tool.toolKey) : [...current, tool.toolKey])}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="text-sm font-medium">{tool.toolLabel}</span>{isSuggested && <Badge variant="secondary">sugerida</Badge>}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">Free: {tool.freePolicy?.mode === "session" ? "1 sessão" : `${tool.freePolicy?.limit ?? 1} uso(s)`}</span>
                      {isSuggested && (
                        <Button type="button" size="sm" variant="link" className="mt-1 h-auto p-0 text-xs" disabled={saving} onClick={(e) => { e.preventDefault(); void activateSuggestedTool(tool); }}>
                          Habilitar no tenant
                        </Button>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4 flex-wrap">
          <p className="text-xs text-muted-foreground">{magnets.length} entrada(s) → {selectedKeys.length} entrega(s) selecionada(s)</p>
          <Button type="button" onClick={() => void saveCampaign()} disabled={saving || !selectedKeys.length || !magnets.length}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Salvar captação
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
