import { and, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
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

async function ensureRule(tenantId: string, profile: VerticalRevenueProfile, dormant: boolean) {
  const tipo = dormant ? "reativacao" : profile.cycleType;
  const nome = `Revenue Scout · ${profile.label} · ${tipo}`;
  const [existing] = await db.select().from(scoutRegrasTable)
    .where(and(eq(scoutRegrasTable.tenantId, tenantId), eq(scoutRegrasTable.nome, nome))).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(scoutRegrasTable).values({
    tenantId,
    nome,
    tipo,
    condicoes: { engine:"vertical_revenue_v1", vertical:profile.key, dias: dormant ? profile.dormantDays : profile.cycleDays },
    acao: { canal:"human_approval", automaticContact:false },
    ativo:true,
  }).returning();
  return created!;
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
  const leads = await db.select({ id:leadsTable.id, nome:leadsTable.nome }).from(leadsTable)
    .where(eq(leadsTable.tenantId, tenantId));
  const names = new Map(leads.map(lead => [lead.id, lead.nome]));
  const snapshots = new Map<string, { dates:Date[]; totals:number[]; products:string[] }>();
  for (const proposal of proposals) {
    if (!proposal.leadId) continue;
    const snapshot = snapshots.get(proposal.leadId) ?? { dates:[], totals:[], products:[] };
    snapshot.dates.push(proposal.acceptedAt ?? proposal.updatedAt);
    snapshot.totals.push(Number(proposal.valorTotal ?? 0));
    snapshot.products.push(...((proposal.itens ?? []) as PropostaItem[]).map(item => item.nome));
    snapshots.set(proposal.leadId, snapshot);
  }

  const rules = { cycle:await ensureRule(tenantId, profile, false), dormant:await ensureRule(tenantId, profile, true) };
  let opportunitiesCreated = 0;
  const dayMs = 86_400_000;
  for (const [leadId, snapshot] of snapshots) {
    const lastPurchase = snapshot.dates.sort((a,b) => b.getTime() - a.getTime())[0];
    if (!lastPurchase) continue;
    const days = Math.max(0, Math.floor((Date.now() - lastPurchase.getTime()) / dayMs));
    if (days < profile.cycleDays) continue;
    const dormant = days >= profile.dormantDays;
    const rule = dormant ? rules.dormant : rules.cycle;
    const [existing] = await db.select({ id:scoutOportunidadesTable.id, status:scoutOportunidadesTable.status })
      .from(scoutOportunidadesTable).where(and(
        eq(scoutOportunidadesTable.tenantId, tenantId), eq(scoutOportunidadesTable.clienteId, leadId), eq(scoutOportunidadesTable.regraId, rule.id),
      )).orderBy(desc(scoutOportunidadesTable.createdAt)).limit(1);
    if (existing && !["ignorado", "converteu"].includes(existing.status ?? "")) continue;
    const totals = snapshot.totals.filter(value => Number.isFinite(value) && value > 0);
    const average = totals.length ? totals.reduce((sum,value) => sum + value, 0) / totals.length : 0;
    const threshold = dormant ? profile.dormantDays : profile.cycleDays;
    const score = Math.min(100, (dormant ? 58 : 70) + Math.round(Math.min(25, ((days - threshold) / threshold) * 25)));
    const products = [...new Set(snapshot.products)].slice(0, 5);
    await db.insert(scoutOportunidadesTable).values({
      tenantId, clienteId:leadId, regraId:rule.id, tipo:dormant ? "reativacao" : profile.cycleType,
      descricao:dormant ? `Reativar ${names.get(leadId) ?? leadId}: ${days} dias sem nova movimentação` : `${profile.cycleLabel} para ${names.get(leadId) ?? leadId}`,
      valorEstimado:String(Number(average.toFixed(2))), status:"pendente_aprovacao", canal:"human_approval",
      scoreOportunidade:String(score), humanRequired:true, blocked:false,
      explanation:{
        facts:{ vertical:tenant?.vertical, lastPurchaseAt:lastPurchase.toISOString(), daysSinceLastPurchase:days, acceptedPurchases:snapshot.dates.length, averageTicket:Number(average.toFixed(2)), recentItems:products },
        inference:{ signal:dormant ? "reativacao" : profile.cycleType, thresholdDays:threshold, focus:profile.focus },
        autonomy:{ mode:"human_approval", automaticContact:false, requiredAction:"Validar contexto, disponibilidade e condição comercial antes do contato." },
      },
    });
    captureLeadFeatureSnapshot(tenantId, leadId, "scout_oportunidade_criada", { tipoRegra: dormant ? "reativacao" : profile.cycleType }, log).catch(() => {});
    opportunitiesCreated += 1;
  }
  log.info({ tenantId, vertical:tenant?.vertical, profile:profile.key, customersAnalyzed:snapshots.size, opportunitiesCreated }, "vertical-revenue-scout: concluído");
  return { applicable:true, profile, customersAnalyzed:snapshots.size, opportunitiesCreated };
}
