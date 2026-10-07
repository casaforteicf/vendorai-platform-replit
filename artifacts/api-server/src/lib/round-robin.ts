import { and, eq } from "drizzle-orm";
import { db, usersTable, tenantUserFunctionsTable, tenantDistribuicaoConfigTable } from "@workspace/db";
import { distanceKm } from "./geocoding.js";

export type AssignmentCandidate = {
  id: string;
  lastAssignedAt: Date | null;
  platformRole: string;
  userFunction: string | null;
  leadAssignmentEnabled: boolean | null;
  leadAssignmentCities: string[];
  leadAssignmentRegions: string[];
  leadAssignmentSegments: string[];
  leadAssignmentLat: number | null;
  leadAssignmentLng: number | null;
  leadAssignmentRaioKm: number | null;
};

export type LeadAssignmentContext = {
  city?: string | null;
  region?: string | null;
  location?: string | null;
  // Linha/segmento de produto do lead (leads.mercadoSegmento) — ex: loja de
  // peças com vendedor especializado em óleo vs outro em peça de motor.
  segmento?: string | null;
  // Coordenadas geocodificadas do lead (leads.latitude/longitude), pra
  // desempate por proximidade real quando cidade/região em texto não resolve.
  lat?: number | null;
  lng?: number | null;
};

const CRITERIOS_PADRAO = ["segmento", "territorio"] as const;
export type Criterio = (typeof CRITERIOS_PADRAO)[number];

export function canReceiveLeads(candidate: Pick<AssignmentCandidate, "platformRole" | "userFunction" | "leadAssignmentEnabled">): boolean {
  if (candidate.leadAssignmentEnabled === false) return false;
  if (candidate.leadAssignmentEnabled === true) return true;
  return candidate.platformRole === "tenant_seller" || candidate.userFunction === "vendedor" || candidate.userFunction === "representante_comercial";
}

function normalizeTerritory(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesTerritory(location: string, territory: string): boolean {
  const normalizedLocation = normalizeTerritory(location);
  const normalizedTerritory = normalizeTerritory(territory);
  if (!normalizedLocation || !normalizedTerritory) return false;

  if (normalizedTerritory.length <= 3) {
    const tokens = normalizedLocation.split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.includes(normalizedTerritory);
  }

  return normalizedLocation.includes(normalizedTerritory);
}

function oldestFirst(a: AssignmentCandidate, b: AssignmentCandidate): number {
  if (!a.lastAssignedAt && b.lastAssignedAt) return -1;
  if (a.lastAssignedAt && !b.lastAssignedAt) return 1;
  if (!a.lastAssignedAt && !b.lastAssignedAt) return a.id.localeCompare(b.id);
  return a.lastAssignedAt!.getTime() - b.lastAssignedAt!.getTime();
}

/**
 * Busca a ordem de critérios configurada pro tenant. Sem linha cadastrada
 * (a maioria dos tenants hoje) = ordem padrão ["segmento","territorio"],
 * que é exatamente o comportamento de antes desta config existir — não
 * quebra ninguém que já estava usando cidade/região sem saber que "segmento"
 * também existe.
 */
async function getCriteriosOrdenados(tenantId: string): Promise<Criterio[]> {
  const [config] = await db
    .select({ criterios: tenantDistribuicaoConfigTable.criterios })
    .from(tenantDistribuicaoConfigTable)
    .where(eq(tenantDistribuicaoConfigTable.tenantId, tenantId));

  const criterios = config?.criterios;
  if (!Array.isArray(criterios) || criterios.length === 0) return [...CRITERIOS_PADRAO];

  const validos = criterios.filter((c): c is Criterio => CRITERIOS_PADRAO.includes(c as Criterio));
  return validos.length ? validos : [...CRITERIOS_PADRAO];
}

/**
 * Restringe pelo segmento/linha do lead. Retorna null (sem restringir) se
 * o lead não tem segmento identificado, ou se nenhum candidato do pool
 * atual cobre essa linha — nesse caso o critério simplesmente não filtra
 * nada, e o próximo critério da ordem roda sobre o pool original.
 */
export function narrowBySegmento(pool: AssignmentCandidate[], context: LeadAssignmentContext): AssignmentCandidate[] | null {
  const segmentoValue = context.segmento || "";
  if (!segmentoValue) return null;
  const matches = pool.filter((candidate) => candidate.leadAssignmentSegments.some((segmento) => matchesTerritory(segmentoValue, segmento)));
  return matches.length ? matches : null;
}

/**
 * Restringe por território, em cascata: cidade → região/UF → raio de
 * distância → rodízio geral (vendedores sem território configurado dentro
 * do pool). Cada nível só é tentado se o anterior não achou ninguém.
 * Retorna null se nada da cascata achou match — o critério não filtra nada.
 */
export function narrowByTerritorio(pool: AssignmentCandidate[], context: LeadAssignmentContext): AssignmentCandidate[] | null {
  const cityLocation = context.city || context.location || "";
  const regionLocation = context.region || context.location || "";

  const cityMatches = cityLocation
    ? pool.filter((candidate) => candidate.leadAssignmentCities.some((city) => matchesTerritory(cityLocation, city)))
    : [];
  if (cityMatches.length) return cityMatches;

  const regionMatches = regionLocation
    ? pool.filter((candidate) => candidate.leadAssignmentRegions.some((region) => matchesTerritory(regionLocation, region)))
    : [];
  if (regionMatches.length) return regionMatches;

  // Raio: só entra se o lead já tem coordenadas (geocodificado) e existe
  // vendedor com ponto-base + raio configurados. Ordena pelo mais perto —
  // aqui o critério é proximidade de verdade, não fila (diferente do
  // desempate final por lastAssignedAt, que só decide entre empatados).
  if (context.lat != null && context.lng != null) {
    const raioMatches = pool
      .filter((c) => c.leadAssignmentLat != null && c.leadAssignmentLng != null && c.leadAssignmentRaioKm != null)
      .map((c) => ({
        candidate: c,
        distancia: distanceKm({ lat: context.lat!, lng: context.lng! }, { lat: c.leadAssignmentLat!, lng: c.leadAssignmentLng! }),
      }))
      .filter(({ candidate, distancia }) => distancia <= candidate.leadAssignmentRaioKm!)
      .sort((a, b) => a.distancia - b.distancia)
      .map(({ candidate }) => candidate);
    if (raioMatches.length) return raioMatches;
  }

  // Geral: vendedores sem NENHUM território configurado (cidade, região e
  // raio) — quem só configurou raio e ficou de fora do alcance não cai
  // aqui, porque configurar raio é uma restrição geográfica explícita,
  // não deveria acabar recebendo lead de qualquer lugar por omissão.
  const generalPool = pool.filter(
    (candidate) =>
      candidate.leadAssignmentCities.length === 0 &&
      candidate.leadAssignmentRegions.length === 0 &&
      candidate.leadAssignmentRaioKm == null,
  );
  if (generalPool.length) return generalPool;

  return null;
}

/**
 * Distribuição de leads pra vendedor. A ordem dos critérios (segmento x
 * território) é configurável por tenant via tenant_distribuicao_config;
 * sem config, roda "segmento" primeiro e "território" desempata dentro do
 * grupo — é o caso "loja de peças: separa por linha, dentro da linha
 * separa por região". Território em si já é uma cascata interna (cidade →
 * região → raio → geral).
 *
 * Cada critério só restringe o pool se achar pelo menos um match; senão o
 * pool passa pro próximo critério sem filtrar nada (nunca zera a lista à
 * toa). Fallback final: qualquer vendedor elegível do tenant.
 *
 * Dentro do grupo final, quem nunca recebeu lead tem prioridade e depois
 * vale o lastAssignedAt mais antigo (exceto no caso de raio, que já vem
 * ordenado por distância — o mais próximo é escolhido direto).
 */
export type LeadResponsibilityAssignment =
  | { kind: "user"; id: string }
  | { kind: "external_company"; id: string };

/**
 * Mesmo motor de distribuição para usuários internos e equipes/empresas
 * externas comerciais. O critério, território, segmento, raio e fila são
 * exatamente os mesmos; muda apenas onde a responsabilidade é persistida.
 */
export async function pickNextLeadResponsibility(
  tenantId: string,
  context: LeadAssignmentContext = {},
): Promise<LeadResponsibilityAssignment | null> {
  const [userRows, externalRows] = await Promise.all([
    db.select({
      id: usersTable.id,
      lastAssignedAt: usersTable.lastAssignedAt,
      platformRole: usersTable.platformRole,
      userFunction: usersTable.userFunction,
      leadAssignmentEnabled: usersTable.leadAssignmentEnabled,
      leadAssignmentCities: usersTable.leadAssignmentCities,
      leadAssignmentRegions: usersTable.leadAssignmentRegions,
      leadAssignmentSegments: usersTable.leadAssignmentSegments,
      leadAssignmentLat: usersTable.leadAssignmentLat,
      leadAssignmentLng: usersTable.leadAssignmentLng,
      leadAssignmentRaioKm: usersTable.leadAssignmentRaioKm,
    }).from(usersTable).where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.active, true))),
    db.select({
      id: tenantUserFunctionsTable.id,
      lastAssignedAt: tenantUserFunctionsTable.lastAssignedAt,
      systemKey: tenantUserFunctionsTable.systemKey,
      leadAssignmentEnabled: tenantUserFunctionsTable.leadAssignmentEnabled,
      leadAssignmentCities: tenantUserFunctionsTable.leadAssignmentCities,
      leadAssignmentRegions: tenantUserFunctionsTable.leadAssignmentRegions,
      leadAssignmentSegments: tenantUserFunctionsTable.leadAssignmentSegments,
      leadAssignmentLat: tenantUserFunctionsTable.leadAssignmentLat,
      leadAssignmentLng: tenantUserFunctionsTable.leadAssignmentLng,
      leadAssignmentRaioKm: tenantUserFunctionsTable.leadAssignmentRaioKm,
    }).from(tenantUserFunctionsTable).where(and(
      eq(tenantUserFunctionsTable.tenantId, tenantId),
      eq(tenantUserFunctionsTable.kind, "external_company"),
    )),
  ]);

  const candidates: Array<AssignmentCandidate & { assignmentKind: "user" | "external_company" }> = [
    ...userRows
      .filter(canReceiveLeads)
      .map((candidate) => ({
        ...candidate,
        assignmentKind: "user" as const,
        leadAssignmentCities: Array.isArray(candidate.leadAssignmentCities) ? candidate.leadAssignmentCities : [],
        leadAssignmentRegions: Array.isArray(candidate.leadAssignmentRegions) ? candidate.leadAssignmentRegions : [],
        leadAssignmentSegments: Array.isArray(candidate.leadAssignmentSegments) ? candidate.leadAssignmentSegments : [],
      })),
    ...externalRows
      .map((candidate) => ({
        id: candidate.id,
        lastAssignedAt: candidate.lastAssignedAt,
        platformRole: "external_company",
        userFunction: candidate.systemKey,
        leadAssignmentEnabled: candidate.leadAssignmentEnabled,
        leadAssignmentCities: Array.isArray(candidate.leadAssignmentCities) ? candidate.leadAssignmentCities : [],
        leadAssignmentRegions: Array.isArray(candidate.leadAssignmentRegions) ? candidate.leadAssignmentRegions : [],
        leadAssignmentSegments: Array.isArray(candidate.leadAssignmentSegments) ? candidate.leadAssignmentSegments : [],
        leadAssignmentLat: candidate.leadAssignmentLat,
        leadAssignmentLng: candidate.leadAssignmentLng,
        leadAssignmentRaioKm: candidate.leadAssignmentRaioKm,
        assignmentKind: "external_company" as const,
      }))
      .filter(canReceiveLeads),
  ];

  if (!candidates.length) return null;

  const ordem = await getCriteriosOrdenados(tenantId);
  let pool = candidates;
  let raioJaOrdenou = false;
  for (const criterio of ordem) {
    if (criterio === "segmento") {
      pool = (narrowBySegmento(pool, context) as typeof pool | null) ?? pool;
    } else if (criterio === "territorio") {
      const before = pool;
      pool = (narrowByTerritorio(pool, context) as typeof pool | null) ?? pool;
      raioJaOrdenou = pool !== before && pool.some((candidate) => candidate.leadAssignmentLat != null);
    }
  }

  const selected = raioJaOrdenou ? pool[0] : [...pool].sort(oldestFirst)[0];
  if (!selected) return null;

  const assignedAt = new Date();
  if (selected.assignmentKind === "user") {
    await db.update(usersTable).set({ lastAssignedAt: assignedAt }).where(eq(usersTable.id, selected.id));
  } else {
    await db.update(tenantUserFunctionsTable).set({ lastAssignedAt: assignedAt }).where(eq(tenantUserFunctionsTable.id, selected.id));
  }

  return { kind: selected.assignmentKind, id: selected.id };
}

export async function pickNextVendedor(
  tenantId: string,
  context: LeadAssignmentContext = {},
): Promise<string | null> {
  const rows = await db
    .select({
      id: usersTable.id,
      lastAssignedAt: usersTable.lastAssignedAt,
      platformRole: usersTable.platformRole,
      userFunction: usersTable.userFunction,
      leadAssignmentEnabled: usersTable.leadAssignmentEnabled,
      leadAssignmentCities: usersTable.leadAssignmentCities,
      leadAssignmentRegions: usersTable.leadAssignmentRegions,
      leadAssignmentSegments: usersTable.leadAssignmentSegments,
      leadAssignmentLat: usersTable.leadAssignmentLat,
      leadAssignmentLng: usersTable.leadAssignmentLng,
      leadAssignmentRaioKm: usersTable.leadAssignmentRaioKm,
    })
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.active, true)));

  const candidates: AssignmentCandidate[] = rows
    .filter(canReceiveLeads)
    .map((candidate) => ({
      ...candidate,
      leadAssignmentCities: Array.isArray(candidate.leadAssignmentCities) ? candidate.leadAssignmentCities : [],
      leadAssignmentRegions: Array.isArray(candidate.leadAssignmentRegions) ? candidate.leadAssignmentRegions : [],
      leadAssignmentSegments: Array.isArray(candidate.leadAssignmentSegments) ? candidate.leadAssignmentSegments : [],
    }));

  if (!candidates.length) return null;

  const ordem = await getCriteriosOrdenados(tenantId);

  let pool = candidates;
  let raioJaOrdenou = false;
  for (const criterio of ordem) {
    if (criterio === "segmento") {
      pool = narrowBySegmento(pool, context) ?? pool;
    } else if (criterio === "territorio") {
      const before = pool;
      pool = narrowByTerritorio(pool, context) ?? pool;
      // Detecta se quem decidiu foi o nível de raio (pool já vem ordenado
      // por distância nesse caso) pra pular o sort por fila mais abaixo.
      raioJaOrdenou = pool !== before && pool.some((c) => c.leadAssignmentLat != null);
    }
  }

  if (!pool.length) pool = candidates;

  const seller = raioJaOrdenou ? pool[0] : [...pool].sort(oldestFirst)[0];
  if (!seller) return null;

  await db
    .update(usersTable)
    .set({ lastAssignedAt: new Date() })
    .where(eq(usersTable.id, seller.id));

  return seller.id;
}
