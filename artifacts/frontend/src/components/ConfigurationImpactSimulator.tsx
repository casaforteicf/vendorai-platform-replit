import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, GitBranch, Network, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CONFIGURATION_LEVEL_CLASSES,
  CONFIGURATION_LEVEL_LABELS,
  CONFIGURATION_SECTION_POLICIES,
} from "@/components/ConfigurationGovernancePanel";

export type ConfigurationChangeKind = "editar" | "credencial" | "desconectar" | "permissao" | "financeiro";
export const CONFIGURATION_IMPACT_EVENT = "vendorai:configuration-impact";
export const CONFIGURATION_IMPACT_APPROVED_EVENT = "vendorai:configuration-impact-approved";

type ChangeScenario = {
  value: ConfigurationChangeKind;
  label: string;
  modifier: number;
  consequence: string;
  checks: string[];
};

type ImpactEventDetail = {
  section?: string;
  changeKind?: ConfigurationChangeKind;
  actionLabel?: string;
  requestId?: string;
};

const CHANGE_SCENARIOS: ChangeScenario[] = [
  {
    value: "editar",
    label: "Editar configuração",
    modifier: 0,
    consequence: "Pode alterar o comportamento dos módulos que consomem esta configuração.",
    checks: ["Validar valor atual e novo", "Revisar dependências antes de salvar", "Confirmar resultado após a mudança"],
  },
  {
    value: "credencial",
    label: "Trocar credencial/chave",
    modifier: 2,
    consequence: "Pode interromper autenticação, sincronizações ou chamadas externas até a nova credencial ser validada.",
    checks: ["Validar a nova credencial antes da troca", "Confirmar escopos/permissões", "Testar a integração imediatamente após salvar"],
  },
  {
    value: "desconectar",
    label: "Desconectar integração",
    modifier: 3,
    consequence: "Pode interromper automações, envio/recebimento de dados e fluxos dependentes imediatamente.",
    checks: ["Identificar automações dependentes", "Definir plano de reconexão", "Confirmar janela segura para interrupção"],
  },
  {
    value: "permissao",
    label: "Alterar acesso/permissão",
    modifier: 3,
    consequence: "Pode conceder ou remover acesso a dados, ações críticas e áreas administrativas.",
    checks: ["Validar usuário/função afetada", "Aplicar menor privilégio necessário", "Revisar trilha de auditoria após a mudança"],
  },
  {
    value: "financeiro",
    label: "Alterar regra financeira",
    modifier: 2,
    consequence: "Pode alterar cobrança, comissão, desconto, margem, crédito ou disponibilidade de recursos.",
    checks: ["Conferir impacto financeiro estimado", "Validar contratos/regras relacionadas", "Confirmar vigência da alteração"],
  },
];

const BASE_SCORE = {
  operacional: 1,
  administrativo: 3,
  critico: 5,
} as const;

function riskLabel(score: number) {
  if (score >= 7) return { label: "Muito alto", className: "border-destructive/40 bg-destructive/10 text-destructive" };
  if (score >= 5) return { label: "Alto", className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" };
  if (score >= 3) return { label: "Moderado", className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" };
  return { label: "Baixo", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
}

export function ConfigurationImpactSimulator() {
  const containerRef = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [section, setSection] = useState(CONFIGURATION_SECTION_POLICIES[0]?.section ?? "Empresa");
  const [changeKind, setChangeKind] = useState<ConfigurationChangeKind>("editar");
  const [detectedAction, setDetectedAction] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    const onImpactRequest = (event: Event) => {
      const detail = (event as CustomEvent<ImpactEventDetail>).detail ?? {};
      if (detail.section && CONFIGURATION_SECTION_POLICIES.some((item) => item.section === detail.section)) {
        setSection(detail.section);
      }
      if (detail.changeKind && CHANGE_SCENARIOS.some((item) => item.value === detail.changeKind)) {
        setChangeKind(detail.changeKind);
      }
      setDetectedAction(detail.actionLabel?.trim() || "Alteração crítica");
      setRequestId(detail.requestId ?? null);
      setCheckedItems(new Set());
      setExpanded(true);
      window.requestAnimationFrame(() => {
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

    window.addEventListener(CONFIGURATION_IMPACT_EVENT, onImpactRequest as EventListener);
    return () => window.removeEventListener(CONFIGURATION_IMPACT_EVENT, onImpactRequest as EventListener);
  }, []);

  const policy = useMemo(
    () => CONFIGURATION_SECTION_POLICIES.find((item) => item.section === section) ?? CONFIGURATION_SECTION_POLICIES[0],
    [section],
  );
  const scenario = useMemo(
    () => CHANGE_SCENARIOS.find((item) => item.value === changeKind) ?? CHANGE_SCENARIOS[0],
    [changeKind],
  );

  if (!policy || !scenario) return null;

  const score = Math.min(8, BASE_SCORE[policy.level] + scenario.modifier);
  const risk = riskLabel(score);
  const needsStrongConfirmation = score >= 5;
  const checklist = [...scenario.checks, `Revisar os módulos dependentes: ${policy.dependencies.join(", ")}.`];
  const checklistRequired = Boolean(requestId && needsStrongConfirmation);
  const checklistComplete = !checklistRequired || checkedItems.size === checklist.length;

  const toggleCheck = (index: number) => {
    setCheckedItems((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const approveImpact = () => {
    if (!requestId || !checklistComplete) return;
    window.dispatchEvent(new CustomEvent(CONFIGURATION_IMPACT_APPROVED_EVENT, { detail: { requestId } }));
    setDetectedAction((current) => current ? `${current} — impacto revisado` : current);
  };

  return (
    <section ref={containerRef} className="mb-4 scroll-mt-4 rounded-xl border bg-background p-3 sm:p-4" aria-label="Simulador de impacto de configurações">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">Simulador de impacto</strong>
              <Badge variant="secondary" className="text-[10px]">Pré-mudança</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Antecipe dependências, risco e validações recomendadas antes de uma alteração sensível.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Fechar simulador" : "Simular alteração"}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t pt-4">
          {detectedAction && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
              <strong>Revisão automática antes de executar:</strong> {detectedAction}. {checklistRequired ? "Marque todas as validações obrigatórias para liberar a próxima tentativa." : "Confira o impacto abaixo e repita a ação original para continuar."}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium">
              Área afetada
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm font-normal"
                value={section}
                onChange={(event) => {
                  setSection(event.target.value);
                  setDetectedAction(null);
                  setRequestId(null);
                  setCheckedItems(new Set());
                }}
              >
                {CONFIGURATION_SECTION_POLICIES.map((item) => (
                  <option key={item.section} value={item.section}>{item.section}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium">
              Tipo de alteração
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm font-normal"
                value={changeKind}
                onChange={(event) => {
                  setChangeKind(event.target.value as ConfigurationChangeKind);
                  setDetectedAction(null);
                  setRequestId(null);
                  setCheckedItems(new Set());
                }}
              >
                {CHANGE_SCENARIOS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Classificação da área</span>
                <Badge variant="outline" className={`text-[10px] ${CONFIGURATION_LEVEL_CLASSES[policy.level]}`}>
                  {CONFIGURATION_LEVEL_LABELS[policy.level]}
                </Badge>
              </div>
              <p className="mt-2 text-sm font-semibold">{policy.section}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{policy.impact}</p>
            </article>

            <article className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Risco estimado</span>
                <Badge variant="outline" className={`text-[10px] ${risk.className}`}>{risk.label}</Badge>
              </div>
              <p className="mt-2 text-2xl font-semibold">{score}/8</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{scenario.consequence}</p>
            </article>

            <article className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Network className="h-3.5 w-3.5" /> Dependências diretas
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {policy.dependencies.map((dependency) => (
                  <Badge key={dependency} variant="secondary" className="text-[10px]">{dependency}</Badge>
                ))}
              </div>
            </article>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <article className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> Checklist antes de aplicar
                </div>
                {checklistRequired && <Badge variant="outline" className="text-[10px]">{checkedItems.size}/{checklist.length}</Badge>}
              </div>
              <div className="mt-3 space-y-2">
                {checklist.map((check, index) => checklistRequired ? (
                  <label key={check} className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={checkedItems.has(index)}
                      onChange={() => toggleCheck(index)}
                    />
                    <span>{check}</span>
                  </label>
                ) : (
                  <div key={check} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                    <span>{check}</span>
                  </div>
                ))}
              </div>
              {requestId && (
                <Button type="button" size="sm" className="mt-3" disabled={!checklistComplete} onClick={approveImpact}>
                  {checklistComplete ? "Impacto revisado — liberar ação" : "Concluir validações obrigatórias"}
                </Button>
              )}
            </article>

            <article className={`rounded-lg border p-3 ${needsStrongConfirmation ? "border-destructive/30 bg-destructive/5" : "bg-muted/20"}`}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {needsStrongConfirmation ? <ShieldAlert className="h-4 w-4 text-destructive" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                Recomendação
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {needsStrongConfirmation
                  ? "Trate esta mudança como crítica: confirme impacto, registre responsável e execute em uma janela controlada. Não conte com rollback automático para credenciais, integrações, contratos ou acessos."
                  : "A alteração pode ser executada com validação normal, mantendo a trilha de auditoria e conferindo os módulos dependentes após salvar."}
              </p>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
