import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Send, Pencil, Eye, EyeOff, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface SdrTemplate {
  id: string;
  tenantId: string | null;
  cenario: string;
  ordem: number;
  delayHoras: number;
  template: string;
  ativo: boolean;
  isGlobal?: boolean;
}

const CENARIO_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  frio_teste:    { label: "Prospecção fria — Teste",   desc: "1ª msg: simula cliente buscando orçamento",    color: "bg-blue-100 text-blue-700" },
  frio_revelacao:{ label: "Prospecção fria — Revelação",desc: "2ª msg: enviada após resposta ou 20h sem resposta", color: "bg-indigo-100 text-indigo-700" },
  pos_visita:    { label: "Pós-visita sem decisor",     desc: "Lead que recebeu visita presencial",           color: "bg-amber-100 text-amber-700" },
  direto_dono:   { label: "Direto ao dono",             desc: "Lead com contato direto do decisor",          color: "bg-green-100 text-green-700" },
};

const VARIABLES_HELP = `{segmento_produto} — categoria do lead
{segmento} — vertical/setor do lead
{cidade} — cidade do lead
{dono_nome} — sócio ou dono (fallback: "o dono")
{nome_gatekeeper} — pessoa da visita
{principal_reclamacao} — reclamação das reviews
{vendedor_nome} — nome do responsável do deal
{tempo_espera} — tempo desde 1ª mensagem
{status_resposta} — "ainda não tive resposta" ou "só agora tive resposta"
{dia_sugestao_1} / {dia_sugestao_2} — próximos dias úteis
{hora_sugestao_1} — primeiro horário disponível`;

interface Props {
  tenantId: string;
}

export function SdrTemplatesSection({ tenantId }: Props) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<SdrTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<SdrTemplate | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState<string | null>(null);
  const [showVars, setShowVars] = useState(false);

  const token = localStorage.getItem("vendorai_token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sdr-templates`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tenantId]);

  const handleSave = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sdr-templates/${editTarget.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ template: editValue, ativo: editTarget.ativo, delayHoras: editTarget.delayHoras }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      toast({ title: "Template salvo com sucesso!" });
      setEditTarget(null);
      await load();
    } catch {
      toast({ title: "Erro ao salvar template", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (tpl: SdrTemplate) => {
    try {
      const res = await fetch(`/api/sdr-templates/${tpl.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ template: tpl.template, ativo: !tpl.ativo }),
      });
      if (!res.ok) throw new Error();
      toast({ title: !tpl.ativo ? "Template ativado" : "Template pausado" });
      await load();
    } catch {
      toast({ title: "Erro ao alterar template", variant: "destructive" });
    }
  };

  const handleTestSend = async (tpl: SdrTemplate) => {
    setTestSending(tpl.id);
    try {
      const res = await fetch(`/api/sdr-templates/test-send`, {
        method: "POST",
        headers,
        body: JSON.stringify({ cenario: tpl.cenario, ordem: tpl.ordem }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha");
      toast({ title: "✅ Teste enviado para seu WhatsApp!", description: "Verifique seu celular." });
    } catch (err: any) {
      toast({ title: err.message ?? "Erro ao enviar teste", variant: "destructive" });
    } finally {
      setTestSending(null);
    }
  };

  return (
    <div className="rounded-xl border bg-card">
      <div className="px-6 py-4 flex items-center justify-between border-b">
        <div>
          <h2 className="font-semibold text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-green-600" />
            📨 Templates de Primeira Abordagem
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            O Agente SDR seleciona e envia automaticamente conforme o cenário do lead.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowVars((v) => !v)} className="gap-1.5 text-xs">
            {showVars ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            Variáveis
          </Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {showVars && (
        <div className="px-6 py-3 bg-slate-50 border-b">
          <p className="text-xs font-medium text-slate-600 mb-1.5">Variáveis disponíveis</p>
          <pre className="text-xs text-slate-500 whitespace-pre-wrap font-mono leading-5">{VARIABLES_HELP}</pre>
        </div>
      )}

      <div className="divide-y">
        {loading
          ? [1, 2, 3, 4].map((i) => (
              <div key={i} className="px-6 py-4 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))
          : templates.map((tpl) => {
              const meta = CENARIO_LABELS[tpl.cenario] ?? { label: tpl.cenario, desc: "", color: "bg-muted text-muted-foreground" };
              return (
                <div key={tpl.id} className="px-6 py-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs px-2 py-0 ${meta.color}`}>{meta.label}</Badge>
                        {tpl.delayHoras > 0 && (
                          <span className="text-xs text-muted-foreground">⏱ {tpl.delayHoras}h delay</span>
                        )}
                        {tpl.isGlobal && (
                          <span className="text-xs text-muted-foreground italic">global</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{meta.desc}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => handleTestSend(tpl)}
                        disabled={testSending === tpl.id}
                      >
                        <Send className="h-3 w-3" />
                        {testSending === tpl.id ? "Enviando..." : "Testar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => { setEditTarget(tpl); setEditValue(tpl.template); }}
                      >
                        <Pencil className="h-3 w-3" />
                        Editar
                      </Button>
                      <Switch
                        checked={tpl.ativo}
                        onCheckedChange={() => handleToggle(tpl)}
                        className="scale-75"
                      />
                    </div>
                  </div>
                  <div className={`rounded-md border px-3 py-2 text-xs font-mono whitespace-pre-wrap leading-5 ${!tpl.ativo ? "opacity-40" : ""}`}>
                    {tpl.template}
                  </div>
                </div>
              );
            })}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Editar template — {editTarget ? (CENARIO_LABELS[editTarget.cenario]?.label ?? editTarget.cenario) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="min-h-[180px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use as variáveis entre chaves: <code className="bg-muted px-1 rounded">{"{dono_nome}"}</code>,{" "}
              <code className="bg-muted px-1 rounded">{"{vendedor_nome}"}</code>, etc.
              Variáveis sem valor são substituídas automaticamente por fallbacks — nunca aparecem como placeholder.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !editValue.trim()}>
              {saving ? "Salvando..." : "Salvar template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
