import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateAgendamento,
  useListAgendas,
  getListAgendamentosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Video, MapPin, Phone, Loader2 } from "lucide-react";

type Modalidade = "presencial" | "meet" | "ligacao";

interface Slot {
  start: string;
  end: string;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  dealId: string;
  leadId: string;
  leadNome: string;
  responsavelId?: string | null;
}

const DURACOES = [
  { value: "30",  label: "30 min" },
  { value: "45",  label: "45 min" },
  { value: "60",  label: "1 hora" },
  { value: "90",  label: "1h 30min" },
  { value: "120", label: "2 horas" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function AgendarReuniaoModal({
  open, onClose, tenantId, dealId, leadId, leadNome, responsavelId,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [modalidade, setModalidade] = useState<Modalidade>("meet");
  const [date, setDate]             = useState<string>(tomorrowISO());
  const [duracao, setDuracao]       = useState<string>("30");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [observacoes, setObservacoes]   = useState<string>("");
  const [slots, setSlots]           = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const { data: agendas = [] } = useListAgendas(tenantId);
  const defaultAgenda = agendas[0];
  const createAgendamento = useCreateAgendamento();

  // Re-fetch slots when date, duracao or agenda changes
  useEffect(() => {
    if (!open || !date) return;
    setSlots([]);
    setSelectedSlot(null);
    setLoadingSlots(true);

    const params = new URLSearchParams({ date, duracao });
    if (defaultAgenda?.id) params.set("agendaId", defaultAgenda.id);
    if (responsavelId) params.set("responsavelId", responsavelId);

    const token = localStorage.getItem("vendorai_token");
    fetch(`/api/tenants/${tenantId}/agendamentos/slots?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: { slots: Slot[] }) => {
        setSlots(data.slots ?? []);
      })
      .catch(() => {
        setSlots([]);
      })
      .finally(() => setLoadingSlots(false));
  }, [open, date, duracao, defaultAgenda?.id, responsavelId, tenantId]);

  function handleConfirm() {
    if (!selectedSlot) {
      toast({ title: "Selecione um horário", variant: "destructive" });
      return;
    }

    createAgendamento.mutate(
      {
        data: {
          tenantId,
          dealId,
          leadId,
          agendaId: defaultAgenda?.id ?? undefined,
          responsavelId: responsavelId ?? undefined,
          tipo: "reuniao",
          gerarMeet: modalidade === "meet",
          titulo: `Reunião com ${leadNome}`,
          dataHoraInicio: new Date(selectedSlot.start) as any,
          dataHoraFim: new Date(selectedSlot.end) as any,
          status: "agendado",
          observacoes: observacoes || undefined,
          // Extra fields accepted by backend but not yet in generated types:
          modalidade,
          criadoPor: "humano",
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "📅 Reunião agendada com sucesso!" });
          queryClient.invalidateQueries({ queryKey: getListAgendamentosQueryKey(tenantId) });
          onClose();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Erro ao agendar. Tente novamente.";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Agendar com {leadNome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Tipo ── */}
          <div className="space-y-2">
            <Label>Tipo</Label>
            <div className="flex gap-2">
              {(["presencial", "meet", "ligacao"] as Modalidade[]).map((m) => {
                const label = m === "presencial" ? "Presencial" : m === "meet" ? "Google Meet" : "Ligação";
                const Icon  = m === "meet" ? Video : m === "ligacao" ? Phone : MapPin;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModalidade(m)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                      modalidade === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Data ── */}
          <div className="space-y-2">
            <Label>Data</Label>
            <input
              type="date"
              value={date}
              min={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* ── Duração ── */}
          <div className="space-y-2">
            <Label>Duração</Label>
            <Select value={duracao} onValueChange={setDuracao}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURACOES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Horários disponíveis ── */}
          <div className="space-y-2">
            <Label>Horários disponíveis</Label>
            {loadingSlots ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando horários…
              </div>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nenhum horário disponível para este dia.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                      selectedSlot?.start === slot.start
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/60 hover:bg-muted/40"
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Observações ── */}
          <div className="space-y-2">
            <Label>Observações <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Pauta, endereço, instruções de acesso…"
              rows={2}
            />
          </div>

          {/* ── Participantes (informativo) ── */}
          {defaultAgenda?.googleEmail && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium">Agenda conectada:</span> {defaultAgenda.googleEmail}
              {modalidade === "meet" && (
                <span className="block mt-0.5 text-emerald-600 font-medium">✓ Link do Google Meet será gerado automaticamente</span>
              )}
            </div>
          )}

          {/* ── Ações ── */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} type="button">
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleConfirm}
              disabled={!selectedSlot || createAgendamento.isPending}
              type="button"
            >
              {createAgendamento.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Agendando…</>
              ) : "Confirmar agenda"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
