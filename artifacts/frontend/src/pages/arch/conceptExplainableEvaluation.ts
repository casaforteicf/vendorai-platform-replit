import type { ConceptAcceptanceResult } from "./conceptAcceptance";
import type { ConceptAutoRepairResult, ConceptRepairAction } from "./conceptAutoRepair";
import type { LayoutIssue } from "./conceptGeometry";

export type ExplainableFinding = {
  id: string;
  severity: "error" | "warning";
  title: string;
  problem: string;
  impact: string;
  proposal: string;
  exactChanges: string[];
  roomId?: string;
  actionable: boolean;
};

function impactFor(issue: LayoutIssue) {
  const id = issue.id;
  if (/private-access|suite|bath/i.test(id)) return "Compromete privacidade e a lógica de uso do setor íntimo.";
  if (/circulation|access/i.test(id)) return "Pode criar percurso confuso, acesso indireto ou circulação pouco confortável.";
  if (/functional-width|ergonomics|furniture/i.test(id)) return "Pode dificultar mobiliário, passagem e uso cotidiano do ambiente.";
  if (/natural-opening|ventilation|solar/i.test(id)) return "Pode reduzir iluminação natural, ventilação e conforto ambiental.";
  if (/privacy|acoustic/i.test(id)) return "Pode aumentar exposição visual ou ruído entre setores incompatíveis.";
  if (/constructability|buildability/i.test(id)) return "Pode aumentar complexidade construtiva, desperdício ou custo relativo.";
  return issue.severity === "error"
    ? "Impede considerar a solução arquitetonicamente consistente."
    : "Merece revisão antes da aprovação final do pré-projeto.";
}

function titleFor(issue: LayoutIssue) {
  const id = issue.id;
  if (/private-access/i.test(id)) return "Acesso do setor íntimo";
  if (/suite|bath/i.test(id)) return "Relação suíte e banheiro";
  if (/circulation|access/i.test(id)) return "Circulação e acesso";
  if (/functional-width/i.test(id)) return "Dimensão funcional";
  if (/natural-opening|ventilation|solar/i.test(id)) return "Luz e ventilação";
  if (/privacy|acoustic/i.test(id)) return "Privacidade e acústica";
  if (/constructability|buildability/i.test(id)) return "Construtibilidade e custo";
  if (/furniture|ergonomics/i.test(id)) return "Ergonomia e mobiliário";
  return issue.severity === "error" ? "Correção necessária" : "Melhoria recomendada";
}

function actionMatchesIssue(action: ConceptRepairAction, issue: LayoutIssue) {
  if (issue.roomId && action.roomIds.includes(issue.roomId)) return true;
  if (/suite|bath|private-access/i.test(issue.id) && action.type === "suite_bath") return true;
  if (/functional-width|ergonomics|furniture/i.test(issue.id) && action.type === "resize") return true;
  if (/outside|overlap|bounds/i.test(issue.id) && action.type === "clamp") return true;
  if (/circulation|access|privacy|constructability|buildability/i.test(issue.id) && action.type === "relayout") return true;
  return false;
}

export function buildExplainableFindings(
  acceptance: ConceptAcceptanceResult,
  repair: ConceptAutoRepairResult,
): ExplainableFinding[] {
  return acceptance.issues.map((issue) => {
    const matching = repair.actions.filter((action) => actionMatchesIssue(action, issue));
    const exactChanges = matching.map((action) => action.description);
    const proposal = matching.length
      ? matching.map((action) => action.description).join(" ")
      : "Revisar este ponto preservando o partido arquitetônico e as decisões já aprovadas.";

    return {
      id: issue.id,
      severity: issue.severity,
      title: titleFor(issue),
      problem: issue.message,
      impact: impactFor(issue),
      proposal,
      exactChanges,
      roomId: issue.roomId,
      actionable: repair.improved && exactChanges.length > 0,
    };
  });
}
