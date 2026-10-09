export type JarvisRoute =
  | "approval"
  | "execution"
  | "mission"
  | "action_plan"
  | "email"
  | "chat";

export type JarvisResolution = {
  route: JarvisRoute;
  requiresApproval: boolean;
  explicitAction: boolean;
  reason: string;
};

const APPROVAL_RE = /\b(aprovar|aprova|autorizar|autorize)\b/i;
const EXECUTION_RE = /\b(execute|executar|faça|faca|crie|criar|envie|enviar|mova|mover|altere|alterar|exclua|excluir)\b/i;
const MISSION_RE = /\b(missão|missao|missões|missoes)\b/i;
const PLAN_RE = /\b(plano de ação|plano de acao|action plan|próximas ações|proximas acoes)\b/i;
const EMAIL_RE = /\b(e-mail|email|correio)\b/i;

export function resolveJarvisRoute(text: string): JarvisResolution {
  const value = String(text ?? "").trim();

  if (APPROVAL_RE.test(value)) {
    return { route: "approval", requiresApproval: false, explicitAction: true, reason: "Pedido explícito de aprovação." };
  }
  if (MISSION_RE.test(value) && EXECUTION_RE.test(value)) {
    return { route: "mission", requiresApproval: true, explicitAction: true, reason: "Missão com verbo operacional explícito." };
  }
  if (PLAN_RE.test(value)) {
    return { route: "action_plan", requiresApproval: true, explicitAction: EXECUTION_RE.test(value), reason: "Pedido de plano de ação." };
  }
  if (EMAIL_RE.test(value) && EXECUTION_RE.test(value)) {
    return { route: "email", requiresApproval: true, explicitAction: true, reason: "Ação explícita sobre e-mail." };
  }
  if (EXECUTION_RE.test(value)) {
    return { route: "execution", requiresApproval: true, explicitAction: true, reason: "Verbo operacional explícito." };
  }
  return { route: "chat", requiresApproval: false, explicitAction: false, reason: "Sem verbo operacional explícito." };
}
