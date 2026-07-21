import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, TrendingUp, Zap } from "lucide-react";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const t = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

const TIPO_OPTS = [
  { value: "recompra",    label: "Recompra prevista" },
  { value: "cliente_inativo", label: "Cliente inativo" },
  { value: "cross_sell",  label: "Cross-sell" },
  { value: "reativacao",  label: "Reativação" },
  { value: "upgrade",     label: "Upgrade" },
  { value: "aniversario", label: "Aniversário" },
];
const TIPO_COLORS: Record<string, string> = {
  recompra:    "bg-blue-50 text-blue-700 border-blue-200",
  cliente_inativo: "bg-slate-50 text-slate-700 border-slate-200",
  cross_sell:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  reativacao:  "bg-amber-50 text-amber-700 border-amber-200",
  upgrade:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  aniversario: "bg-pink-50 text-pink-700 border-pink-200",
};
const CHIPS = ["{{nome}}", "{{servico}}", "{{desconto}}"];

interface FormState {
  nome: string;
  tipo: string;
  canal: string;
  mensagem: string;
  // condições por tipo
  diasSemRetornar: string;
  diasSemVisita: string;
  servicoBase: string;
  servicoSugerido: string;
  servicoAtual: string;
  servicoPremium: string;
}
const EMPTY_FORM: FormState = {
  nome: "", tipo: "", canal: "whatsapp", mensagem: "",
  diasSemRetornar: "30", diasSemVisita: "60",
  servicoBase: "", servicoSugerido: "",
  servicoAtual: "", servicoPremium: "",
};

export default function Regras() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen]   = useState(false);
  const [form, setForm]   = useState<FormState>({ ...EMPTY_FORM });
  const msgRef            = useRef<HTMLTextAreaElement>(null);

  const QK = ["scout-regras", tenantId];

  const { data: regras = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/scout/regras`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  function buildPayload() {
    let condicoes: Record<string, unknown> = {};
    if (form.tipo === "recompra")   condicoes = { diasSemRetornar: Number(form.diasSemRetornar) };
    if (form.tipo === "reativacao" || form.tipo === "cliente_inativo") {
      condicoes = { diasSemVisita: Number(form.diasSemVisita) };
    }
    if (form.tipo === "cross_sell") condicoes = { servicoBase: form.servicoBase, servicoSugerido: form.servicoSugerido };
    if (form.tipo === "upgrade")    condicoes = { servicoAtual: form.servicoAtual, servicoPremium: form.servicoPremium };
    if (form.tipo === "aniversario") condicoes = {};
    return {
      nome: form.nome,
      tipo: form.tipo,
      condicoes,
      acao: { mensagem: form.mensagem, canal: form.canal },
    };
  }

  const create = useMutation({
    mutationFn: (payload: any) =>
      fetch(`/api/tenants/${tenantId}/scout/regras`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: "Regra criada!" });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/tenants/${tenantId}/scout/regras/${id}/toggle`, {
        method: "PATCH", headers: authHeaders(),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError: () => toast({ title: "Erro", variant: "destructive" }),
  });

  function insertChip(chip: string) {
    const el = msgRef.current;
    if (!el) { setForm((f) => ({ ...f, mensagem: f.mensagem + chip })); return; }
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const next  = el.value.slice(0, start) + chip + el.value.slice(end);
    setForm((f) => ({ ...f, mensagem: next }));
    setTimeout(() => { el.focus(); el.setSelectionRange(start + chip.length, start + chip.length); }, 0);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome || !form.tipo || !form.mensagem) {
      toast({ title: "Nome, tipo e mensagem são obrigatórios", variant: "destructive" });
      return;
    }
    create.mutate(buildPayload());
  }

  const regrasArr = Array.isArray(regras) ? regras : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-5 w-5" /> Regras do Revenue Scout
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure gatilhos automáticos para identificar oportunidades de receita
          </p>
        </div>
        <Button onClick={() => { setForm({ ...EMPTY_FORM }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova Regra
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : regrasArr.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <Zap className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada.</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Crie regras para o scout identificar oportunidades automaticamente.
          </p>
          <Button variant="outline" onClick={() => { setForm({ ...EMPTY_FORM }); setOpen(true); }}>
            Criar primeira regra
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {regrasArr.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-sm">{r.nome}</p>
                      <Badge variant="outline" className={`text-xs ${TIPO_COLORS[r.tipo] ?? ""}`}>
                        {TIPO_OPTS.find((t) => t.value === r.tipo)?.label ?? r.tipo}
                      </Badge>
                      {!r.ativo && (
                        <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500">Inativa</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{r.totalDisparos ?? 0} disparos</span>
                      {r.acao?.canal && (
                        <span className="capitalize">Canal: {r.acao.canal === "whatsapp" ? "WhatsApp" : "E-mail"}</span>
                      )}
                    </div>
                    {r.acao?.mensagem && (
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-xl italic">
                        "{r.acao.mensagem}"
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={r.ativo !== false}
                    onCheckedChange={() => toggle.mutate(r.id)}
                    disabled={toggle.isPending}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog nova regra */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Regra</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input placeholder="Ex: Recompra mensal" value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>

            {/* Tipo */}
            <div className="space-y-1.5">
              <Label>Tipo <span className="text-destructive">*</span></Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Condições dinâmicas */}
            {form.tipo === "recompra" && (
              <div className="space-y-1.5 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={365} className="w-24"
                    value={form.diasSemRetornar}
                    onChange={(e) => setForm((f) => ({ ...f, diasSemRetornar: e.target.value }))} />
                  <span className="text-sm text-muted-foreground">dias sem retornar</span>
                </div>
              </div>
            )}
            {(form.tipo === "reativacao" || form.tipo === "cliente_inativo") && (
              <div className="space-y-1.5 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={365} className="w-24"
                    value={form.diasSemVisita}
                    onChange={(e) => setForm((f) => ({ ...f, diasSemVisita: e.target.value }))} />
                  <span className="text-sm text-muted-foreground">dias sem visita</span>
                </div>
              </div>
            )}
            {form.tipo === "cross_sell" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <div className="space-y-1.5">
                  <Label className="text-xs">Serviço base</Label>
                  <Input placeholder="Ex: Corte de cabelo" value={form.servicoBase}
                    onChange={(e) => setForm((f) => ({ ...f, servicoBase: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Serviço sugerido</Label>
                  <Input placeholder="Ex: Coloração" value={form.servicoSugerido}
                    onChange={(e) => setForm((f) => ({ ...f, servicoSugerido: e.target.value }))} />
                </div>
              </div>
            )}
            {form.tipo === "upgrade" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <div className="space-y-1.5">
                  <Label className="text-xs">Serviço atual</Label>
                  <Input placeholder="Ex: Plano Básico" value={form.servicoAtual}
                    onChange={(e) => setForm((f) => ({ ...f, servicoAtual: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Serviço premium</Label>
                  <Input placeholder="Ex: Plano Premium" value={form.servicoPremium}
                    onChange={(e) => setForm((f) => ({ ...f, servicoPremium: e.target.value }))} />
                </div>
              </div>
            )}
            {form.tipo === "aniversario" && (
              <div className="p-3 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                Dispara automaticamente no aniversário do cliente. Nenhuma condição adicional necessária.
              </div>
            )}

            {/* Mensagem */}
            <div className="space-y-1.5">
              <Label>Mensagem <span className="text-destructive">*</span></Label>
              <div className="flex flex-wrap gap-1 mb-1">
                {CHIPS.map((chip) => (
                  <button key={chip} type="button"
                    onClick={() => insertChip(chip)}
                    className="text-xs px-2 py-0.5 rounded border bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono">
                    {chip}
                  </button>
                ))}
              </div>
              <Textarea
                ref={msgRef}
                rows={4}
                placeholder="Olá {{nome}}, temos uma oferta especial para você..."
                value={form.mensagem}
                onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
              />
            </div>

            {/* Canal */}
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={form.canal} onValueChange={(v) => setForm((f) => ({ ...f, canal: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Regra
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
