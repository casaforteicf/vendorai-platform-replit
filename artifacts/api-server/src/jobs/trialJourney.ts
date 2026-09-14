import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  dealsTable,
  leadEventsTable,
  leadsTable,
  messagesTable,
  notificationsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import { sendTrialJourneyEmail } from "../lib/trial-email.js";
import { sendTrialUpgradeRequestedAlert } from "../lib/trial-upgrade-alert.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRIALS_PER_RUN = 300;
const COMMERCIAL_ALERT_MARKER = "[commercial_alert_sent]";

export type TrialActivationSnapshot = {
  score: number;
  tier: "baixo" | "medio" | "alto" | "muito_alto";
  day: number;
  daysRemaining: number;
  firstLogin: boolean;
  onboardingComplete: boolean;
  integrationsComplete: boolean;
  realLeads: number;
  messages: number;
  deals: number;
  nextAction: string;
  calculatedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function readBehaviorIntent(discoveryData: Record<string, unknown>): number | null {
  const behavior = asRecord(discoveryData["behaviorIntent"]);
  const score = Number(behavior["score"]);
  return Number.isFinite(score) ? score : null;
}

function tierFromScore(score: number): TrialActivationSnapshot["tier"] {
  if (score >= 85) return "muito_alto";
  if (score >= 70) return "alto";
  if (score >= 40) return "medio";
  return "baixo";
}

function activationScore(input: {
  firstLogin: boolean;
  onboardingComplete: boolean;
  integrationsComplete: boolean;
  realLeads: number;
  messages: number;
  deals: number;
}) {
  let score = 0;
  if (input.firstLogin) score += 10;
  if (input.onboardingComplete) score += 20;
  if (input.integrationsComplete) score += 25;
  if (input.realLeads > 0) score += 20;
  if (input.messages > 0) score += 15;
  if (input.deals > 0) score += 10;
  return Math.min(100, score);
}

function nextActionFor(input: {
  onboardingComplete: boolean;
  integrationsComplete: boolean;
  realLeads: number;
  messages: number;
  deals: number;
  score: number;
}) {
  if (!input.onboardingComplete) return "Concluir o onboarding para personalizar o VendorAI para a empresa.";
  if (!input.integrationsComplete) return "Conectar pelo menos um canal ou integração para começar a operar com dados reais.";
  if (input.realLeads === 0) return "Criar/importar o primeiro lead real e acompanhar a IA trabalhar a oportunidade.";
  if (input.messages === 0) return "Iniciar uma conversa real para validar atendimento e follow-up automático.";
  if (input.deals === 0) return "Criar a primeira oportunidade no pipeline e acompanhar a evolução até o fechamento.";
  if (input.score >= 70) return "Revisar o valor gerado e falar com o comercial para continuar sem perder os dados do trial.";
  return "Continuar usando o fluxo real até o VendorAI participar de uma oportunidade completa.";
}

function dayNumber(createdAt: Date, now: Date) {
  return Math.min(5, Math.max(1, Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS) + 1));
}

function remainingDays(expiresAt: Date, now: Date) {
  return Math.max(0, Math.min(5, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS)));
}

function journeyCopy(day: number, snapshot: TrialActivationSnapshot, tenantName: string) {
  const valueSummary = `${snapshot.realLeads} lead(s), ${snapshot.messages} mensagem(ns) e ${snapshot.deals} oportunidade(s) já passaram pelo trial.`;
  if (day === 1) {
    return {
      title: "Dia 1 — chegue ao primeiro valor",
      message: `Seu teste de ${tenantName} começou. Activation Score: ${snapshot.score}/100. ${snapshot.nextAction}`,
      subject: "Dia 1 do VendorAI — chegue ao primeiro valor",
      headline: "Seu objetivo hoje: colocar o VendorAI para operar",
    };
  }
  if (day === 2) {
    return {
      title: "Dia 2 — use um lead real",
      message: `Activation Score: ${snapshot.score}/100. ${snapshot.nextAction}`,
      subject: "Dia 2 do VendorAI — valide com uma oportunidade real",
      headline: "Hoje o teste precisa sair da configuração e entrar na operação",
    };
  }
  if (day === 3) {
    return {
      title: "Dia 3 — valide atendimento e follow-up",
      message: `${valueSummary} Activation Score: ${snapshot.score}/100. ${snapshot.nextAction}`,
      subject: "Dia 3 do VendorAI — veja a IA acompanhar a oportunidade",
      headline: "O valor aparece quando a oportunidade continua sendo acompanhada",
    };
  }
  if (day === 4) {
    return {
      title: "Dia 4 — revise o valor já gerado",
      message: `${valueSummary} Activation Score: ${snapshot.score}/100. ${snapshot.nextAction}`,
      subject: "Dia 4 do VendorAI — o que seu trial já colocou em movimento",
      headline: "Revise o que já aconteceu antes do último dia",
    };
  }
  return {
    title: "Dia 5 — seu trial termina hoje",
    message: `${valueSummary} Activation Score final: ${snapshot.score}/100. Seus dados são preservados; solicite continuidade antes da expiração para seguir usando a mesma conta.`,
    subject: "Último dia do trial VendorAI — continue sem perder seus dados",
    headline: "Seu teste termina hoje, mas a operação não precisa parar",
  };
}

async function eventExists(leadId: string, tipo: string) {
  const [row] = await db
    .select({ id: leadEventsTable.id })
    .from(leadEventsTable)
    .where(and(eq(leadEventsTable.leadId, leadId), eq(leadEventsTable.tipo, tipo)))
    .limit(1);
  return Boolean(row);
}

async function countTrialUsage(trialTenantId: string) {
  const [leadCount] = await db.select({ total: sql<number>`count(*)` })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.tenantId, trialTenantId),
      eq(leadsTable.pipelineExempt, false),
      isNull(leadsTable.excluidoEm),
      isNull(leadsTable.naoLeadTipo),
    ));
  const [messageCount] = await db.select({ total: sql<number>`count(*)` })
    .from(messagesTable)
    .where(eq(messagesTable.tenantId, trialTenantId));
  const [dealCount] = await db.select({ total: sql<number>`count(*)` })
    .from(dealsTable)
    .where(eq(dealsTable.tenantId, trialTenantId));
  return {
    realLeads: Number(leadCount?.total ?? 0),
    messages: Number(messageCount?.total ?? 0),
    deals: Number(dealCount?.total ?? 0),
  };
}

/**
 * Jornada de valor do trial. O job é idempotente pelo lead_events e pode rodar
 * em múltiplas réplicas. O Activation Score mede uso do produto; não mistura
 * Behavior Intent, Revenue Scout ou churn.
 */
export async function runTrialJourney(log: Logger): Promise<void> {
  const now = new Date();
  const [vendorai] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, "vendorai"))
    .limit(1);
  if (!vendorai) {
    log.warn("trial-journey: tenant vendorai não encontrado");
    return;
  }

  const commercialUsers = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(
      eq(usersTable.tenantId, vendorai.id),
      eq(usersTable.active, true),
      or(
        eq(usersTable.role, "admin"),
        eq(usersTable.platformRole, "tenant_admin"),
        eq(usersTable.platformRole, "super_admin"),
      ),
    ));
  const commercialRecipients = commercialUsers.map((user) => user.email).filter(Boolean);

  const trials = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      createdAt: tenantsTable.createdAt,
      firstLoginAt: tenantsTable.firstLoginAt,
      demoExpiresAt: tenantsTable.demoExpiresAt,
      onboardingConcluido: tenantsTable.onboardingConcluido,
      integracoesConcluido: tenantsTable.integracoesConcluido,
    })
    .from(tenantsTable)
    .where(and(
      eq(tenantsTable.isDemo, true),
      eq(tenantsTable.provisioningMethod, "trial"),
      eq(tenantsTable.status, "active"),
    ))
    .orderBy(desc(tenantsTable.createdAt))
    .limit(MAX_TRIALS_PER_RUN);

  let scored = 0;
  let journeyMessages = 0;
  let highIntentAlerts = 0;
  let upgradeAlerts = 0;

  for (const trial of trials) {
    if (!trial.demoExpiresAt) continue;
    try {
      const [salesLead] = await db
        .select({
          id: leadsTable.id,
          nome: leadsTable.nome,
          empresa: leadsTable.empresa,
          email: leadsTable.email,
          telefone: leadsTable.telefone,
          discoveryData: leadsTable.discoveryData,
          proximaAcao: leadsTable.proximaAcao,
        })
        .from(leadsTable)
        .where(and(
          eq(leadsTable.tenantId, vendorai.id),
          eq(leadsTable.source, "trial_signup"),
          sql`${leadsTable.discoveryData}->>'trialTenantId' = ${trial.id}`,
        ))
        .orderBy(desc(leadsTable.createdAt))
        .limit(1);
      if (!salesLead) continue;

      const usage = await countTrialUsage(trial.id);
      const score = activationScore({
        firstLogin: Boolean(trial.firstLoginAt),
        onboardingComplete: trial.onboardingConcluido,
        integrationsComplete: trial.integracoesConcluido,
        ...usage,
      });
      const snapshot: TrialActivationSnapshot = {
        score,
        tier: tierFromScore(score),
        day: dayNumber(trial.createdAt, now),
        daysRemaining: remainingDays(trial.demoExpiresAt, now),
        firstLogin: Boolean(trial.firstLoginAt),
        onboardingComplete: trial.onboardingConcluido,
        integrationsComplete: trial.integracoesConcluido,
        ...usage,
        nextAction: nextActionFor({
          onboardingComplete: trial.onboardingConcluido,
          integrationsComplete: trial.integracoesConcluido,
          ...usage,
          score,
        }),
        calculatedAt: now.toISOString(),
      };

      const discovery = asRecord(salesLead.discoveryData);
      const behaviorIntent = readBehaviorIntent(discovery);
      await db.update(leadsTable).set({
        discoveryData: { ...discovery, trialJourney: snapshot },
        updatedAt: now,
      }).where(eq(leadsTable.id, salesLead.id));

      const [commercialDeal] = await db
        .select({ id: dealsTable.id, probabilidade: dealsTable.probabilidade })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, vendorai.id), eq(dealsTable.leadId, salesLead.id)))
        .orderBy(desc(dealsTable.createdAt))
        .limit(1);
      if (commercialDeal) {
        const probability = score >= 85 ? 90 : score >= 70 ? 75 : score >= 40 ? 55 : 30;
        if (probability > Number(commercialDeal.probabilidade ?? 0)) {
          await db.update(dealsTable).set({ probabilidade: probability, updatedAt: now }).where(eq(dealsTable.id, commercialDeal.id));
        }
      }
      scored++;

      // Recupera também pedidos feitos antes da correção de e-mail. Enquanto a
      // continuidade estiver solicitada, esse sinal comercial explícito vence
      // qualquer score comportamental posterior.
      const [upgradeEvent] = await db
        .select({
          id: leadEventsTable.id,
          descricao: leadEventsTable.descricao,
          createdAt: leadEventsTable.createdAt,
        })
        .from(leadEventsTable)
        .where(and(
          eq(leadEventsTable.leadId, salesLead.id),
          eq(leadEventsTable.tipo, "trial_upgrade_requested"),
        ))
        .orderBy(desc(leadEventsTable.createdAt))
        .limit(1);

      if (upgradeEvent) {
        await db.update(leadsTable).set({
          proximaAcao: "Cliente solicitou continuidade do trial: entrar em contato agora para plano/fechamento e preservar o tenant atual.",
          status: "qualificado",
          discoveryData: {
            ...discovery,
            trialJourney: snapshot,
            trialUpgradePriority: true,
            trialUpgradeRequestedAt: upgradeEvent.createdAt.toISOString(),
          },
          updatedAt: now,
        }).where(eq(leadsTable.id, salesLead.id));

        if (commercialDeal && Number(commercialDeal.probabilidade ?? 0) < 90) {
          await db.update(dealsTable)
            .set({ probabilidade: 90, updatedAt: now })
            .where(eq(dealsTable.id, commercialDeal.id));
        }

        if (!upgradeEvent.descricao.includes(COMMERCIAL_ALERT_MARKER)) {
          const sent = await sendTrialUpgradeRequestedAlert({
            to: commercialRecipients,
            leadName: salesLead.nome,
            companyName: salesLead.empresa || trial.name,
            email: salesLead.email,
            phone: salesLead.telefone,
            activationScore: score,
            trialTenantId: trial.id,
            requestedAt: upgradeEvent.createdAt,
          });
          if (sent) {
            await db.update(leadEventsTable)
              .set({ descricao: `${upgradeEvent.descricao} ${COMMERCIAL_ALERT_MARKER}` })
              .where(eq(leadEventsTable.id, upgradeEvent.id));
            upgradeAlerts++;
          }
        }
      }

      const dayEventType = `trial_day_${snapshot.day}_journey`;
      if (!(await eventExists(salesLead.id, dayEventType))) {
        const copy = journeyCopy(snapshot.day, snapshot, trial.name);
        await db.insert(leadEventsTable).values({
          leadId: salesLead.id,
          tipo: dayEventType,
          descricao: copy.message,
          scoreBoost: 0,
          notifiedAt: now,
        });
        await db.insert(notificationsTable).values({
          tenantId: trial.id,
          type: snapshot.day === 5 ? "warning" : "info",
          category: "trial",
          title: copy.title,
          message: copy.message,
        });

        const [admin] = await db
          .select({ email: usersTable.email, name: usersTable.name })
          .from(usersTable)
          .where(and(eq(usersTable.tenantId, trial.id), eq(usersTable.role, "admin"), eq(usersTable.active, true)))
          .orderBy(usersTable.createdAt)
          .limit(1);
        if (admin?.email) {
          await sendTrialJourneyEmail({
            to: admin.email,
            name: admin.name,
            companyName: trial.name,
            day: snapshot.day,
            subject: copy.subject,
            headline: copy.headline,
            snapshot,
            dashboardUrl: "https://app.appvendorai.com/dashboard",
          }).catch((err) => log.warn({ err, trialTenantId: trial.id }, "trial-journey: e-mail failed"));
        }
        journeyMessages++;
      }

      const highCommercialIntent = score >= 70 || (score >= 50 && (behaviorIntent ?? 0) >= 60);
      if (highCommercialIntent && !(await eventExists(salesLead.id, "trial_high_intent"))) {
        const intentSummary = behaviorIntent == null ? "sem Behavior Intent medido" : `Behavior Intent ${behaviorIntent}/100`;
        await db.insert(leadEventsTable).values({
          leadId: salesLead.id,
          tipo: "trial_high_intent",
          descricao: `Trial com alta intenção: Activation Score ${score}/100; ${intentSummary}.`,
          scoreBoost: 20,
          notifiedAt: now,
        });
        await db.insert(notificationsTable).values({
          tenantId: vendorai.id,
          type: "warning",
          category: "trial_high_intent",
          title: `Trial quente — ${salesLead.empresa || salesLead.nome}`,
          message: `Activation Score ${score}/100; ${intentSummary}. Próxima ação: contato comercial prioritário antes da expiração do trial.`,
        });
        await db.update(leadsTable).set({
          proximaAcao: "Contato comercial prioritário: trial com alta ativação/intenção; revisar valor gerado e oferta antes da expiração.",
          updatedAt: now,
        }).where(eq(leadsTable.id, salesLead.id));
        highIntentAlerts++;
      }
    } catch (err) {
      log.warn({ err, trialTenantId: trial.id }, "trial-journey: trial failed");
    }
  }

  if (scored > 0 || journeyMessages > 0 || highIntentAlerts > 0 || upgradeAlerts > 0) {
    log.info({ scored, journeyMessages, highIntentAlerts, upgradeAlerts }, "trial-journey: complete");
  }
}
