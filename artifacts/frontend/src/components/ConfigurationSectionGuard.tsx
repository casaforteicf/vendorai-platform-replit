import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  CONFIGURATION_IMPACT_APPROVED_EVENT,
  CONFIGURATION_IMPACT_EVENT,
  type ConfigurationChangeKind,
} from "@/components/ConfigurationImpactSimulator";
import { CONFIGURATION_POST_CHANGE_EVENT } from "@/components/ConfigurationPostChangeValidation";

const CRITICAL_SECTIONS = new Set(["Integrações", "Documentos", "Equipe e Acessos", "Faturamento"]);
const WRITE_ACTION_PATTERN = /(salvar|conectar|reconectar|desconectar|excluir|remover|revogar|atualizar|alterar|confirmar|ativar|desativar|renovar|assinar|cobrar|publicar)/i;
const GOOGLE_CALENDAR_ACTION_PATTERN = /google\s*(calendar|agenda)|calendar\s*google|agenda\s*google/i;
const IMPACT_APPROVAL_TTL_MS = 2 * 60 * 1000;

const SECTION_IMPACT: Record<string, string> = {
  Integrações: "Esta ação pode interromper canais, autenticações, mídia paga, rastreamento ou sincronizações externas.",
  Documentos: "Esta ação pode alterar contratos, propostas, modelos, variáveis ou o fluxo de assinatura.",
  "Equipe e Acessos": "Esta ação pode modificar quem acessa dados, módulos e ações administrativas do tenant.",
  Faturamento: "Esta ação pode alterar cobrança, plano, créditos, consumo ou continuidade do serviço.",
};

type ReviewState = {
  key: string;
  requestId: string;
};

function isAdmin(user: any) {
  return user?.platformRole === "super_admin" || user?.platformRole === "tenant_admin" || user?.userFunction === "administrador";
}

function canEditSettings(user: any) {
  if (isAdmin(user)) return true;
  return Array.isArray(user?.permissions) && user.permissions.includes("settings");
}

function activeSection(root: HTMLElement): string | null {
  const activeTab = root.querySelector<HTMLElement>("[role='tab'][aria-selected='true']");
  return activeTab?.getAttribute("aria-label") || activeTab?.textContent?.replace(/\s+/g, " ").trim() || null;
}

function activePanel(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>("[role='tabpanel']:not([hidden])");
}

function restoreDisabledControls(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-config-governance-disabled='true']").forEach((control) => {
    if (control.dataset.configGovernanceWasDisabled !== "true" && "disabled" in control) {
      (control as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled = false;
    }
    delete control.dataset.configGovernanceDisabled;
    delete control.dataset.configGovernanceWasDisabled;
  });
  root.querySelectorAll<HTMLElement>("[data-config-section-lock='true']").forEach((node) => node.remove());
}

function lockPanel(panel: HTMLElement, section: string, reason: string) {
  const notice = document.createElement("div");
  notice.dataset.configSectionLock = "true";
  notice.className = "mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200";
  notice.innerHTML = `<strong>Alteração bloqueada nesta seção.</strong><div class="mt-1">${reason}</div>`;
  panel.prepend(notice);

  panel.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("button, input, select, textarea").forEach((control) => {
    if (control.closest("[data-config-section-lock='true']")) return;
    control.dataset.configGovernanceWasDisabled = control.disabled ? "true" : "false";
    control.dataset.configGovernanceDisabled = "true";
    control.disabled = true;
  });
  panel.querySelectorAll<HTMLElement>("[contenteditable='true']").forEach((control) => {
    control.dataset.configGovernanceDisabled = "true";
    control.setAttribute("contenteditable", "false");
  });
}

function actionLabel(button: HTMLButtonElement) {
  return [button.textContent, button.getAttribute("aria-label"), button.title].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function inferChangeKind(section: string, label: string): ConfigurationChangeKind {
  const normalized = label.toLowerCase();
  if (section === "Equipe e Acessos" || /(permiss|acesso|usu[aá]rio|fun[cç][aã]o|revogar)/i.test(normalized)) return "permissao";
  if (section === "Faturamento" || /(cobr|fatur|plano|cr[eé]dito|comiss|desconto|margem|finance)/i.test(normalized)) return "financeiro";
  if (/(desconectar|excluir|remover|revogar|desativar)/i.test(normalized)) return "desconectar";
  if (/(conectar|reconectar|credencial|token|chave|api|renovar|oauth)/i.test(normalized)) return "credencial";
  return "editar";
}

function impactReviewKey(section: string, changeKind: ConfigurationChangeKind, label: string) {
  return `${section}::${changeKind}::${label || "alterar configuração"}`;
}

function createRequestId() {
  return `cfg-impact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function openImpactReview(section: string, changeKind: ConfigurationChangeKind, label: string, requestId: string) {
  window.dispatchEvent(new CustomEvent(CONFIGURATION_IMPACT_EVENT, {
    detail: { section, changeKind, actionLabel: label || "Alterar configuração", requestId },
  }));
}

function notifyPostChange(section: string, changeKind: ConfigurationChangeKind, label: string) {
  window.dispatchEvent(new CustomEvent(CONFIGURATION_POST_CHANGE_EVENT, {
    detail: { section, changeKind, actionLabel: label || "Alterar configuração" },
  }));
}

export function ConfigurationSectionGuard() {
  const { user } = useAuth();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".vendor-config-without-site");
    if (!root) return;

    let scheduled = false;
    let lastSection: string | null = null;
    const admin = isAdmin(user);
    const settingsAllowed = canEditSettings(user);
    const allowedButtons = new WeakSet<HTMLButtonElement>();
    const allowedForms = new WeakSet<HTMLFormElement>();
    const reviewedButtons = new WeakMap<HTMLButtonElement, ReviewState>();
    const reviewedForms = new WeakMap<HTMLFormElement, ReviewState>();
    const approvedRequests = new Map<string, number>();

    const invalidateApprovals = () => approvedRequests.clear();

    const hasApprovedRequest = (requestId: string) => {
      const expiresAt = approvedRequests.get(requestId);
      if (!expiresAt) return false;
      if (expiresAt <= Date.now()) {
        approvedRequests.delete(requestId);
        return false;
      }
      return true;
    };

    const onImpactApproved = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId?: string }>).detail;
      if (detail?.requestId) approvedRequests.set(detail.requestId, Date.now() + IMPACT_APPROVAL_TTL_MS);
    };

    const applyPolicy = () => {
      scheduled = false;
      restoreDisabledControls(root);
      const section = activeSection(root);
      const panel = activePanel(root);
      if (!section || !panel) return;

      if (lastSection && lastSection !== section) invalidateApprovals();
      lastSection = section;

      if (!settingsAllowed) {
        lockPanel(panel, section, "Seu usuário não possui a permissão Configurações. Solicite a um administrador para realizar alterações.");
        return;
      }

      if (CRITICAL_SECTIONS.has(section) && !admin) {
        lockPanel(panel, section, "Esta área é crítica e exige perfil Administrador ou Super Admin. A visualização continua disponível pelo painel de governança.");
      }
    };

    const schedulePolicy = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(applyPolicy);
    };

    const onConfigurationEdited = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || !root.contains(target)) return;
      const panel = activePanel(root);
      if (!panel || !panel.contains(target)) return;
      invalidateApprovals();
    };

    const onClickCapture = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!(button instanceof HTMLButtonElement) || !root.contains(button)) return;
      const panel = activePanel(root);
      if (!panel || !panel.contains(button)) return;

      const section = activeSection(root);
      if (!section) return;

      const locked = !settingsAllowed || (CRITICAL_SECTIONS.has(section) && !admin);
      if (locked) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const label = actionLabel(button);
      if (section === "Calendário" && WRITE_ACTION_PATTERN.test(label) && GOOGLE_CALENDAR_ACTION_PATTERN.test(label)) {
        notifyPostChange(section, inferChangeKind(section, label), label);
        return;
      }

      if (!admin || !CRITICAL_SECTIONS.has(section)) return;
      if (!WRITE_ACTION_PATTERN.test(label)) return;
      if (allowedButtons.has(button)) {
        allowedButtons.delete(button);
        return;
      }

      const changeKind = inferChangeKind(section, label);
      const reviewKey = impactReviewKey(section, changeKind, label);
      let reviewState = reviewedButtons.get(button);
      if (!reviewState || reviewState.key !== reviewKey) {
        reviewState = { key: reviewKey, requestId: createRequestId() };
        reviewedButtons.set(button, reviewState);
      }
      if (!hasApprovedRequest(reviewState.requestId)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openImpactReview(section, changeKind, label, reviewState.requestId);
        return;
      }
      approvedRequests.delete(reviewState.requestId);
      reviewedButtons.delete(button);

      event.preventDefault();
      event.stopImmediatePropagation();
      const impact = SECTION_IMPACT[section] || "Esta ação altera uma configuração crítica do tenant.";
      const confirmed = window.confirm(`Confirmar alteração crítica em ${section}?\n\nAção: ${label || "alterar configuração"}\n\n${impact}\n\nO checklist de impacto foi concluído e a mudança ficará registrada no Histórico de Configurações.`);
      if (!confirmed) return;

      allowedButtons.add(button);
      const form = button.closest("form");
      if (form) allowedForms.add(form);
      notifyPostChange(section, changeKind, label);
      window.setTimeout(() => button.click(), 0);
    };

    const onSubmitCapture = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !root.contains(form)) return;
      const panel = activePanel(root);
      if (!panel || !panel.contains(form)) return;
      const section = activeSection(root);
      if (!section) return;

      const locked = !settingsAllowed || (CRITICAL_SECTIONS.has(section) && !admin);
      if (locked) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const submitter = event instanceof SubmitEvent && event.submitter instanceof HTMLButtonElement ? event.submitter : null;
      const label = submitter ? actionLabel(submitter) : "Salvar alterações";
      if (section === "Calendário" && WRITE_ACTION_PATTERN.test(label) && GOOGLE_CALENDAR_ACTION_PATTERN.test(label)) {
        notifyPostChange(section, inferChangeKind(section, label), label);
        return;
      }

      if (!admin || !CRITICAL_SECTIONS.has(section)) return;
      if (allowedForms.has(form)) {
        allowedForms.delete(form);
        return;
      }

      const changeKind = inferChangeKind(section, label);
      const reviewKey = impactReviewKey(section, changeKind, label);
      let reviewState = reviewedForms.get(form);
      if (!reviewState || reviewState.key !== reviewKey) {
        reviewState = { key: reviewKey, requestId: createRequestId() };
        reviewedForms.set(form, reviewState);
      }
      if (!hasApprovedRequest(reviewState.requestId)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openImpactReview(section, changeKind, label, reviewState.requestId);
        return;
      }
      approvedRequests.delete(reviewState.requestId);
      reviewedForms.delete(form);

      event.preventDefault();
      event.stopImmediatePropagation();
      const impact = SECTION_IMPACT[section] || "Esta ação altera uma configuração crítica do tenant.";
      if (!window.confirm(`Confirmar alteração crítica em ${section}?\n\nAção: ${label}\n\n${impact}\n\nO checklist de impacto foi concluído e a mudança ficará registrada no Histórico de Configurações.`)) return;
      allowedForms.add(form);
      notifyPostChange(section, changeKind, label);
      window.setTimeout(() => form.requestSubmit(), 0);
    };

    const observer = new MutationObserver(schedulePolicy);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected", "hidden"] });
    root.addEventListener("click", onClickCapture, true);
    root.addEventListener("submit", onSubmitCapture, true);
    root.addEventListener("input", onConfigurationEdited, true);
    root.addEventListener("change", onConfigurationEdited, true);
    window.addEventListener(CONFIGURATION_IMPACT_APPROVED_EVENT, onImpactApproved as EventListener);
    schedulePolicy();

    return () => {
      observer.disconnect();
      root.removeEventListener("click", onClickCapture, true);
      root.removeEventListener("submit", onSubmitCapture, true);
      root.removeEventListener("input", onConfigurationEdited, true);
      root.removeEventListener("change", onConfigurationEdited, true);
      window.removeEventListener(CONFIGURATION_IMPACT_APPROVED_EVENT, onImpactApproved as EventListener);
      invalidateApprovals();
      restoreDisabledControls(root);
    };
  }, [user]);

  return null;
}
