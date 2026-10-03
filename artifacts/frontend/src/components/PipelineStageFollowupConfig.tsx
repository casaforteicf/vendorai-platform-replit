import { useEffect, useMemo, useState } from "react";
import { Bot, Check, ChevronDown, Loader2, MessageSquareMore } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch, getListPipelineStagesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Canal = "whatsapp" | "instagram" | "messenger" | "email" | "chat" | "ligacao";
type Modo = "automatico" | "gerar_aprovar" | "somente_sugestao";
export type ConfiguracaoAcompanhamento = {
  ativo?: boolean;
  objetivo?: string;
  modo?: Modo;
  canaisPermitidos?: Canal[];
  atrasoInicialMinutos?: number;
  intervaloMinimoMinutos?: number;
  maxTentativas?: number;
  conteudosPermitidos?: Array<"texto" | "imagem" | "video" | "audio" | "documento" | "proposta" | "case">;
  usarBeneficios?: boolean;
  usarDiferenciais?: boolean;
  usarProvas?: boolean;
  pararAoResponder?: boolean;
  chamarHumanoEmNegociacaoSensivel?: boolean;
  instrucoes?: string;
};

const CANAIS: Array<{ value: Canal; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "messenger", label: "Messenger" },
  { value: "email", label: "E-mail" },
  { value: "chat", label: "Chat" },
  { value: "ligacao", label: "Ligação / tarefa humana" },
];

function defaults(value?: ConfiguracaoAcompanhamento | null): Required<Pick<
  ConfiguracaoAcompanhamento,
  "ativo" | "objetivo" | "modo" | "canaisPermitidos" | "atrasoInicialMinutos" | "intervaloMinimoMinutos" |
  "maxTentativas" | "usarBeneficios" | "usarDiferenciais" | "usarProvas" | "pararAoResponder" |
  "chamarHumanoEmNegociacaoSensivel" | "instrucoes"
>> {
  return {
    ativo: value?.ativo ?? false,
    objetivo: value?.objetivo ?? "",
    modo: value?.modo ?? "gerar_aprovar",
    canaisPermitidos: value?.canaisPermitidos ?? ["whatsapp", "instagram", "email"],
    atrasoInicialMinutos: value?.atrasoInicialMinutos ?? 1440,
    intervaloMinimoMinutos: value?.intervaloMinimoMinutos ?? 1440,
    maxTentativas: value?.maxTentativas ?? 4,
    usarBeneficios: value?.usarBeneficios ?? true,
    usarDiferenciais: value?.usarDiferenciais ?? true,
    usarProvas: value?.usarProvas ?? true,
    pararAoResponder: value?.pararAoResponder ?? true,
    chamarHumanoEmNegociacaoSensivel: value?.chamarHumanoEmNegociacaoSensivel ?? true,
    instrucoes: value?.instrucoes ?? "",
  };
}

export function PipelineStageFollowupConfig({
  tenantId,
  pipeline,
  stageId,
  stageLabel,
  value,
}: {
  tenantId: string;
  pipeline: string;
  stageId: string;
  stageLabel: string;
  value?: ConfiguracaoAcompanhamento | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => defaults(value));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(defaults(value));
    setSaved(false);
  }, [stageId, value]);

  const channelLabel = useMemo(() => {
    if (!form.canaisPermitidos.length) return "Nenhum canal";
    if (form.canaisPermitidos.length === 1) return CANAIS.find((c) => c.value === form.canaisPermitidos[0])?.label ?? "1 canal";
    return `${form.canaisPermitidos.length} canais`;
  }, [form.canaisPermitidos]);

  function toggleChannel(channel: Canal, checked: boolean) {
    setForm((current) => ({
      ...current,
      canaisPermitidos: checked
        ? [...new Set([...current.canaisPermitidos, channel])]
        : current.canaisPermitidos.filter((item) => item !== channel),
    }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await customFetch(`/api/tenants/${tenantId}/pipeline-stages/${stageId}`, {
        method: "PATCH",
        body: JSON.stringify({
          acompanhamentoConfig: {
            ...form,
            atrasoInicialMinutos: Math.max(0, Number(form.atrasoInicialMinutos) || 0),
            intervaloMinimoMinutos: Math.max(60, Number(form.intervaloMinimoMinutos) || 60),
            maxTentativas: Math.min(20, Math.max(1, Number(form.maxTentativas) || 1)),
            conteudosPermitidos: ["texto", "imagem", "video", "audio", "documento", "proposta", "case"],
          },
        }),
        responseType: "json",
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pipeline-stages", tenantId, pipeline] }),
        qc.invalidateQueries({ queryKey: getListPipelineStagesQueryKey(tenantId) }),
      ]);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 w-full justify-between gap-2 text-xs sm:w-64">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MessageSquareMore className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{form.ativo ? `Acompanhamento · ${channelLabel}` : "Acompanhamento desligado"}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[min(92vw,430px)] max-h-[75vh] overflow-y-auto p-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Acompanhamento da etapa</p>
              <p className="mt-1 text-xs text-muted-foreground">{stageLabel}</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium">
              <Checkbox checked={form.ativo} onCheckedChange={(v) => setForm((c) => ({ ...c, ativo: v === true }))} />
              Ativo
            </label>
          </div>

          <label className="mt-4 block text-xs font-medium">
            Objetivo desta etapa
            <Textarea className="mt-1" rows={3} value={form.objetivo} onChange={(e) => setForm((c) => ({ ...c, objetivo: e.target.value }))} placeholder="Ex.: identificar objeções e conduzir para a decisão." />
          </label>

          <label className="mt-3 block text-xs font-medium">
            Modo de operação
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.modo} onChange={(e) => setForm((c) => ({ ...c, modo: e.target.value as Modo }))}>
              <option value="automatico">Automático</option>
              <option value="gerar_aprovar">IA gera / humano aprova</option>
              <option value="somente_sugestao">Somente sugestão</option>
            </select>
          </label>

          <div className="mt-3">
            <p className="text-xs font-medium">Canais permitidos</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CANAIS.map((channel) => (
                <label key={channel.value} className="flex items-center gap-2 rounded-md border px-2 py-2 text-xs">
                  <Checkbox checked={form.canaisPermitidos.includes(channel.value)} onCheckedChange={(v) => toggleChannel(channel.value, v === true)} />
                  {channel.label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">O motor só executa automaticamente em canais com integração realmente disponível; os demais viram alternativa ou tarefa humana.</p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="text-[11px] font-medium">Atraso inicial (min)
              <Input className="mt-1" inputMode="numeric" value={String(form.atrasoInicialMinutos)} onChange={(e) => setForm((c) => ({ ...c, atrasoInicialMinutos: Number(e.target.value.replace(/\D/g, "")) || 0 }))} />
            </label>
            <label className="text-[11px] font-medium">Intervalo mínimo
              <Input className="mt-1" inputMode="numeric" value={String(form.intervaloMinimoMinutos)} onChange={(e) => setForm((c) => ({ ...c, intervaloMinimoMinutos: Number(e.target.value.replace(/\D/g, "")) || 60 }))} />
            </label>
            <label className="text-[11px] font-medium">Máx. tentativas
              <Input className="mt-1" inputMode="numeric" value={String(form.maxTentativas)} onChange={(e) => setForm((c) => ({ ...c, maxTentativas: Number(e.target.value.replace(/\D/g, "")) || 1 }))} />
            </label>
          </div>

          <div className="mt-3 space-y-2 rounded-md border p-3">
            {[
              ["usarBeneficios", "Pode apresentar benefícios"],
              ["usarDiferenciais", "Pode apresentar diferenciais"],
              ["usarProvas", "Pode usar cases/provas"],
              ["pararAoResponder", "Parar/recalcular quando o cliente responder"],
              ["chamarHumanoEmNegociacaoSensivel", "Chamar humano em negociação sensível"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs">
                <Checkbox checked={Boolean(form[key as keyof typeof form])} onCheckedChange={(v) => setForm((c) => ({ ...c, [key]: v === true }))} />
                {label}
              </label>
            ))}
          </div>

          <label className="mt-3 block text-xs font-medium">
            Instruções adicionais
            <Textarea className="mt-1" rows={3} value={form.instrucoes} onChange={(e) => setForm((c) => ({ ...c, instrucoes: e.target.value }))} placeholder="Ex.: evitar desconto; priorizar prova técnica; não falar de prazo sem confirmação." />
          </label>

          <Button type="button" className="mt-4 w-full" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : saved ? <Check className="mr-2 h-4 w-4" /> : <Bot className="mr-2 h-4 w-4" />}
            {saved ? "Configuração salva" : "Salvar acompanhamento"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

[executed on device: vmi3624448 (5bc1259f-2bcf-417a-b2e2-7864f48f2673)]
