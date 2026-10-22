import { and, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  leadOptimalHoursTable,
  leadsTable,
  propostasTable,
  scoutOportunidadesTable,
  scoutRegrasTable,
  tenantsTable,
  type PropostaItem,
} from "@workspace/db";
import { captureLeadFeatureSnapshot } from "../lib/mlFeatureStore.js";

export interface VerticalRevenueProfile {
  key: string;
  label: string;
  cycleDays: number;
  dormantDays: number;
  cycleType: string;
  cycleLabel: string;
  focus: string;
  signals: string[];
}

const PROFILES: VerticalRevenueProfile[] = [
  { key:"construction", label:"Construção e projetos", cycleDays:45, dormantDays:120, cycleType:"cross_sell", cycleLabel:"próxima etapa da obra", focus:"etapa, materiais, orçamento e prazo", signals:["etapa da obra", "sequência de materiais", "orçamento parado", "recompra por consumo"] },
  { key:"retail", label:"Varejo", cycleDays:45, dormantDays:120, cycleType:"recompra", cycleLabel:"recompra e reposição", focus:"frequência, mix, margem e coleção", signals:["ciclo de recompra", "cliente inativo", "mix incompleto", "produto complementar"] },
  { key:"supermarket", label:"Supermercado", cycleDays:14, dormantDays:45, cycleType:"recompra", cycleLabel:"reposição da cesta", focus:"cesta, frequência e categoria", signals:["frequência de compra", "cesta recorrente", "categoria ausente", "oferta relevante"] },
  { key:"beauty", label:"Beleza e bem-estar", cycleDays:30, dormantDays:75, cycleType:"recompra", cycleLabel:"retorno de serviço", focus:"retorno, agenda, serviço e profissional", signals:["ciclo do serviço", "retorno atrasado", "horário ocioso", "serviço complementar"] },
  { key:"clinic", label:"Clínica e saúde", cycleDays:60, dormantDays:120, cycleType:"follow_up", cycleLabel:"retorno assistencial", focus:"retorno, especialidade, agenda e cuidado", signals:["retorno pendente", "plano de cuidado", "consulta não agendada", "acompanhamento"] },
  { key:"restaurant", label:"Restaurante", cycleDays:21, dormantDays:60, cycleType:"recompra", cycleLabel:"nova visita ou pedido", focus:"frequência, preferência, ticket e horário", signals:["cliente recorrente", "queda de frequência", "preferência de cardápio", "horário ocioso"] },
  { key:"realestate", label:"Imóveis", cycleDays:7, dormantDays:30, cycleType:"follow_up", cycleLabel:"retomada da negociação", focus:"interesse, faixa de preço, região e visita", signals:["lead sem retorno", "imóvel compatível", "visita pendente", "proposta parada"] },
  { key:"automotive", label:"Veículos", cycleDays:7, dormantDays:30, cycleType:"follow_up", cycleLabel:"retomada da negociação", focus:"modelo, faixa de preço, avaliação e test-drive", signals:["test-drive pendente", "veículo compatível", "avaliação parada", "troca futura"] },
  { key:"logistics", label:"Fretes e logística", cycleDays:30, dormantDays:90, cycleType:"renovacao", cycleLabel:"nova demanda de frete", focus:"rota, recorrência, capacidade e SLA", signals:["rota recorrente", "cliente sem cotar", "capacidade disponível", "renovação de contrato"] },
  { key:"travel", label:"Viagens e hotelaria", cycleDays:90, dormantDays:180, cycleType:"follow_up", cycleLabel:"nova reserva ou experiência", focus:"datas, preferência, ocupação e destino", signals:["datas ociosas", "hóspede recorrente", "preferência de destino", "reserva abandonada"] },
  { key:"pharmacy", label:"Farmácia e saúde", cycleDays:30, dormantDays:75, cycleType:"recompra", cycleLabel:"reposição recorrente", focus:"recorrência, cuidado e categoria", signals:["ciclo de reposição", "cliente inativo", "categoria complementar", "continuidade de cuidado"] },
  { key:"agro", label:"Agropecuária", cycleDays:35, dormantDays:90, cycleType:"recompra", cycleLabel:"reposição de ração e insumos", focus:"consumo recorrente (ração, suplemento), safra e sazonalidade de plantio", signals:["ciclo de reposição de ração", "cliente inativo", "insumo complementar", "janela de plantio da safra"] },
];

export function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function resolveVerticalRevenueProfile(vertical?: string | null): VerticalRevenueProfile | null {
  const value = normalize(vertical ?? "");
  if (!value || /seguro|distribuidora/.test(value)) return null;
  if (/construcao|reforma|arquitet|engenharia/.test(value)) return PROFILES[0]!;
  if (/supermercado|mercado|mercearia/.test(value)) return PROFILES[2]!;
  if (/salao|barbearia|beleza|estetica/.test(value)) return PROFILES[3]!;
  if (/clinica|odonto|medic/.test(value)) return PROFILES[4]!;
  if (/restaurante|alimentacao|gastronomia/.test(value)) return PROFILES[5]!;
  if (/imove|imobiliaria/.test(value)) return PROFILES[6]!;
  if (/veiculo|automotivo|concessionaria/.test(value)) return PROFILES[7]!;
  if (/frete|logistica|transport/.test(value)) return PROFILES[8]!;
  if (/viagem|hotel|turismo|pousada/.test(value)) return PROFILES[9]!;
  if (/farmacia|saude/.test(value)) return PROFILES[10]!;
  if (/agropecuari|veterinari|agro\b|rural/.test(value)) return PROFILES[11]!;
  if (/varejo|roupa|eletron|decoracao|bebe|esporte|papelaria|joia|calcado|moveis|brinquedo|instrumento|perfumaria|floricultura|adega|pet shop|games|informatica|piscina|spa\b|autopec/.test(value)) return PROFILES[1]!;
  return null;
}

type LeadSignalRow = {
  id: string;
  nome: string;
  intentScore: number | null;
  lastIntentUpdate: Date | null;
  propensityScore: number | null;
  enrichmentData: any;
  discoveryData: any;
  metadata: any;
  priorityReason: string | null;
  roiEstimate: any;
};

type Snapshot = {
  dates: Date[];
  totals: number[];
  products: Map<string, string>;
  productPrices: Map<string, number[]>;
  purchases: Array<{ date: Date; total: number }>;
};

async function ensureEngineRule(
  tenantId: string,
  profile: VerticalRevenueProfile,
  tipo: string,
  key: string,
  label: string,
) {
  const nome = `Revenue Scout · ${profile.label} · ${label}`;
  const [existing] = await db.select().from(scoutRegrasTable)
    .where(and(eq(scoutRegrasTable.tenantId, tenantId), eq(scoutRegrasTable.nome, nome))).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(scoutRegrasTable).values({
    tenantId,
    nome,
    tipo,
    // Mantém o marcador v1 porque o engine genérico de revenueScout.ts já ignora
    // essas regras. A versão analítica fica registrada no explanation/sourceEngine.
    condicoes: { engine:"vertical_revenue_v1", vertical:profile.key, strategy:key },
    acao: { canal:"human_approval", automaticContact:false, requiresApproval:true },
    ativo:true,
  }).returning();
  return created!;
}

async function hasRecentOpportunity(tenantId: string, leadId: string, regraId: string, days = 60) {
  const [existing] = await db.select({ createdAt:scoutOportunidadesTable.createdAt, status:scoutOportunidadesTable.status })
    .from(scoutOportunidadesTable)
    .where(and(
      eq(scoutOportunidadesTable.tenantId, tenantId),
      eq(scoutOportunidadesTable.clienteId, leadId),
      eq(scoutOportunidadesTable.regraId, regraId),
    ))
    .orderBy(desc(scoutOportunidadesTable.createdAt))
    .limit(1);
  if (!existing) return false;
  if (!["ignorado", "converteu"].includes(existing.status ?? "")) return true;
  return Date.now() - existing.createdAt.getTime() < days * 86_400_000;
}

function explicitNumber(source: any, keys: string[]): number | null {
  for (const key of keys) {
    const raw = source?.[key];
    const n = Number(raw);
    if (raw !== undefined && raw !== null && raw !== "" && Number.isFinite(n)) return n;
  }
  return null;
}

function competitorNames(lead: LeadSignalRow): string[] {
  const values = [lead.discoveryData?.concorrentes, lead.discoveryData?.concorrente, lead.discoveryData?.competitors, lead.metadata?.concorrentes];
  const out: string[] = [];
  for (const value of values) {
    if (Array.isArray(value)) out.push(...value.map((v) => typeof v === "string" ? v : v?.nome).filter(Boolean));
    else if (typeof value === "string") out.push(...value.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean));
  }
  return [...new Set(out)].slice(0, 5);
}

function expansionSignals(lead: LeadSignalRow): string[] {
  const growth = lead.enrichmentData?.growth ?? {};
  const signals: string[] = [];
  if (growth.multiplas_unidades) signals.push("múltiplas unidades");
  if (growth.contratando) signals.push("empresa contratando");
  if (growth.anuncios_ativos) signals.push("anúncios ativos");
  if (growth.horario_estendido) signals.push("horário estendido");
  const text = JSON.stringify(lead.discoveryData ?? {}).toLowerCase();
  if (/nova unidade|nova filial|expans[aã]o|nova obra|novo projeto/.test(text)) signals.push("evento de expansão relatado");
  return [...new Set(signals)];
}

function confidenceScore(parts: { purchase?: boolean; intent?: number; explicitSignal?: boolean; cohort?: number; valueKnown?: boolean }) {
  let score = 30;
  if (parts.purchase) score += 20;
  if ((parts.intent ?? 0) >= 60) score += 15;
  if (parts.explicitSignal) score += 20;
  if ((parts.cohort ?? 0) >= 0.5) score += 10;
  if (parts.valueKnown) score += 5;
  return Math.min(100, score);
}

async function createOpportunity(args: {
  tenantId: string;
  lead: LeadSignalRow;
  rule: any;
  tipo: string;
  descricao: string;
  score: number;
  valorEstimado?: number | null;
  facts: Record<string, unknown>;
  inference: Record<string, unknown>;
  optimalHour?: { hour: number; confidence: number } | null;
  log: Logger;
}) {
  const { tenantId, lead, rule, tipo, descricao, score, valorEstimado, facts, inference, optimalHour, log } = args;
  const janela = score >= 85 ? 2 : score >= 70 ? 5 : score >= 50 ? 10 : 21;
  await db.insert(scoutOportunidadesTable).values({
    tenantId,
    clienteId:lead.id,
    regraId:rule.id,
    tipo,
    descricao,
    ...(valorEstimado && valorEstimado > 0 ? { valorEstimado:String(Number(valorEstimado.toFixed(2))) } : {}),
    // "pendente" é o estado universal já suportado por confirmar/rejeitar.
    // A regra exige aprovação, portanto processarOportunidades nunca envia sozinho.
    status:"pendente",
    canal:"human_approval",
    scoreOportunidade:String(Math.min(100, Math.max(0, score))),
    humanRequired:true,
    blocked:false,
    explanation:{
      facts:{ ...facts, sourceEngine:"vertical_revenue_v2" },
      inference:{ ...inference, confidenceScore:inference.confidenceScore, recommendedWindowDays:janela, ...(optimalHour ? { optimalContactHour:optimalHour.hour, optimalHourConfidence:optimalHour.confidence } : {}) },
      autonomy:{ mode:"human_approval", automaticContact:false, requiredAction:"Validar contexto e condição comercial antes de qualquer contato." },
    },
  } as any);
  captureLeadFeatureSnapshot(tenantId, lead.id, "scout_oportunidade_criada", { tipoRegra:tipo, engine:"vertical_revenue_v2" }, log).catch(() => {});
}

export async function runVerticalRevenueForTenant(tenantId: string, log: Logger) {
  const [tenant] = await db.select({ vertical:tenantsTable.vertical }).from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId)).limit(1);
  const profile = resolveVerticalRevenueProfile(tenant?.vertical);
  if (!profile) return { applicable:false, customersAnalyzed:0, opportunitiesCreated:0 };

  const proposals = await db.select({
    leadId:propostasTable.leadId,
    acceptedAt:propostasTable.acceptedAt,
    updatedAt:propostasTable.updatedAt,
    valorTotal:propostasTable.valorTotal,
    itens:propostasTable.itens,
  }).from(propostasTable).where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.status, "aceita")))
    .orderBy(desc(propostasTable.acceptedAt));

  const leads = await db.select({
    id:leadsTable.id,
    nome:leadsTable.nome,
    intentScore:leadsTable.intentScore,
    lastIntentUpdate:leadsTable.lastIntentUpdate,
    propensityScore:leadsTable.propensityScore,
    enrichmentData:leadsTable.enrichmentData,
    discoveryData:leadsTable.discoveryData,
    metadata:leadsTable.metadata,
    priorityReason:leadsTable.priorityReason,
    roiEstimate:leadsTable.roiEstimate,
  }).from(leadsTable).where(eq(leadsTable.tenantId, tenantId));

  // Escopo explícito por tenant via join no lead; evita até leitura transitória de outro tenant.
  const optimalRows = await db.select({
    leadId:leadOptimalHoursTable.leadId,
    hour:leadOptimalHoursTable.optimalHour,
    confidence:leadOptimalHoursTable.confidence,
  }).from(leadOptimalHoursTable)
    .innerJoin(leadsTable, eq(leadsTable.id, leadOptimalHoursTable.leadId))
    .where(eq(leadsTable.tenantId, tenantId));
  const optimalByLead = new Map(optimalRows.filter((r) => r.hour !== null).map((r) => [r.leadId, { hour:r.hour!, confidence:r.confidence }]));

  const snapshots = new Map<string, Snapshot>();
  for (const proposal of proposals) {
    if (!proposal.leadId) continue;
    const snapshot: Snapshot = snapshots.get(proposal.leadId) ?? { dates:[], totals:[], products:new Map(), productPrices:new Map(), purchases:[] };
    const date = proposal.acceptedAt ?? proposal.updatedAt;
    const total = Number(proposal.valorTotal ?? 0);
    snapshot.dates.push(date);
    snapshot.totals.push(total);
    snapshot.purchases.push({ date, total:Number.isFinite(total) ? total : 0 });
    for (const item of (proposal.itens ?? []) as PropostaItem[]) {
      if (!item.produtoId) continue;
      snapshot.products.set(item.produtoId, item.nome ?? item.produtoId);
      const price = Number((item as any).valorUnitario ?? 0);
      if (Number.isFinite(price) && price > 0) {
        const prices = snapshot.productPrices.get(item.produtoId) ?? [];
        prices.push(price);
        snapshot.productPrices.set(item.produtoId, prices);
      }
    }
    snapshots.set(proposal.leadId, snapshot);
  }

  const buyerIdsByProduct = new Map<string, Set<string>>();
  const productNames = new Map<string, string>();
  const productPriceSamples = new Map<string, number[]>();
  for (const [leadId, snapshot] of snapshots) {
    for (const [productId, name] of snapshot.products) {
      productNames.set(productId, name);
      const buyers = buyerIdsByProduct.get(productId) ?? new Set<string>();
      buyers.add(leadId);
      buyerIdsByProduct.set(productId, buyers);
      for (const price of snapshot.productPrices.get(productId) ?? []) {
        const samples = productPriceSamples.get(productId) ?? [];
        samples.push(price);
        productPriceSamples.set(productId, samples);
      }
    }
  }

  const cutoff365 = Date.now() - 365 * 86_400_000;
  const spend365 = new Map<string, number>();
  for (const [leadId, snapshot] of snapshots) {
    spend365.set(leadId, snapshot.purchases.filter((p) => p.date.getTime() >= cutoff365).reduce((sum, p) => sum + p.total, 0));
  }
  const buyerSpends = [...spend365.values()].filter((v) => v > 0);
  const averageWallet = buyerSpends.length ? buyerSpends.reduce((a,b) => a + b, 0) / buyerSpends.length : 0;

  const rules = {
    // Reusa exatamente os nomes do engine anterior para não duplicar regras existentes.
    cycle: await ensureEngineRule(tenantId, profile, profile.cycleType, "cycle", profile.cycleType),
    dormant: await ensureEngineRule(tenantId, profile, "reativacao", "dormant", "reativacao"),
    wallet: await ensureEngineRule(tenantId, profile, "potencial_carteira", "wallet_gap", "potencial de carteira"),
    nextProduct: await ensureEngineRule(tenantId, profile, "cross_sell", "next_best_product", "próximo melhor produto"),
    intent: await ensureEngineRule(tenantId, profile, "sinal_praca_ai", "intent", "intenção em alta"),
    expansion: await ensureEngineRule(tenantId, profile, "sinal_expansao", "expansion", "evento de expansão"),
    competitive: await ensureEngineRule(tenantId, profile, "risco_competitivo", "competitive", "risco competitivo"),
    referral: await ensureEngineRule(tenantId, profile, "indicacao", "referral", "potencial de indicação"),
  };

  let opportunitiesCreated = 0;
  const dayMs = 86_400_000;

  for (const lead of leads as LeadSignalRow[]) {
    const snapshot = snapshots.get(lead.id);
    const lastPurchase = snapshot?.dates.slice().sort((a,b) => b.getTime() - a.getTime())[0] ?? null;
    const days = lastPurchase ? Math.max(0, Math.floor((Date.now() - lastPurchase.getTime()) / dayMs)) : null;
    const totals = snapshot?.totals.filter((value) => Number.isFinite(value) && value > 0) ?? [];
    const averageTicket = totals.length ? totals.reduce((sum,value) => sum + value, 0) / totals.length : 0;
    const optimalHour = optimalByLead.get(lead.id) ?? null;

    if (snapshot && lastPurchase && days !== null && days >= profile.cycleDays) {
      const dormant = days >= profile.dormantDays;
      const rule = dormant ? rules.dormant : rules.cycle;
      if (!(await hasRecentOpportunity(tenantId, lead.id, rule.id))) {
        const threshold = dormant ? profile.dormantDays : profile.cycleDays;
        const score = Math.min(100, (dormant ? 58 : 70) + Math.round(Math.min(25, ((days - threshold) / threshold) * 25)) + Math.round(Math.min(8, (lead.intentScore ?? 0) / 12.5)));
        const products = [...snapshot.products.values()].slice(0, 5);
        await createOpportunity({
          tenantId, lead, rule, tipo:dormant ? "reativacao" : profile.cycleType,
          descricao:dormant ? `Reativar ${lead.nome}: ${days} dias sem nova movimentação` : `${profile.cycleLabel} para ${lead.nome}`,
          score, valorEstimado:averageTicket,
          facts:{ vertical:tenant?.vertical, lastPurchaseAt:lastPurchase.toISOString(), daysSinceLastPurchase:days, acceptedPurchases:snapshot.dates.length, averageTicket:Number(averageTicket.toFixed(2)), recentItems:products },
          inference:{ signal:dormant ? "reativacao" : profile.cycleType, thresholdDays:threshold, focus:profile.focus, confidenceScore:confidenceScore({ purchase:true, intent:lead.intentScore ?? 0, valueKnown:averageTicket > 0 }) },
          optimalHour, log,
        });
        opportunitiesCreated++;
      }
    }

    const leadWallet = spend365.get(lead.id) ?? 0;
    if (snapshot && buyerSpends.length >= 5 && averageWallet > 0 && leadWallet > 0 && leadWallet < averageWallet * 0.6) {
      const gap = averageWallet - leadWallet;
      if (gap > 0 && !(await hasRecentOpportunity(tenantId, lead.id, rules.wallet.id, 120))) {
        const ratio = leadWallet / averageWallet;
        const score = Math.min(92, 65 + Math.round((1 - ratio) * 25));
        await createOpportunity({
          tenantId, lead, rule:rules.wallet, tipo:"potencial_carteira",
          descricao:`Potencial não realizado na carteira de ${lead.nome}`,
          score, valorEstimado:gap,
          facts:{ spendLast365:Number(leadWallet.toFixed(2)), peerAverageSpend:Number(averageWallet.toFixed(2)), estimatedWalletGap:Number(gap.toFixed(2)), buyerCohortSize:buyerSpends.length },
          inference:{ signal:"share_of_wallet_gap", focus:"expansão de participação na carteira", confidenceScore:confidenceScore({ purchase:true, cohort:buyerSpends.length >= 10 ? 0.8 : 0.5, valueKnown:true }) },
          optimalHour, log,
        });
        opportunitiesCreated++;
      }
    }

    if (snapshot && snapshot.products.size > 0 && !(await hasRecentOpportunity(tenantId, lead.id, rules.nextProduct.id, 90))) {
      let best: { targetId:string; confidence:number; support:number; origin:string } | null = null;
      const owned = new Set(snapshot.products.keys());
      for (const originId of owned) {
        const originBuyers = buyerIdsByProduct.get(originId);
        if (!originBuyers || originBuyers.size < 2) continue;
        for (const [targetId, targetBuyers] of buyerIdsByProduct) {
          if (targetId === originId || owned.has(targetId)) continue;
          let overlap = 0;
          for (const buyerId of originBuyers) if (targetBuyers.has(buyerId)) overlap++;
          if (overlap < 2) continue;
          const conf = overlap / originBuyers.size;
          if (conf < 0.35) continue;
          if (!best || conf > best.confidence || (conf === best.confidence && overlap > best.support)) best = { targetId, confidence:conf, support:overlap, origin:originId };
        }
      }
      if (best) {
        const samples = productPriceSamples.get(best.targetId) ?? [];
        const estimated = samples.length ? samples.reduce((a,b) => a + b, 0) / samples.length : averageTicket;
        const score = Math.min(94, 68 + Math.round(best.confidence * 22) + Math.min(4, best.support));
        await createOpportunity({
          tenantId, lead, rule:rules.nextProduct, tipo:"cross_sell",
          descricao:`Próximo melhor produto para ${lead.nome}: ${productNames.get(best.targetId) ?? "produto complementar"}`,
          score, valorEstimado:estimated,
          facts:{ originProduct:productNames.get(best.origin) ?? best.origin, suggestedProduct:productNames.get(best.targetId) ?? best.targetId, cohortSupport:best.support, coOccurrenceRate:Number((best.confidence * 100).toFixed(1)) },
          inference:{ signal:"next_best_product", focus:"produto complementar observado em clientes com compra semelhante", confidenceScore:confidenceScore({ purchase:true, cohort:best.confidence, valueKnown:estimated > 0 }) },
          optimalHour, log,
        });
        opportunitiesCreated++;
      }
    }

    const intentRecent = lead.lastIntentUpdate && Date.now() - lead.lastIntentUpdate.getTime() <= 14 * dayMs;
    if ((lead.intentScore ?? 0) >= 70 && intentRecent && !(await hasRecentOpportunity(tenantId, lead.id, rules.intent.id, 30))) {
      const score = Math.min(98, 76 + Math.round((lead.intentScore ?? 0) * 0.2));
      const estimate = Number(lead.roiEstimate?.ganho_potencial_mes ?? 0) || averageTicket || null;
      await createOpportunity({
        tenantId, lead, rule:rules.intent, tipo:"sinal_praca_ai",
        descricao:`Intenção em alta detectada para ${lead.nome}`,
        score, valorEstimado:estimate,
        facts:{ intentScore:lead.intentScore, lastIntentUpdate:lead.lastIntentUpdate?.toISOString(), propensityScore:lead.propensityScore ?? null },
        inference:{ signal:"intent_spike", focus:"agir enquanto a intenção está recente", confidenceScore:confidenceScore({ purchase:!!snapshot, intent:lead.intentScore ?? 0, explicitSignal:true, valueKnown:!!estimate }) },
        optimalHour, log,
      });
      opportunitiesCreated++;
    }

    const expansion = expansionSignals(lead);
    if (expansion.length > 0 && !(await hasRecentOpportunity(tenantId, lead.id, rules.expansion.id, 120))) {
      const estimate = averageTicket > 0 ? averageTicket * 1.25 : Number(lead.roiEstimate?.ganho_potencial_mes ?? 0) || null;
      await createOpportunity({
        tenantId, lead, rule:rules.expansion, tipo:"sinal_expansao",
        descricao:`Mudança de contexto com potencial de expansão em ${lead.nome}`,
        score:84, valorEstimado:estimate,
        facts:{ expansionSignals:expansion, propensityScore:lead.propensityScore ?? null },
        inference:{ signal:"change_event", focus:"validar se a expansão cria nova demanda", confidenceScore:confidenceScore({ purchase:!!snapshot, explicitSignal:true, intent:lead.intentScore ?? 0, valueKnown:!!estimate }) },
        optimalHour, log,
      });
      opportunitiesCreated++;
    }

    const competitors = competitorNames(lead);
    const competitiveText = normalize(lead.priorityReason ?? "");
    if (snapshot && (competitors.length > 0 || competitiveText.includes("concorrent")) && !(await hasRecentOpportunity(tenantId, lead.id, rules.competitive.id, 90))) {
      await createOpportunity({
        tenantId, lead, rule:rules.competitive, tipo:"risco_competitivo",
        descricao:`Risco competitivo na carteira de ${lead.nome}`,
        score:82, valorEstimado:averageTicket || null,
        facts:{ competitors, priorityReason:lead.priorityReason ?? null, historicalAverageTicket:Number(averageTicket.toFixed(2)) },
        inference:{ signal:"competitive_risk", focus:"proteger relacionamento e receita antes de migração", confidenceScore:confidenceScore({ purchase:true, explicitSignal:true, intent:lead.intentScore ?? 0, valueKnown:averageTicket > 0 }) },
        optimalHour, log,
      });
      opportunitiesCreated++;
    }

    const satisfaction = explicitNumber(lead.metadata, ["nps", "notaSatisfacao", "satisfactionScore", "csat"])
      ?? explicitNumber(lead.discoveryData, ["nps", "notaSatisfacao", "satisfactionScore", "csat"]);
    const promoter = satisfaction !== null && ((satisfaction <= 10 && satisfaction >= 9) || (satisfaction > 10 && satisfaction >= 90));
    if (promoter && !(await hasRecentOpportunity(tenantId, lead.id, rules.referral.id, 180))) {
      await createOpportunity({
        tenantId, lead, rule:rules.referral, tipo:"indicacao",
        descricao:`Cliente promotor com potencial de indicação: ${lead.nome}`,
        score:64, valorEstimado:null,
        facts:{ satisfactionScore:satisfaction, source:"explicit_customer_satisfaction" },
        inference:{ signal:"referral_propensity", focus:"pedir indicação no momento adequado sem pressionar nova compra", confidenceScore:confidenceScore({ purchase:!!snapshot, explicitSignal:true }) },
        optimalHour, log,
      });
      opportunitiesCreated++;
    }
  }

  log.info({ tenantId, vertical:tenant?.vertical, profile:profile.key, customersAnalyzed:leads.length, buyersAnalyzed:snapshots.size, opportunitiesCreated }, "vertical-revenue-scout-v2: concluído");
  return { applicable:true, profile, customersAnalyzed:leads.length, opportunitiesCreated };
}
