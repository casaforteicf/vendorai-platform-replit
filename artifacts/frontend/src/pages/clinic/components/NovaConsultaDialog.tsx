import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const t = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  defaultDate?: string;
  defaultHorario?: string;
  defaultMedicoId?: string;
  onSuccess: () => void;
}

export default function NovaConsultaDialog({
  open, onOpenChange, tenantId,
  defaultDate, defaultHorario, defaultMedicoId, onSuccess,
}: Props) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const [clienteSearch, setClienteSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [medicoId, setMedicoId]         = useState(defaultMedicoId ?? "");
  const [especialidadeId, setEspecialidadeId] = useState("");
  const [data, setData]                 = useState(defaultDate ?? today);
  const [horario, setHorario]           = useState(defaultHorario ?? "09:00");
  const [tipo, setTipo]                 = useState("presencial");
  const [convenio, setConvenio]         = useState("");
  const [carteirinha, setCarteirinha]   = useState("");

  useEffect(() => {
    if (open) {
      setData(defaultDate ?? today);
      setHorario(defaultHorario ?? "09:00");
      setMedicoId(defaultMedicoId ?? "");
      setClienteSearch(""); setSelectedLead(null);
      setEspecialidadeId(""); setTipo("presencial");
      setConvenio(""); setCarteirinha("");
    }
  }, [open, defaultDate, defaultHorario, defaultMedicoId]);

  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ["leads-search", tenantId, clienteSearch],
    queryFn: () =>
      fetch(`${getBase()}/api/tenants/${tenantId}/leads?limit=10&search=${encodeURIComponent(clienteSearch)}`, {
        headers: authHeaders(),
      }).then((r) => r.json()).then((d) => Array.isArray(d) ? d : d.leads ?? []),
    enabled: !!tenantId && clienteSearch.length >= 2,
  });

  const { data: medicos = [] } = useQuery<any[]>({
    queryKey: ["clinic-medicos", tenantId],
    queryFn: () =>
      fetch(`${getBase()}/api/tenants/${tenantId}/clinic/medicos`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId && open,
  });

  const { data: especialidades = [] } = useQuery<any[]>({
    queryKey: ["clinic-especialidades", tenantId],
    queryFn: () =>
      fetch(`${getBase()}/api/tenants/${tenantId}/clinic/especialidades`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId && open,
  });

  const selectedMedico = Array.isArray(medicos)
    ? medicos.find((m: any) => m.id === medicoId)
    : undefined;

  useEffect(() => {
    if (selectedMedico?.especialidade?.id) {
      setEspecialidadeId(selectedMedico.especialidade.id);
    }
  }, [selectedMedico]);

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      fetch(`${getBase()}/api/tenants/${tenantId}/clinic/consultas`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro ao criar consulta");
        return r.json();
      }),
    onSuccess: () => { toast({ title: "Consulta agendada!" }); onSuccess(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!medicoId || !data || !horario) {
      toast({ title: "Médico, data e horário são obrigatórios", variant: "destructive" });
      return;
    }
    const dataHora = `${data}T${horario.length === 5 ? horario + ":00" : horario}`;
    mutation.mutate({
      pacienteId: selectedLead?.id ?? null,
      pacienteNome: (selectedLead?.nome ?? clienteSearch) || null,
      medicoId,
      especialidadeId: especialidadeId || null,
      dataHora,
      tipoAtendimento: tipo,
      convenio: convenio || null,
      carteirinha: carteirinha || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Consulta</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Paciente */}
          <div className="space-y-1.5">
            <Label>Paciente</Label>
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={selectedLead ? selectedLead.nome : clienteSearch}
              onChange={(e) => { setClienteSearch(e.target.value); setSelectedLead(null); }}
            />
            {!selectedLead && clienteSearch.length >= 2 && Array.isArray(leads) && leads.length > 0 && (
              <div className="border rounded-md bg-card shadow-sm max-h-36 overflow-y-auto">
                {leads.map((l: any) => (
                  <button key={l.id} type="button"
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

          {/* Médico */}
          <div className="space-y-1.5">
            <Label>Médico <span className="text-destructive">*</span></Label>
            <Select value={medicoId} onValueChange={setMedicoId}>
              <SelectTrigger><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
              <SelectContent>
                {Array.isArray(medicos) && medicos.filter((m: any) => m.ativo !== false).map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}{m.crm ? ` — CRM ${m.crm}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Especialidade */}
          <div className="space-y-1.5">
            <Label>Especialidade</Label>
            <Select value={especialidadeId} onValueChange={setEspecialidadeId}>
              <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
              <SelectContent>
                {Array.isArray(especialidades) && especialidades.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
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

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo de Atendimento</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="presencial">Presencial</SelectItem>
                <SelectItem value="telemedicina">Telemedicina</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Convênio */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Convênio</Label>
              <Input value={convenio} onChange={(e) => setConvenio(e.target.value)} placeholder="ex: Unimed" />
            </div>
            <div className="space-y-1.5">
              <Label>Carteirinha</Label>
              <Input value={carteirinha} onChange={(e) => setCarteirinha(e.target.value)} placeholder="Nº da carteirinha" />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
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
