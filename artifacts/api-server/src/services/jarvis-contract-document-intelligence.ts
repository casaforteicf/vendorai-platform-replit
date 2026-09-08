import { and, eq, ne } from "drizzle-orm";
import { contractsTable, db, type ContractObligation, type ContractRiskClause } from "@workspace/db";

export type JarvisContractAlertKind =
  | "expiry"
  | "renewal"
  | "adjustment"
  | "obligation"
  | "risk_clause"
  | "coverage_gap";

export type JarvisContractAlert = {
  contractId: string;
  dealId: string | null;
  kind: JarvisContractAlertKind;
  severity: "attention" | "risk" | "critical";
  title: string;
  detail: string;
  dueAt: Date | null;
};

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compact(value: string | null | undefined, max = 220) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function normalizeObligations(value: ContractObligation[] | null): ContractObligation[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRiskClauses(value: ContractRiskClause[] | null): ContractRiskClause[] {
  return Array.isArray(value) ? value : [];
}

export async function loadJarvisContractDocumentIntelligence(tenantId: string) {
  const now = new Date();
  const contracts = await db
    .select({
      id: contractsTable.id,
      dealId: contractsTable.dealId,
      contractType: contractsTable.contractType,
      status: contractsTable.status,
      pdfUrl: contractsTable.pdfUrl,
      signedAt: contractsTable.signedAt,
      effectiveAt: contractsTable.effectiveAt,
      expiresAt: contractsTable.expiresAt,
      renewalType: contractsTable.renewalType,
      renewalNoticeDays: contractsTable.renewalNoticeDays,
      nextAdjustmentAt: contractsTable.nextAdjustmentAt,
      adjustmentIndex: contractsTable.adjustmentIndex,
      obligations: contractsTable.obligations,
      riskClauses: contractsTable.riskClauses,
    })
    .from(contractsTable)
    .where(and(eq(contractsTable.tenantId, tenantId), ne(contractsTable.status, "cancelled")))
    .limit(500);

  const alerts: JarvisContractAlert[] = [];
  let contractsWithLifecycleMetadata = 0;
  let contractsWithDocument = 0;

  for (const contract of contracts) {
    const lifecycleConfigured = Boolean(
      contract.effectiveAt ||
      contract.expiresAt ||
      contract.renewalType ||
      contract.nextAdjustmentAt ||
      normalizeObligations(contract.obligations).length ||
      normalizeRiskClauses(contract.riskClauses).length,
    );
    if (lifecycleConfigured) contractsWithLifecycleMetadata += 1;
    if (contract.pdfUrl) contractsWithDocument += 1;

    if (contract.expiresAt) {
      const days = daysBetween(now, contract.expiresAt);
      if (days < 0 && contract.status !== "expired") {
        alerts.push({
          contractId: contract.id,
          dealId: contract.dealId,
          kind: "expiry",
          severity: "critical",
          title: "Contrato com vencimento ultrapassado",
          detail: `Vencimento registrado há ${Math.abs(days)} dia(s), mas status atual=${contract.status}.`,
          dueAt: contract.expiresAt,
        });
      } else if (days >= 0 && days <= 90) {
        alerts.push({
          contractId: contract.id,
          dealId: contract.dealId,
          kind: "expiry",
          severity: days <= 15 ? "critical" : days <= 30 ? "risk" : "attention",
          title: `Contrato vence em ${days} dia(s)`,
          detail: `Vencimento persistido=${contract.expiresAt.toISOString()}.`,
          dueAt: contract.expiresAt,
        });
      }

      if (contract.renewalType && contract.renewalType !== "none") {
        const noticeDays = Math.max(0, contract.renewalNoticeDays ?? 0);
        const renewalDeadline = new Date(contract.expiresAt.getTime() - noticeDays * 24 * 60 * 60 * 1000);
        const deadlineDays = daysBetween(now, renewalDeadline);
        if (deadlineDays <= 30) {
          alerts.push({
            contractId: contract.id,
            dealId: contract.dealId,
            kind: "renewal",
            severity: deadlineDays < 0 ? "critical" : deadlineDays <= 7 ? "risk" : "attention",
            title: deadlineDays < 0 ? "Janela de decisão de renovação ultrapassada" : `Decisão de renovação em ${deadlineDays} dia(s)`,
            detail: `renovação=${contract.renewalType} | antecedência_configurada=${noticeDays}d | vencimento=${contract.expiresAt.toISOString()}`,
            dueAt: renewalDeadline,
          });
        }
      }
    }

    if (contract.nextAdjustmentAt) {
      const days = daysBetween(now, contract.nextAdjustmentAt);
      if (days <= 60) {
        alerts.push({
          contractId: contract.id,
          dealId: contract.dealId,
          kind: "adjustment",
          severity: days < 0 ? "critical" : days <= 15 ? "risk" : "attention",
          title: days < 0 ? "Reajuste contratual pendente/ultrapassado" : `Reajuste contratual em ${days} dia(s)`,
          detail: `data=${contract.nextAdjustmentAt.toISOString()} | índice=${compact(contract.adjustmentIndex) || "não informado"}`,
          dueAt: contract.nextAdjustmentAt,
        });
      }
    }

    for (const obligation of normalizeObligations(contract.obligations)) {
      if (obligation.status === "completed" || obligation.status === "waived") continue;
      const dueAt = parseDate(obligation.dueAt);
      if (!dueAt) continue;
      const days = daysBetween(now, dueAt);
      if (days > 60) continue;
      alerts.push({
        contractId: contract.id,
        dealId: contract.dealId,
        kind: "obligation",
        severity: days < 0 ? "critical" : days <= 7 ? "risk" : "attention",
        title: days < 0 ? `Obrigação vencida: ${compact(obligation.title, 120)}` : `Obrigação em ${days} dia(s): ${compact(obligation.title, 120)}`,
        detail: `responsável=${compact(obligation.owner) || "não informado"} | status=${obligation.status ?? "pending"}`,
        dueAt,
      });
    }

    for (const clause of normalizeRiskClauses(contract.riskClauses)) {
      const severity = clause.severity === "critical"
        ? "critical"
        : clause.severity === "high"
          ? "risk"
          : "attention";
      alerts.push({
        contractId: contract.id,
        dealId: contract.dealId,
        kind: "risk_clause",
        severity,
        title: `Cláusula de risco: ${compact(clause.title, 140)}`,
        detail: `${compact(clause.summary, 260) || "Cláusula marcada como risco sem resumo adicional."}${clause.sourceReference ? ` | referência=${compact(clause.sourceReference, 100)}` : ""}`,
        dueAt: null,
      });
    }

    const looksActive = contract.status === "signed" || Boolean(contract.signedAt);
    if (looksActive && !contract.expiresAt && !contract.renewalType && !contract.nextAdjustmentAt) {
      alerts.push({
        contractId: contract.id,
        dealId: contract.dealId,
        kind: "coverage_gap",
        severity: "attention",
        title: "Contrato ativo sem ciclo de vida estruturado",
        detail: "Não há vencimento, regra de renovação nem próximo reajuste registrados. Ausência desses campos não significa ausência de obrigação ou risco.",
        dueAt: null,
      });
    }
  }

  const severityRank = { critical: 0, risk: 1, attention: 2 } as const;
  alerts.sort((a, b) => {
    const severityDiff = severityRank[a.severity] - severityRank[b.severity];
    if (severityDiff !== 0) return severityDiff;
    if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return a.contractId.localeCompare(b.contractId);
  });

  return {
    generatedAt: now,
    summary: {
      contracts: contracts.length,
      contractsWithDocument,
      contractsWithLifecycleMetadata,
      lifecycleCoveragePercent: contracts.length
        ? Math.round((contractsWithLifecycleMetadata / contracts.length) * 100)
        : 100,
      alerts: alerts.length,
      criticalAlerts: alerts.filter((item) => item.severity === "critical").length,
      riskAlerts: alerts.filter((item) => item.severity === "risk").length,
      coverageGaps: alerts.filter((item) => item.kind === "coverage_gap").length,
    },
    alerts: alerts.slice(0, 80),
  };
}
