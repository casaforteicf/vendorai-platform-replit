import type { PropostaApresentacao, PropostaItem } from "@workspace/db";

export type BudgetIntegritySeverity = "blocker" | "warning";

export type BudgetIntegrityIssue = {
  code: string;
  severity: BudgetIntegritySeverity;
  message: string;
  field?: string;
  stageId?: string;
  itemIndex?: number;
  details?: Record<string, unknown>;
};

export type BudgetIntegrityReport = {
  ok: boolean;
  blockers: number;
  warnings: number;
  calculatedTotal: number;
  storedTotal: number;
  stageCount: number;
  earliestScheduleStart: string | null;
  latestScheduleEnd: string | null;
  effectiveScheduleDays: number | null;
  configuredPhysicalTotal: number | null;
  financialWeights: Array<{
    stageId: string;
    stageName: string;
    stageOrder: number;
    value: number;
    financialPercent: number;
  }>;
  issues: BudgetIntegrityIssue[];
};

type AuditInput = {
  itens?: PropostaItem[] | null;
  valorTotal?: string | number | null;
  validadeAte?: Date | string | null;
  prazoEntrega?: string | null;
  apresentacao?: PropostaApresentacao | null;
  now?: Date;
};

const roundMoney = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDeadlineDays(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = String(value).match(/(\d{1,5})/);
  if (!match) return null;
  const days = Number(match[1]);
  return Number.isFinite(days) && days > 0 ? days : null;
}

export function calculateBudgetItemsTotal(items: PropostaItem[] | null | undefined): number {
  return roundMoney((items ?? []).reduce((sum, item) => {
    const quantity = Number(item.quantidade ?? 0);
    const unit = Number(item.valorUnitario ?? 0);
    if (!Number.isFinite(quantity) || !Number.isFinite(unit)) return sum;
    return sum + quantity * unit;
  }, 0));
}

export function auditProposalBudget(input: AuditInput): BudgetIntegrityReport {
  const issues: BudgetIntegrityIssue[] = [];
  const items = Array.isArray(input.itens) ? input.itens : [];
  const presentation = input.apresentacao ?? ({} as PropostaApresentacao);
  const now = input.now ?? new Date();
  const calculatedTotal = calculateBudgetItemsTotal(items);
  const storedTotal = roundMoney(Number(input.valorTotal ?? 0) || 0);

  if (!items.length) {
    issues.push({
      code: "NO_ITEMS",
      severity: "blocker",
      field: "itens",
      message: "O orçamento não possui itens.",
    });
  }

  items.forEach((item, index) => {
    const quantity = Number(item.quantidade ?? 0);
    const unit = Number(item.valorUnitario ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      issues.push({
        code: "INVALID_QUANTITY",
        severity: "blocker",
        field: "itens",
        itemIndex: index,
        message: `Item "${item.nome || index + 1}" possui quantidade inválida.`,
      });
    }
    if (!Number.isFinite(unit) || unit < 0) {
      issues.push({
        code: "INVALID_UNIT_PRICE",
        severity: "blocker",
        field: "itens",
        itemIndex: index,
        message: `Item "${item.nome || index + 1}" possui valor unitário inválido.`,
      });
    }
  });

  if (items.length && Math.abs(calculatedTotal - storedTotal) > 0.01) {
    issues.push({
      code: "TOTAL_MISMATCH",
      severity: "blocker",
      field: "valorTotal",
      message: `O total salvo (${storedTotal.toFixed(2)}) não confere com a soma dos itens (${calculatedTotal.toFixed(2)}).`,
      details: { storedTotal, calculatedTotal },
    });
  }

  const stageMap = new Map<string, {
    id: string;
    name: string;
    order: number;
    value: number;
    itemIndexes: number[];
  }>();
  const orderToIds = new Map<number, Set<string>>();

  items.forEach((item, index) => {
    const id = String(item.etapaId ?? "").trim();
    if (!id) return;
    const name = String(item.etapaNome ?? "").trim();
    const order = Number(item.etapaOrdem ?? 0);
    const value = roundMoney(Number(item.quantidade ?? 0) * Number(item.valorUnitario ?? 0));
    const existing = stageMap.get(id);

    if (!name || !Number.isInteger(order) || order <= 0) {
      issues.push({
        code: "INCOMPLETE_STAGE_REFERENCE",
        severity: "warning",
        field: "itens",
        stageId: id,
        itemIndex: index,
        message: `O item "${item.nome}" não possui nome/ordem de etapa completos.`,
      });
    }

    if (!existing) {
      stageMap.set(id, {
        id,
        name: name || "Etapa sem nome",
        order: Number.isInteger(order) && order > 0 ? order : 9999,
        value,
        itemIndexes: [index],
      });
    } else {
      existing.value = roundMoney(existing.value + value);
      existing.itemIndexes.push(index);
      if (name && existing.name !== "Etapa sem nome" && existing.name !== name) {
        issues.push({
          code: "STAGE_NAME_CONFLICT",
          severity: "blocker",
          field: "itens",
          stageId: id,
          message: `A mesma etapa possui nomes diferentes: "${existing.name}" e "${name}".`,
        });
      }
      if (order > 0 && existing.order !== 9999 && existing.order !== order) {
        issues.push({
          code: "STAGE_ORDER_CONFLICT",
          severity: "blocker",
          field: "itens",
          stageId: id,
          message: `A etapa "${name || existing.name}" possui ordens conflitantes (${existing.order} e ${order}).`,
        });
      }
    }

    if (Number.isInteger(order) && order > 0) {
      const set = orderToIds.get(order) ?? new Set<string>();
      set.add(id);
      orderToIds.set(order, set);
    }
  });

  orderToIds.forEach((ids, order) => {
    if (ids.size > 1) {
      issues.push({
        code: "DUPLICATE_STAGE_ORDER",
        severity: "blocker",
        field: "itens",
        message: `Mais de uma etapa está usando a ordem ${order}.`,
        details: { stageIds: Array.from(ids) },
      });
    }
  });

  const stages = Array.from(stageMap.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const financialWeights = stages.map((stage) => ({
    stageId: stage.id,
    stageName: stage.name,
    stageOrder: stage.order === 9999 ? 0 : stage.order,
    value: stage.value,
    financialPercent: calculatedTotal > 0 ? (stage.value / calculatedTotal) * 100 : 0,
  }));

  const schedule = presentation.cronogramaEtapas ?? {};
  const scheduleDates: Date[] = [];
  const scheduleEndDates: Date[] = [];
  let configuredPhysicalTotal = 0;
  let configuredPhysicalCount = 0;

  Object.entries(schedule).forEach(([stageId, stage]) => {
    const start = asDate(stage?.inicioPrevisto);
    const end = asDate(stage?.fimPrevisto);
    if (start) scheduleDates.push(start);
    if (end) scheduleEndDates.push(end);
    if (start && end && end < start) {
      issues.push({
        code: "STAGE_END_BEFORE_START",
        severity: "blocker",
        field: "apresentacao.cronogramaEtapas",
        stageId,
        message: "Há etapa com término anterior ao início.",
      });
    }

    if (typeof stage?.percentualFisico === "number") {
      configuredPhysicalTotal += stage.percentualFisico;
      configuredPhysicalCount += 1;
    }

    for (const phase of stage?.fases ?? []) {
      const phaseStart = asDate(phase.inicioPrevisto);
      const phaseEnd = asDate(phase.fimPrevisto);
      if (phaseStart) scheduleDates.push(phaseStart);
      if (phaseEnd) scheduleEndDates.push(phaseEnd);
      if (phaseStart && phaseEnd && phaseEnd < phaseStart) {
        issues.push({
          code: "PHASE_END_BEFORE_START",
          severity: "blocker",
          field: "apresentacao.cronogramaEtapas",
          stageId,
          message: `A fase "${phase.nome}" termina antes de começar.`,
        });
      }
    }
  });

  const earliest = scheduleDates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const latest = scheduleEndDates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const proposalStart = asDate(presentation.previsaoInicio);
  const validity = asDate(input.validadeAte);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (validity && validity < todayStart) {
    issues.push({
      code: "EXPIRED_VALIDITY",
      severity: "blocker",
      field: "validadeAte",
      message: "A validade do orçamento já expirou.",
      details: { validadeAte: dateOnly(validity) },
    });
  }

  if (earliest && earliest < todayStart) {
    issues.push({
      code: "SCHEDULE_START_IN_PAST",
      severity: "blocker",
      field: "apresentacao.cronogramaEtapas",
      message: "O cronograma começa em uma data que já passou.",
      details: { earliestScheduleStart: dateOnly(earliest), today: dateOnly(todayStart) },
    });
  }

  if (proposalStart && earliest && earliest < proposalStart) {
    issues.push({
      code: "SCHEDULE_BEFORE_PROPOSAL_START",
      severity: "blocker",
      field: "apresentacao.previsaoInicio",
      message: "O cronograma começa antes da previsão oficial de início da obra.",
      details: { proposalStart: dateOnly(proposalStart), earliestScheduleStart: dateOnly(earliest) },
    });
  }

  const effectiveScheduleDays = earliest && latest
    ? Math.max(1, Math.ceil((latest.getTime() - earliest.getTime()) / 86_400_000) + 1)
    : null;
  const declaredDeadline = parseDeadlineDays(input.prazoEntrega);
  if (effectiveScheduleDays && declaredDeadline && Math.abs(effectiveScheduleDays - declaredDeadline) > 1) {
    issues.push({
      code: "DEADLINE_MISMATCH",
      severity: "blocker",
      field: "prazoEntrega",
      message: `O prazo informado é ${declaredDeadline} dias, mas o cronograma ocupa ${effectiveScheduleDays} dias.`,
      details: { declaredDeadline, effectiveScheduleDays },
    });
  }

  if (configuredPhysicalCount > 0) {
    if (configuredPhysicalCount < stages.length) {
      issues.push({
        code: "PARTIAL_PHYSICAL_WEIGHTS",
        severity: "warning",
        field: "apresentacao.cronogramaEtapas",
        message: "Apenas parte das etapas possui percentual físico manual; o sistema precisará completar/normalizar o restante.",
      });
    } else if (Math.abs(configuredPhysicalTotal - 100) > 0.05) {
      issues.push({
        code: "PHYSICAL_TOTAL_NOT_100",
        severity: "blocker",
        field: "apresentacao.cronogramaEtapas",
        message: `Os percentuais físicos somam ${configuredPhysicalTotal.toFixed(2)}%, mas precisam fechar em 100%.`,
        details: { configuredPhysicalTotal },
      });
    }
  }

  if (!presentation.areaTotalConstruida) {
    issues.push({
      code: "MISSING_BUILT_AREA",
      severity: "warning",
      field: "apresentacao.areaTotalConstruida",
      message: "Área total construída não informada.",
    });
  }

  if (!Array.isArray(presentation.itensNaoInclusos) || presentation.itensNaoInclusos.length === 0) {
    issues.push({
      code: "MISSING_EXCLUSIONS",
      severity: "warning",
      field: "apresentacao.itensNaoInclusos",
      message: "Nenhuma exclusão comercial foi informada.",
    });
  }

  if (!presentation.descricaoProjeto?.trim()) {
    issues.push({
      code: "MISSING_PROJECT_DESCRIPTION",
      severity: "warning",
      field: "apresentacao.descricaoProjeto",
      message: "O entendimento do projeto ainda não foi descrito.",
    });
  }

  if (!Array.isArray(presentation.premissasObra) || presentation.premissasObra.length === 0) {
    issues.push({
      code: "MISSING_PROJECT_ASSUMPTIONS",
      severity: "warning",
      field: "apresentacao.premissasObra",
      message: "Nenhuma premissa técnica da obra foi registrada.",
    });
  }

  if (!presentation.memorialDescritivo?.trim()) {
    issues.push({
      code: "MISSING_MEMORIAL",
      severity: "warning",
      field: "apresentacao.memorialDescritivo",
      message: "Memorial descritivo não informado.",
    });
  }

  if (!presentation.politicaReajuste?.trim()) {
    issues.push({
      code: "MISSING_ADJUSTMENT_POLICY",
      severity: "warning",
      field: "apresentacao.politicaReajuste",
      message: "Política de reajuste não informada.",
    });
  }

  if (!presentation.garantiasContratuais?.trim()) {
    issues.push({
      code: "MISSING_WARRANTY",
      severity: "warning",
      field: "apresentacao.garantiasContratuais",
      message: "Garantias e assistência pós-obra não informadas.",
    });
  }

  if (!presentation.condicoesPagamentoDetalhadas?.trim()) {
    issues.push({
      code: "MISSING_PAYMENT_MILESTONES",
      severity: "warning",
      field: "apresentacao.condicoesPagamentoDetalhadas",
      message: "Os marcos e regras de pagamento ainda não foram detalhados.",
    });
  }

  if (!input.prazoEntrega) {
    issues.push({
      code: "MISSING_DEADLINE",
      severity: "warning",
      field: "prazoEntrega",
      message: "Prazo de entrega não informado.",
    });
  }

  const blockers = issues.filter((issue) => issue.severity === "blocker").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;

  return {
    ok: blockers === 0,
    blockers,
    warnings,
    calculatedTotal,
    storedTotal,
    stageCount: stages.length,
    earliestScheduleStart: earliest ? dateOnly(earliest) : null,
    latestScheduleEnd: latest ? dateOnly(latest) : null,
    effectiveScheduleDays,
    configuredPhysicalTotal: configuredPhysicalCount > 0 ? configuredPhysicalTotal : null,
    financialWeights,
    issues,
  };
}
