import { and, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

type AssignmentCandidate = {
  id: string;
  lastAssignedAt: Date | null;
  platformRole: string;
  userFunction: string | null;
  leadAssignmentEnabled: boolean | null;
  leadAssignmentCities: string[];
  leadAssignmentRegions: string[];
  leadAssignmentSegments: string[];
};

export type LeadAssignmentContext = {
  city?: string | null;
  region?: string | null;
  location?: string | null;
  // Linha/segmento de produto do lead (leads.mercadoSegmento) — ex: loja de
  // peças com vendedor especializado em óleo vs outro em peça de motor.
  segmento?: string | null;
};

export function canReceiveLeads(candidate: Pick<AssignmentCandidate, "platformRole" | "userFunction" | "leadAssignmentEnabled">): boolean {
  if (candidate.leadAssignmentEnabled === false) return false;
  if (candidate.leadAssignmentEnabled === true) return true;
  return candidate.platformRole === "tenant_seller" || candidate.userFunction === "vendedor";
}

function normalizeTerritory(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesTerritory(location: string, territory: string): boolean {
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
 * Distribuição de leads em cascata:
 * 1. vendedores elegíveis configurados pra linha/segmento do lead (quando
 *    o lead já tem mercadoSegmento identificado e algum vendedor cobre
 *    exatamente essa linha — ex: loja de peças, vendedor de óleo vs peça);
 * 2. dentro do grupo acima (ou de todo mundo, se segmento não filtrou
 *    ninguém), aplica o mesmo critério de território já existente:
 *    cidade → região/UF → rodízio geral (sem território configurado) →
 *    qualquer vendedor elegível daquele segmento;
 * 3. fallback final: qualquer vendedor elegível do tenant, sem filtro nenhum.
 *
 * Dentro do grupo escolhido, quem nunca recebeu lead tem prioridade e depois
 * vale o lastAssignedAt mais antigo. Usuários com leadAssignmentEnabled=false
 * nunca entram na distribuição. Null mantém compatibilidade com vendedores antigos.
 */
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

  // Nível 1: segmento/linha. Só restringe o pool se o lead tiver segmento
  // identificado E existir pelo menos um vendedor especializado nele —
  // senão segue com todo mundo (compatível com tenants que não usam segmento).
  const segmentoValue = context.segmento || "";
  const segmentMatches = segmentoValue
    ? candidates.filter((candidate) => candidate.leadAssignmentSegments.some((segmento) => matchesTerritory(segmentoValue, segmento)))
    : [];
  const baseCandidates = segmentMatches.length ? segmentMatches : candidates;

  // Nível 2: território, igual antes, mas já dentro do pool de segmento.
  const cityLocation = context.city || context.location || "";
  const regionLocation = context.region || context.location || "";

  const cityMatches = cityLocation
    ? baseCandidates.filter((candidate) => candidate.leadAssignmentCities.some((city) => matchesTerritory(cityLocation, city)))
    : [];

  const regionMatches = regionLocation
    ? baseCandidates.filter((candidate) => candidate.leadAssignmentRegions.some((region) => matchesTerritory(regionLocation, region)))
    : [];

  const generalPool = baseCandidates.filter(
    (candidate) => candidate.leadAssignmentCities.length === 0 && candidate.leadAssignmentRegions.length === 0,
  );

  const pool = cityMatches.length
    ? cityMatches
    : regionMatches.length
      ? regionMatches
      : generalPool.length
        ? generalPool
        : baseCandidates.length
          ? baseCandidates
          : candidates;

  const seller = [...pool].sort(oldestFirst)[0];
  if (!seller) return null;

  await db
    .update(usersTable)
    .set({ lastAssignedAt: new Date() })
    .where(eq(usersTable.id, seller.id));

  return seller.id;
}
