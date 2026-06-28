import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  defaultDate?: string;
  defaultHorario?: string;
  defaultProfissionalId?: string;
  onSuccess: () => void;
}

export default function NovoAgendamentoDialog({
  open, onOpenChange, tenantId, defaultDate, defaultHorario, defaultProfissionalId, onSuccess,
}: Props) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const [clienteSearch, setClienteSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [servicoId, setServicoId] = useState("");
  const [profissionalId, setProfissionalId] = useState(defaultProfissionalId ?? "");
  const [data, setData] = useState(defaultDate ?? today);
  const [horario, setHorario] = useState(defaultHorario ?? "09:00");
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    if (open) {
      setData(defaultDate ?? today);
      setHorario(defaultHorario ?? "09:00");
      setProfissionalId(defaultProfissionalId ?? "");
      setClienteSearch("");
      setSelectedLead(null);
      setServicoId("");
      setObservacoes("");
    }
  }, [open, defaultDate, defaultHorario, defaultProfissionalId]);

  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ["leads-search", tenantId, clienteSearch],
    queryFn: () =>
      fetch(`${getBase()}/api/tenants/${tenantId}/leads?limit=10&search=${encodeURIComponent(clienteSearch)}`, {
        headers: authHeaders(),
      }).then((r) => r.json()).then((d) => Array.isArray(d) ? d : d.leads ?? []),
    enabled: !!tenantId && clienteSearch.length >= 2,
  });

  const { data: servicos = [] } = useQuery<any[]>({
    queryKey: ["beauty-servicos", tenantId],
    queryFn: () =>
      fetch(`${getBase()}/api/tenants/${tenantId}/beauty/servicos`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId && open,
  });

  const { data: profissionais = [] } = useQuery<any[]>({
    queryKey: ["beauty-profissionais", tenantId],
    queryFn: () =>
      fetch(`${getBase()}/api/tenants/${tenantId}/beauty/profissionais`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId && open,
  });

  const selectedServico = Array.isArray(servicos) ? servicos.find((s: any) => s.id === servicoId) : undefined;

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      fetch(`${getBase()}/api/tenants/${tenantId}/beauty/agendamentos`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro ao criar agendamento");
        return r.json();
      }),
    onSuccess: () => { toast({ title: "Agendamento criado!" }); onSuccess(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!servicoId || !profissionalId || !data || !horario) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    mutation.mutate({
      leadId: selectedLead?.id ?? null,
      clienteNome: selectedLead?.nome ?? clienteSearch,
      clienteTelefone: selectedLead?.telefone ?? null,
      servicoId,
      profissionalId,
      data,
      horario: horario.length === 5 ? horario + ":00" : horario,
      observacoes: observacoes || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Agendamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Cliente */}
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={selectedLead ? selectedLead.nome : clienteSearch}
              onChange={(e) => { setClienteSearch(e.target.value); setSelectedLead(null); }}
            />
            {!selectedLead && clienteSearch.length >= 2 && Array.isArray(leads) && leads.length > 0 && (
              <div className="border rounded-md bg-card shadow-sm max-h-36 overflow-y-auto">
                {leads.map((l: any) => (
                  <button
                    key={l.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={() => { setSelectedLead(l); setClienteSearch(""); }}
                  >
                    <span className="font-medium">{l.nome}</span>
                    {l.telefone && <span className="text-muted-foreground ml-2">{l.telefone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Serviço */}
          <div className="space-y-1.5">
            <Label>Serviço <span className="text-destructive">*</span></Label>
            <Select value={servicoId} onValueChange={setServicoId}>
              <SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger>
              <SelectContent>
                {Array.isArray(servicos) && servicos.filter((s: any) => s.ativo !== false).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome} — {Number(s.preco ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedServico && (
              <p className="text-xs text-muted-foreground">
                Duração: {selectedServico.duracaoMinutos} min
              </p>
            )}
          </div>

          {/* Profissional */}
          <div className="space-y-1.5">
            <Label>Profissional <span className="text-destructive">*</span></Label>
            <Select value={profissionalId} onValueChange={setProfissionalId}>
              <SelectTrigger><SelectValue placeholder="Selecione o profissional" /></SelectTrigger>
              <SelectContent>
                {Array.isArray(profissionais) && profissionais.filter((p: any) => p.ativo !== false).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data e Horário */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data <span className="text-destructive">*</span></Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Horário <span className="text-destructive">*</span></Label>
              <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} step={1800} />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              rows={2}
              placeholder="Preferências, alergias..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
