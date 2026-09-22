import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Building2, Radar, Target, MessageSquare, ShieldCheck } from "lucide-react";

export type ProspectorPlaybookForm = {
  version: 1;
  identity: { businessName: string; sector: string; offer: string; finalCustomer: string };
  signal: { observable: string[]; sources: string[]; indication: string };
  persona: { profiles: string[]; decisionPower: string; values: string[]; problemLanguage: string[] };
  anchor: { opening: string; permission: string; forbiddenBeforeConfirmation: string[] };
  diagnosis: Array<{
    fieldKey: string;
    label: string;
    question: string;
    type: "situacao" | "problema" | "implicacao" | "necessidade";
  }>;
  qualification: {
    terrainDefined: boolean;
    projectOrClearIntent: boolean;
    estimatedTimeline: boolean;
    declaredPain: boolean;
    acceptsNextStep: boolean;
  };
  nextStep: { offer: string; format: string; duration: string; conductedBy: string };
  objections: Array<{ objection: string; response: string }>;
  metrics: {
    signalsPerWeek?: number;
    approachesPerDay?: number;
    responseRateTarget?: number;
    diagnosticsPerWeek?: number;
    meetingsPerWeek?: number;
    opportunityConversionTarget?: number;
  };
  limits: { neverPromise: string[]; neverMention: string[]; compliance?: string };
};

export const GENERIC_PROSPECTOR_PLAYBOOK: ProspectorPlaybookForm = {
  version: 1,
  identity: {
    businessName: "",
    sector: "",
    offer: "",
    finalCustomer: "",
  },
  signal: {
    observable: [],
    sources: [],
    indication: "",
  },
  persona: {
    profiles: [],
    decisionPower: "",
    values: [],
    problemLanguage: [],
  },
  anchor: {
    opening: "Posso entender em que estágio está esse projeto ou decisão?",
    permission: "Sem compromisso, só para eu compreender o contexto.",
    forbiddenBeforeConfirmation: ["produto", "preço", "prazo", "proposta"],
  },
  diagnosis: [
    { fieldKey: "prospector_stage", label: "Estágio atual", type: "situacao", question: "Em que estágio está hoje?" },
    { fieldKey: "prospector_context", label: "Contexto definido", type: "situacao", question: "O que já está definido até aqui?" },
    { fieldKey: "prospector_timeline", label: "Prazo", type: "situacao", question: "Qual é o prazo estimado para avançar?" },
    { fieldKey: "prospector_challenge", label: "Maior desafio", type: "problema", question: "Qual é o maior desafio hoje?" },
    { fieldKey: "prospector_decision", label: "Condução/decisão", type: "situacao", question: "Quem está conduzindo essa decisão?" },
    { fieldKey: "prospector_alternatives", label: "Alternativas avaliadas", type: "necessidade", question: "Vocês já estão avaliando alguma alternativa ou parceiro?" },
  ],
  qualification: {
    terrainDefined: false,
    projectOrClearIntent: true,
    estimatedTimeline: true,
    declaredPain: true,
    acceptsNextStep: true,
  },
  nextStep: {
    offer: "Conversa técnica com um especialista",
    format: "Online ou presencial",
    duration: "20 min",
    conductedBy: "Especialista + comercial",
  },
  objections: [
    { objection: "Não tenho interesse", response: "Entendo. Só para eu não incomodar novamente: isso está pausado ou ainda não começou?" },
    { objection: "Já tenho fornecedor/parceiro", response: "Perfeito. Posso entender como está sendo conduzido, só para referência de mercado?" },
    { objection: "Estou só pesquisando", response: "Ótimo, é exatamente o momento ideal para entender o estágio. Posso fazer 2 perguntas rápidas?" },
  ],
  metrics: {},
  limits: {
    neverPromise: ["preço", "prazo", "escopo sem validação humana"],
    neverMention: [],
    compliance: "",
  },
};

export const CONSTRUCTION_PROSPECTOR_PLAYBOOK: ProspectorPlaybookForm = {
  version: 1,
  identity: {
    businessName: "Construtora",
    sector: "Construção civil residencial",
    offer: "Construção de casas de alto padrão",
    finalCustomer: "Famílias de alta renda",
  },
  signal: {
    observable: ["Alvará emitido", "Tapume", "Movimentação de terra"],
    sources: ["Prefeitura", "Registros públicos", "Redes sociais", "Visitas"],
    indication: "Projeto em fase de desenvolvimento",
  },
  persona: {
    profiles: ["Arquiteto", "Proprietário do terreno", "Investidor"],
    decisionPower: "Alto",
    values: ["Prazo", "Qualidade técnica", "Parceria"],
    problemLanguage: ["estou viabilizando", "falta definir construtora"],
  },
  anchor: {
    opening: "Posso entender em que estágio está o desenvolvimento do projeto deste terreno?",
    permission: "Sem compromisso, só para eu compreender o contexto.",
    forbiddenBeforeConfirmation: ["preço", "prazo de obra", "proposta", "escopo fechado"],
  },
  diagnosis: [
    { fieldKey: "project_stage", label: "Estágio do projeto", type: "situacao", question: "Em que estágio está o projeto?" },
    { fieldKey: "project_or_permit", label: "Projeto/alvará", type: "situacao", question: "Já existe projeto aprovado ou alvará?" },
    { fieldKey: "start_timeline", label: "Prazo para início", type: "situacao", question: "Qual o prazo previsto para início da obra?" },
    { fieldKey: "main_challenge", label: "Maior desafio", type: "problema", question: "Qual o maior desafio hoje?" },
    { fieldKey: "project_lead", label: "Quem conduz", type: "situacao", question: "Quem conduz o projeto?" },
    { fieldKey: "construction_firm_status", label: "Construtora avaliada", type: "necessidade", question: "Já avaliou construtora?" },
  ],
  qualification: {
    terrainDefined: true,
    projectOrClearIntent: true,
    estimatedTimeline: true,
    declaredPain: true,
    acceptsNextStep: true,
  },
  nextStep: {
    offer: "Reunião técnica com especialista",
    format: "Online ou presencial",
    duration: "20 min",
    conductedBy: "Engenheiro + comercial",
  },
  objections: [
    { objection: "Já tenho construtora", response: "Perfeito. Posso entender como está sendo conduzido, só para referência de mercado?" },
    { objection: "Estou só pesquisando", response: "Ótimo, é o momento ideal para entender o estágio. Posso fazer 2 perguntas rápidas?" },
    { objection: "Não é o momento", response: "Sem problema. Qual seria o momento ideal?" },
  ],
  metrics: {
    signalsPerWeek: 20,
    approachesPerDay: 15,
    responseRateTarget: 20,
    meetingsPerWeek: 5,
  },
  limits: {
    neverPromise: ["preço de obra", "prazo sem vistoria", "escopo sem validação humana"],
    neverMention: ["concorrentes"],
    compliance: "",
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function listToText(values: string[]) {
  return values.join("\n");
}

function textToList(value: string) {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

export function normalizeProspectorPlaybookForm(raw: unknown): ProspectorPlaybookForm {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return clone(GENERIC_PROSPECTOR_PLAYBOOK);
  const value = raw as Partial<ProspectorPlaybookForm>;
  return {
    ...clone(GENERIC_PROSPECTOR_PLAYBOOK),
    ...value,
    identity: { ...GENERIC_PROSPECTOR_PLAYBOOK.identity, ...(value.identity ?? {}) },
    signal: { ...GENERIC_PROSPECTOR_PLAYBOOK.signal, ...(value.signal ?? {}) },
    persona: { ...GENERIC_PROSPECTOR_PLAYBOOK.persona, ...(value.persona ?? {}) },
    anchor: { ...GENERIC_PROSPECTOR_PLAYBOOK.anchor, ...(value.anchor ?? {}) },
    diagnosis: Array.isArray(value.diagnosis) && value.diagnosis.length > 0
      ? value.diagnosis
      : clone(GENERIC_PROSPECTOR_PLAYBOOK.diagnosis),
    qualification: { ...GENERIC_PROSPECTOR_PLAYBOOK.qualification, ...(value.qualification ?? {}) },
    nextStep: { ...GENERIC_PROSPECTOR_PLAYBOOK.nextStep, ...(value.nextStep ?? {}) },
    objections: Array.isArray(value.objections) && value.objections.length > 0
      ? value.objections
      : clone(GENERIC_PROSPECTOR_PLAYBOOK.objections),
    metrics: { ...GENERIC_PROSPECTOR_PLAYBOOK.metrics, ...(value.metrics ?? {}) },
    limits: { ...GENERIC_PROSPECTOR_PLAYBOOK.limits, ...(value.limits ?? {}) },
  };
}

type Props = {
  value: ProspectorPlaybookForm;
  onChange: (value: ProspectorPlaybookForm) => void;
};

export default function ProspectorPlaybookEditor({ value, onChange }: Props) {
  function patch<K extends keyof ProspectorPlaybookForm>(key: K, next: ProspectorPlaybookForm[K]) {
    onChange({ ...value, [key]: next });
  }

  function updateDiagnosis(index: number, question: string) {
    patch("diagnosis", value.diagnosis.map((item, i) => i === index ? { ...item, question } : item));
  }

  function updateObjection(index: number, field: "objection" | "response", text: string) {
    patch("objections", value.objections.map((item, i) => i === index ? { ...item, [field]: text } : item));
  }

  const qualificationLabels: Array<[keyof ProspectorPlaybookForm["qualification"], string]> = [
    ["terrainDefined", "Terreno/contexto definido"],
    ["projectOrClearIntent", "Projeto ou intenção clara"],
    ["estimatedTimeline", "Prazo estimado"],
    ["declaredPain", "Dor/desafio declarado"],
    ["acceptsNextStep", "Aceita próximo passo"],
  ];

  return (
    <div className="space-y-3">
      <Card className="border-primary/20 bg-primary/[0.025] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Playbook operacional do Prospecctor</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pesquisa → Entende → Confirma → Só então propõe o próximo passo.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(clone(CONSTRUCTION_PROSPECTOR_PLAYBOOK))}>
            <Building2 className="mr-1.5 h-3.5 w-3.5" />
            Modelo construção residencial
          </Button>
        </div>
      </Card>

      <details open className="rounded-lg border bg-background p-4">
        <summary className="cursor-pointer text-sm font-medium"><Building2 className="mr-2 inline h-4 w-4" />Identificação</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><Label>Nome do negócio</Label><Input value={value.identity.businessName} onChange={(e) => patch("identity", { ...value.identity, businessName: e.target.value })} /></div>
          <div><Label>Setor</Label><Input value={value.identity.sector} onChange={(e) => patch("identity", { ...value.identity, sector: e.target.value })} /></div>
          <div><Label>O que vendemos</Label><Input value={value.identity.offer} onChange={(e) => patch("identity", { ...value.identity, offer: e.target.value })} /></div>
          <div><Label>Cliente final</Label><Input value={value.identity.finalCustomer} onChange={(e) => patch("identity", { ...value.identity, finalCustomer: e.target.value })} /></div>
        </div>
      </details>

      <details open className="rounded-lg border bg-background p-4">
        <summary className="cursor-pointer text-sm font-medium"><Radar className="mr-2 inline h-4 w-4" />Sinais observáveis e persona</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Sinais observáveis — um por linha</Label>
            <Textarea rows={4} value={listToText(value.signal.observable)} onChange={(e) => patch("signal", { ...value.signal, observable: textToList(e.target.value) })} />
          </div>
          <div>
            <Label>Fontes — uma por linha</Label>
            <Textarea rows={4} value={listToText(value.signal.sources)} onChange={(e) => patch("signal", { ...value.signal, sources: textToList(e.target.value) })} />
          </div>
          <div className="sm:col-span-2">
            <Label>O que o sinal indica</Label>
            <Input value={value.signal.indication} onChange={(e) => patch("signal", { ...value.signal, indication: e.target.value })} />
          </div>
          <div>
            <Label>Perfis/personas</Label>
            <Textarea rows={3} value={listToText(value.persona.profiles)} onChange={(e) => patch("persona", { ...value.persona, profiles: textToList(e.target.value) })} />
          </div>
          <div>
            <Label>O que valorizam</Label>
            <Textarea rows={3} value={listToText(value.persona.values)} onChange={(e) => patch("persona", { ...value.persona, values: textToList(e.target.value) })} />
          </div>
          <div>
            <Label>Poder de decisão esperado</Label>
            <Input value={value.persona.decisionPower} onChange={(e) => patch("persona", { ...value.persona, decisionPower: e.target.value })} />
          </div>
          <div>
            <Label>Como falam sobre o problema</Label>
            <Textarea rows={2} value={listToText(value.persona.problemLanguage)} onChange={(e) => patch("persona", { ...value.persona, problemLanguage: textToList(e.target.value) })} />
          </div>
        </div>
      </details>

      <details open className="rounded-lg border bg-background p-4">
        <summary className="cursor-pointer text-sm font-medium"><MessageSquare className="mr-2 inline h-4 w-4" />Abertura e diagnóstico</summary>
        <div className="mt-4 space-y-3">
          <div><Label>Pergunta-âncora</Label><Textarea rows={2} value={value.anchor.opening} onChange={(e) => patch("anchor", { ...value.anchor, opening: e.target.value })} /></div>
          <div><Label>Permissão solicitada</Label><Input value={value.anchor.permission} onChange={(e) => patch("anchor", { ...value.anchor, permission: e.target.value })} /></div>
          <div><Label>Não mencionar antes da confirmação</Label><Input value={value.anchor.forbiddenBeforeConfirmation.join(", ")} onChange={(e) => patch("anchor", { ...value.anchor, forbiddenBeforeConfirmation: textToList(e.target.value) })} /></div>
          <div className="space-y-2 pt-1">
            <Label>Perguntas obrigatórias</Label>
            {value.diagnosis.map((item, index) => (
              <div key={item.fieldKey} className="grid grid-cols-[28px_1fr] items-center gap-2">
                <span className="text-center text-xs font-medium text-muted-foreground">{index + 1}</span>
                <Input value={item.question} onChange={(e) => updateDiagnosis(index, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      </details>

      <details open className="rounded-lg border bg-background p-4">
        <summary className="cursor-pointer text-sm font-medium"><Target className="mr-2 inline h-4 w-4" />SQL e próximo passo</summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {qualificationLabels.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <Checkbox
                  checked={value.qualification[key]}
                  onCheckedChange={(checked) => patch("qualification", { ...value.qualification, [key]: checked === true })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>O que oferecemos após diagnóstico</Label><Input value={value.nextStep.offer} onChange={(e) => patch("nextStep", { ...value.nextStep, offer: e.target.value })} /></div>
            <div><Label>Formato</Label><Input value={value.nextStep.format} onChange={(e) => patch("nextStep", { ...value.nextStep, format: e.target.value })} /></div>
            <div><Label>Duração</Label><Input value={value.nextStep.duration} onChange={(e) => patch("nextStep", { ...value.nextStep, duration: e.target.value })} /></div>
            <div><Label>Quem conduz</Label><Input value={value.nextStep.conductedBy} onChange={(e) => patch("nextStep", { ...value.nextStep, conductedBy: e.target.value })} /></div>
          </div>
        </div>
      </details>

      <details className="rounded-lg border bg-background p-4">
        <summary className="cursor-pointer text-sm font-medium"><ShieldCheck className="mr-2 inline h-4 w-4" />Objeções, metas e limites</summary>
        <div className="mt-4 space-y-4">
          <div className="space-y-3">
            <Label>Matriz de objeções</Label>
            {value.objections.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Objeção" value={item.objection} onChange={(e) => updateObjection(index, "objection", e.target.value)} />
                <Input placeholder="Resposta consultiva" value={item.response} onChange={(e) => updateObjection(index, "response", e.target.value)} />
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => patch("objections", [...value.objections, { objection: "", response: "" }])}>
              Adicionar objeção
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>Sinais/semana</Label><Input type="number" value={value.metrics.signalsPerWeek ?? ""} onChange={(e) => patch("metrics", { ...value.metrics, signalsPerWeek: Number(e.target.value) || undefined })} /></div>
            <div><Label>Abordagens/dia</Label><Input type="number" value={value.metrics.approachesPerDay ?? ""} onChange={(e) => patch("metrics", { ...value.metrics, approachesPerDay: Number(e.target.value) || undefined })} /></div>
            <div><Label>Taxa resposta %</Label><Input type="number" value={value.metrics.responseRateTarget ?? ""} onChange={(e) => patch("metrics", { ...value.metrics, responseRateTarget: Number(e.target.value) || undefined })} /></div>
            <div><Label>Diagnósticos/semana</Label><Input type="number" value={value.metrics.diagnosticsPerWeek ?? ""} onChange={(e) => patch("metrics", { ...value.metrics, diagnosticsPerWeek: Number(e.target.value) || undefined })} /></div>
            <div><Label>Reuniões/semana</Label><Input type="number" value={value.metrics.meetingsPerWeek ?? ""} onChange={(e) => patch("metrics", { ...value.metrics, meetingsPerWeek: Number(e.target.value) || undefined })} /></div>
            <div><Label>Conversão %</Label><Input type="number" value={value.metrics.opportunityConversionTarget ?? ""} onChange={(e) => patch("metrics", { ...value.metrics, opportunityConversionTarget: Number(e.target.value) || undefined })} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Nunca prometer — um por linha</Label><Textarea rows={3} value={listToText(value.limits.neverPromise)} onChange={(e) => patch("limits", { ...value.limits, neverPromise: textToList(e.target.value) })} /></div>
            <div><Label>Nunca mencionar — um por linha</Label><Textarea rows={3} value={listToText(value.limits.neverMention)} onChange={(e) => patch("limits", { ...value.limits, neverMention: textToList(e.target.value) })} /></div>
            <div className="sm:col-span-2"><Label>Compliance/regulação</Label><Input value={value.limits.compliance ?? ""} onChange={(e) => patch("limits", { ...value.limits, compliance: e.target.value })} /></div>
          </div>
        </div>
      </details>
    </div>
  );
}
