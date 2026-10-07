import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import {
  crmCompanyPeopleTable,
  crmPeopleMasterTable,
  crmTenantCompaniesTable,
  crmTenantCompanyContactsTable,
  db,
  prospectInteractionsTable,
  prospectsTable,
  type CompanyContactPurpose,
  type Prospect,
  type ProspectQualification,
} from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";
import { decideProspectNextAction } from "./prospect-decision-engine.js";
import { enforceTenantSolutionPolicy, resolveColdProspectingConfig } from "./cold-prospecting-config.js";

type ProspectRole =
  | "gatekeeper"
  | "interlocutor"
  | "influenciador"
  | "responsavel"
  | "decisor"
  | "usuario_potencial";

type ExtractedPerson = {
  name: string;
  jobTitle?: string | null;
  department?: string | null;
  roles: ProspectRole[];
  phone?: string | null;
  email?: string | null;
  confidence: number;
  confirmed: boolean;
};

type ProspectConversationExtraction = {
  people: ExtractedPerson[];
  confirmedFacts: Array<{ key: string; value: unknown; confidence: number }>;
  inferredFacts: Array<{ key: string; value: unknown; confidence: number }>;
  confirmedPains: string[];
  inferredPains: string[];
  optOut: boolean;
  interestSignal: boolean;
  meetingInterest: boolean;
  meetingAccepted: boolean;
  meetingStart: string | null;
  meetingEnd: string | null;
  summary: string;
};

function jsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? trimmed;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("invalid_json");
  return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function bool(v: unknown): boolean {
  return v === true;
}
function num(v: unknown, fallback = 50): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}
function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, 30) : [];
}
function roles(v: unknown): ProspectRole[] {
  const allowed = new Set<ProspectRole>(["gatekeeper","interlocutor","influenciador","responsavel","decisor","usuario_potencial"]);
  return Array.isArray(v) ? v.filter((x): x is ProspectRole => typeof x === "string" && allowed.has(x as ProspectRole)) : [];
}

function parseExtraction(raw: string): ProspectConversationExtraction {
  const o = jsonObject(raw);
  const peopleRaw = Array.isArray(o["people"]) ? o["people"] : [];
  const facts = (key: "confirmedFacts" | "inferredFacts") => {
    const arr = Array.isArray(o[key]) ? o[key] : [];
    return arr.flatMap((v) => {
      if (!v || typeof v !== "object") return [];
      const r = v as Record<string, unknown>;
      const k = str(r["key"]);
      if (!k) return [];
      return [{ key: k, value: r["value"], confidence: num(r["confidence"]) }];
    });
  };
  return {
    people: peopleRaw.flatMap((v) => {
      if (!v || typeof v !== "object") return [];
      const r = v as Record<string, unknown>;
      const name = str(r["name"]);
      if (!name) return [];
      return [{
        name,
        jobTitle: str(r["jobTitle"]) || null,
        department: str(r["department"]) || null,
        roles: roles(r["roles"]),
        phone: str(r["phone"]) || null,
        email: str(r["email"]) || null,
        confidence: num(r["confidence"]),
        confirmed: r["confirmed"] !== false,
      }];
    }),
    confirmedFacts: facts("confirmedFacts"),
    inferredFacts: facts("inferredFacts"),
    confirmedPains: strs(o["confirmedPains"]),
    inferredPains: strs(o["inferredPains"]),
    optOut: bool(o["optOut"]),
    interestSignal: bool(o["interestSignal"]),
    meetingInterest: bool(o["meetingInterest"]),
    meetingAccepted: bool(o["meetingAccepted"]),
    meetingStart: str(o["meetingStart"]) || null,
    meetingEnd: str(o["meetingEnd"]) || null,
    summary: str(o["summary"]),
  };
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function mergeAccountMap(
  current: NonNullable<Prospect["accountMap"]>,
  incoming: ExtractedPerson[],
  source: string,
): NonNullable<Prospect["accountMap"]> {
  const out = [...(current ?? [])];
  for (const person of incoming) {
    const key = person.name.toLocaleLowerCase("pt-BR");
    const idx = out.findIndex((p) => p.name.toLocaleLowerCase("pt-BR") === key);
    const next = {
      ...(idx >= 0 ? out[idx] : {}),
      name: person.name,
      jobTitle: person.jobTitle ?? (idx >= 0 ? out[idx]?.jobTitle ?? null : null),
      department: person.department ?? (idx >= 0 ? out[idx]?.department ?? null : null),
      phone: person.phone ?? (idx >= 0 ? out[idx]?.phone ?? null : null),
      email: person.email ?? (idx >= 0 ? out[idx]?.email ?? null : null),
      roles: uniq([...(idx >= 0 ? out[idx]?.roles ?? [] : []), ...person.roles]) as ProspectRole[],
      confidence: Math.max(idx >= 0 ? out[idx]?.confidence ?? 0 : 0, person.confidence),
      source,
      confirmed: person.confirmed || Boolean(idx >= 0 && out[idx]?.confirmed),
      personId: idx >= 0 ? out[idx]?.personId ?? null : null,
    };
    if (idx >= 0) out[idx] = next;
    else out.push(next);
  }
  return out;
}

function meetingReadiness(input: {
  hasResponsible: boolean;
  hasDecisionMakerOrPath: boolean;
  hasPain: boolean;
  interest: boolean;
  meetingInterest: boolean;
  meetingAccepted: boolean;
  fitScore: number;
}): number {
  let score = Math.round(input.fitScore * 0.25);
  if (input.hasResponsible) score += 15;
  if (input.hasDecisionMakerOrPath) score += 10;
  if (input.hasPain) score += 20;
  if (input.interest) score += 10;
  if (input.meetingInterest) score += 10;
  if (input.meetingAccepted) score += 20;
  return Math.max(0, Math.min(100, score));
}

async function syncPeopleToCompany(input: {
  tenantId: string;
  prospect: Prospect;
  people: ExtractedPerson[];
  accountMap: NonNullable<Prospect["accountMap"]>;
}) {
  const companyId = companyId;
  if (!companyId || input.people.length === 0) return input.accountMap;
  const [tenantCompany] = await db.select().from(crmTenantCompaniesTable)
    .where(and(
      eq(crmTenantCompaniesTable.tenantId, input.tenantId),
      eq(crmTenantCompaniesTable.companyId, companyId),
    )).limit(1);
  if (!tenantCompany) return input.accountMap;

  const out = [...input.accountMap];
  for (const person of input.people) {
    const [existing] = await db.select({
      person: crmPeopleMasterTable,
    }).from(crmCompanyPeopleTable)
      .innerJoin(crmPeopleMasterTable, eq(crmCompanyPeopleTable.personId, crmPeopleMasterTable.id))
      .where(and(
        eq(crmCompanyPeopleTable.companyId, companyId),
        ilike(crmPeopleMasterTable.nome, person.name),
      )).limit(1);

    let personId = existing?.person.id;
    if (!personId) {
      const [created] = await db.insert(crmPeopleMasterTable).values({
        nome: person.name,
        telefones: person.phone ? [person.phone] : [],
        emails: person.email ? [person.email] : [],
        source: "prospecting_conversation",
      }).returning({ id: crmPeopleMasterTable.id });
      personId = created?.id;
      if (personId) {
        await db.insert(crmCompanyPeopleTable).values({
          companyId: companyId,
          personId,
          cargo: person.jobTitle ?? null,
          source: "prospecting_conversation",
          metadata: { department: person.department ?? null },
        }).onConflictDoNothing();
      }
    }

    if (!personId) continue;
    const mappedRoles = person.roles.map((role): CompanyContactPurpose => {
      if (role === "gatekeeper") return "gatekeeper";
      if (role === "interlocutor") return "interlocutor";
      if (role === "influenciador") return "influenciador";
      if (role === "responsavel") return "responsavel";
      if (role === "decisor") return "decisor";
      if (role === "usuario_potencial") return "usuario_potencial";
      return "outro";
    });

    await db.insert(crmTenantCompanyContactsTable).values({
      tenantId: input.tenantId,
      tenantCompanyId: tenantCompany.id,
      personId,
      roles: mappedRoles,
      roleConfidence: String(person.confidence),
      roleEvidence: [{ source: "prospecting_conversation", detail: "Extraído de conversa e classificado pelo Vendi", observedAt: new Date().toISOString() }],
      verifiedAt: person.confirmed ? new Date() : null,
      metadata: { department: person.department ?? null, jobTitle: person.jobTitle ?? null },
    }).onConflictDoUpdate({
      target: [crmTenantCompanyContactsTable.tenantCompanyId, crmTenantCompanyContactsTable.personId],
      set: {
        roles: mappedRoles,
        roleConfidence: String(person.confidence),
        verifiedAt: person.confirmed ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    const idx = out.findIndex((p) => p.name.toLocaleLowerCase("pt-BR") === person.name.toLocaleLowerCase("pt-BR"));
    if (idx >= 0) out[idx] = { ...out[idx]!, personId };
  }
  return out;
}

export async function analyzeProspectInboundMessage(input: {
  tenantId: string;
  prospectId: string;
  message: string;
  channel: "whatsapp" | "email" | "phone" | "instagram";
  interactionId?: string | null;
}): Promise<Prospect | null> {
  const [prospect] = await db.select().from(prospectsTable)
    .where(and(eq(prospectsTable.id, input.prospectId), eq(prospectsTable.tenantId, input.tenantId), isNull(prospectsTable.convertedAt)))
    .limit(1);
  if (!prospect) return null;

  const system = `Você analisa respostas de PROSPECÇÃO FRIA B2B para o Vendor.ai.
Não invente nomes, cargos, dores ou intenção.
"Confirmado" significa explicitamente dito na mensagem.
"Inferido" pode ser provável, mas deve permanecer separado.
Gatekeeper é quem abre caminho; responsável conduz a área/processo; decisor aprova a compra.
Se a pessoa disser para não receber contato, optOut=true.
Se houver data e hora EXPLICITAMENTE combinadas para reunião, retorne meetingStart e meetingEnd em ISO 8601. Se não houver horário explícito, deixe null. Não invente horário.
Responda SOMENTE JSON válido:
{
 "people":[{"name":"","jobTitle":null,"department":null,"roles":["gatekeeper"],"phone":null,"email":null,"confidence":0,"confirmed":true}],
 "confirmedFacts":[{"key":"","value":null,"confidence":0}],
 "inferredFacts":[{"key":"","value":null,"confidence":0}],
 "confirmedPains":[],
 "inferredPains":[],
 "optOut":false,
 "interestSignal":false,
 "meetingInterest":false,
 "meetingAccepted":false,
 "meetingStart":null,
 "meetingEnd":null,
 "summary":""
}`;

  const ai = await gatewayCallOpenAI(input.tenantId, "intelligence_analysis", [
    { role: "system", content: system },
    { role: "user", content: `Etapa atual: ${prospect.stage}\nObjetivo atual: ${prospect.currentObjective ?? ""}\nMensagem recebida via ${input.channel}: ${input.message}` },
  ], { maxTokens: 1000 });

  const extracted = parseExtraction(ai.content);
  const now = new Date();
  const source = `${input.channel}:${input.interactionId ?? now.toISOString()}`;
  let accountMap = mergeAccountMap(prospect.accountMap ?? [], extracted.people, source);

  const currentQ = (prospect.qualification ?? {}) as ProspectQualification;
  const facts = [
    ...(currentQ.facts ?? []),
    ...extracted.confirmedFacts.map((f) => ({
      key: f.key, value: f.value, confidence: f.confidence, source, confirmed: true, observedAt: now.toISOString(),
    })),
    ...extracted.inferredFacts.map((f) => ({
      key: f.key, value: f.value, confidence: f.confidence, source, confirmed: false, observedAt: now.toISOString(),
    })),
  ];

  for (const person of extracted.people) {
    for (const role of person.roles) {
      facts.push({
        key: "contact_role",
        value: role,
        confidence: person.confidence,
        source,
        confirmed: person.confirmed,
        observedAt: now.toISOString(),
      });
      if (role === "responsavel") facts.push({ key: "responsible_identified", value: true, confidence: person.confidence, source, confirmed: person.confirmed, observedAt: now.toISOString() });
      if (role === "decisor") facts.push({ key: "decision_maker_identified", value: true, confidence: person.confidence, source, confirmed: person.confirmed, observedAt: now.toISOString() });
      if (role === "gatekeeper" && person.confirmed) facts.push({ key: "path_to_responsible_known", value: true, confidence: person.confidence, source, confirmed: true, observedAt: now.toISOString() });
    }
  }
  if (extracted.meetingAccepted) facts.push({ key: "meeting_accepted", value: true, confidence: 100, source, confirmed: true, observedAt: now.toISOString() });
  if (extracted.meetingInterest) facts.push({ key: "meeting_interest", value: true, confidence: 90, source, confirmed: true, observedAt: now.toISOString() });

  const qualification: ProspectQualification = {
    ...currentQ,
    facts,
    confirmedPains: uniq([...(currentQ.confirmedPains ?? []), ...extracted.confirmedPains]),
    inferredPains: uniq([...(currentQ.inferredPains ?? []), ...extracted.inferredPains]),
  };

  accountMap = await syncPeopleToCompany({ tenantId: input.tenantId, prospect, people: extracted.people, accountMap });

  const hasResponsible = accountMap.some((p) => p.roles.includes("responsavel") && p.confirmed);
  const hasDecision = accountMap.some((p) => p.roles.includes("decisor") && p.confirmed);
  const hasPath = facts.some((f) => f.key === "path_to_responsible_known" && f.value === true && f.confirmed);
  const hasPain = Boolean(qualification.confirmedPains?.length);
  const readiness = meetingReadiness({
    hasResponsible,
    hasDecisionMakerOrPath: hasDecision || hasPath,
    hasPain,
    interest: extracted.interestSignal,
    meetingInterest: extracted.meetingInterest,
    meetingAccepted: extracted.meetingAccepted,
    fitScore: prospect.fitScore ?? Math.max(prospect.vendoraiFitScore ?? 0, prospect.arqdorFitScore ?? 0),
  });

  const qualificationScore = Math.max(0, Math.min(100,
    Math.round((prospect.fitScore ?? Math.max(prospect.vendoraiFitScore ?? 0, prospect.arqdorFitScore ?? 0)) * 0.25)
    + (hasResponsible ? 20 : 0)
    + ((hasDecision || hasPath) ? 15 : 0)
    + (hasPain ? 25 : 0)
    + (facts.some((f) => f.confirmed) ? 10 : 0)
    + (extracted.interestSignal ? 10 : 0)
    + (extracted.meetingInterest ? 10 : 0)
  ));

  const stage = extracted.optOut
    ? "nao_contatar" as const
    : extracted.meetingAccepted
      ? "reuniao_em_negociacao" as const
      : prospect.stage;

  const runtime = await resolveColdProspectingConfig(input.tenantId);
  const decision = enforceTenantSolutionPolicy(decideProspectNextAction({
    ...prospect,
    stage,
    qualification,
  }), runtime);

  const [updated] = await db.update(prospectsTable).set({
    qualification,
    qualificationScore,
    accountMap,
    meetingReadinessScore: readiness,
    stage: decision.stage,
    currentState: decision.currentState,
    currentObjective: decision.currentObjective,
    nextBestAction: decision.nextBestAction,
    nextBestActionReason: decision.nextBestActionReason,
    recommendedSolution: decision.recommendedSolution,
    primaryHook: decision.primaryHook,
    opportunitySummary: extracted.summary || prospect.opportunitySummary,
    lastInteractionAt: now,
    nextActionAt: extracted.optOut ? null : now,
    updatedAt: now,
  }).where(and(eq(prospectsTable.id, prospect.id), eq(prospectsTable.tenantId, input.tenantId))).returning();

  return updated ?? null;
}

function digits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function tryIngestColdProspectReply(input: {
  tenantId: string;
  phone: string;
  text: string;
  channel?: "whatsapp" | "email" | "phone" | "instagram";
  externalId?: string | null;
}): Promise<{ handled: boolean; prospectId?: string }> {
  const phone = digits(input.phone);
  if (!phone) return { handled: false };

  const [prospect] = await db.select().from(prospectsTable)
    .where(and(
      eq(prospectsTable.tenantId, input.tenantId),
      isNull(prospectsTable.convertedAt),
      sql`regexp_replace(coalesce(${prospectsTable.phone}, ''), '[^0-9]', '', 'g') = ${phone}`,
    )).limit(1);

  if (!prospect) return { handled: false };

  const now = new Date();
  const [interaction] = await db.insert(prospectInteractionsTable).values({
    tenantId: input.tenantId,
    prospectId: prospect.id,
    direction: "inbound",
    channel: input.channel ?? "whatsapp",
    status: "replied",
    content: input.text,
    externalId: input.externalId ?? null,
    occurredAt: now,
  }).returning({ id: prospectInteractionsTable.id });

  await analyzeProspectInboundMessage({
    tenantId: input.tenantId,
    prospectId: prospect.id,
    message: input.text,
    channel: input.channel ?? "whatsapp",
    interactionId: interaction?.id ?? null,
  });

  return { handled: true, prospectId: prospect.id };
}


export async function tryIngestColdProspectEmailReply(input: {
  tenantId: string;
  email: string;
  subject?: string | null;
  text: string;
  externalId?: string | null;
}): Promise<{ handled: boolean; prospectId?: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { handled: false };

  const [prospect] = await db.select().from(prospectsTable)
    .where(and(
      eq(prospectsTable.tenantId, input.tenantId),
      isNull(prospectsTable.convertedAt),
      sql`lower(coalesce(${prospectsTable.email}, '')) = ${email}`,
    )).limit(1);

  if (!prospect) return { handled: false };

  const content = input.subject?.trim()
    ? `Assunto: ${input.subject.trim()}\n\n${input.text}`
    : input.text;
  const now = new Date();
  const [interaction] = await db.insert(prospectInteractionsTable).values({
    tenantId: input.tenantId,
    prospectId: prospect.id,
    direction: "inbound",
    channel: "email",
    status: "replied",
    content,
    subject: input.subject ?? null,
    externalId: input.externalId ?? null,
    occurredAt: now,
  }).returning({ id: prospectInteractionsTable.id });

  await analyzeProspectInboundMessage({
    tenantId: input.tenantId,
    prospectId: prospect.id,
    message: content,
    channel: "email",
    interactionId: interaction?.id ?? null,
  });

  return { handled: true, prospectId: prospect.id };
}
