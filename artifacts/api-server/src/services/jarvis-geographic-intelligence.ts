import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, jarvisCasesTable, leadsTable } from "@workspace/db";

export type JarvisGeoPointKind = "lead" | "risk" | "opportunity" | "attention" | "signal";

export type JarvisGeoPoint = {
  id: string;
  kind: JarvisGeoPointKind;
  latitude: number;
  longitude: number;
  label: string;
  weight: number;
  source: "lead_coordinates" | "case_evidence";
  caseId?: string;
  leadId?: string;
};

function compact(value: string | null | undefined, max = 160) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function asCoordinate(raw: unknown, min: number, max: number) {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function evidenceCoordinates(evidence: Record<string, unknown> | null) {
  if (!evidence) return null;
  const nested = [evidence, evidence.location, evidence.geo, evidence.coordinates]
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));

  for (const item of nested) {
    const latitude = asCoordinate(item.latitude ?? item.lat, -90, 90);
    const longitude = asCoordinate(item.longitude ?? item.lng ?? item.lon ?? item.long, -180, 180);
    if (latitude != null && longitude != null) return { latitude, longitude };
  }
  return null;
}

function caseKind(severity: string): JarvisGeoPointKind {
  if (severity === "risk") return "risk";
  if (severity === "opportunity") return "opportunity";
  if (severity === "attention") return "attention";
  return "signal";
}

function caseWeight(severity: string, impact: number | null, confidence: number | null) {
  const severityBase = severity === "risk" ? 80 : severity === "opportunity" ? 70 : severity === "attention" ? 50 : 35;
  const impactPart = impact == null ? 0 : Math.max(0, Math.min(100, impact)) * 0.12;
  const confidencePart = confidence == null ? 0 : Math.max(0, Math.min(100, confidence)) * 0.08;
  return Math.min(100, Math.round(severityBase + impactPart + confidencePart));
}

export async function loadJarvisGeographicIntelligence(tenantId: string) {
  const [leads, cases] = await Promise.all([
    db
      .select({
        id: leadsTable.id,
        nome: leadsTable.nome,
        empresa: leadsTable.empresa,
        latitude: leadsTable.latitude,
        longitude: leadsTable.longitude,
        status: leadsTable.status,
        updatedAt: leadsTable.updatedAt,
      })
      .from(leadsTable)
      .where(and(
        eq(leadsTable.tenantId, tenantId),
        isNull(leadsTable.excluidoEm),
        isNotNull(leadsTable.latitude),
        isNotNull(leadsTable.longitude),
      ))
      .orderBy(desc(leadsTable.updatedAt))
      .limit(500),
    db
      .select({
        id: jarvisCasesTable.id,
        title: jarvisCasesTable.title,
        severity: jarvisCasesTable.severity,
        impact: jarvisCasesTable.impact,
        confidence: jarvisCasesTable.confidence,
        evidence: jarvisCasesTable.evidence,
        status: jarvisCasesTable.status,
        updatedAt: jarvisCasesTable.updatedAt,
      })
      .from(jarvisCasesTable)
      .where(and(
        eq(jarvisCasesTable.tenantId, tenantId),
        eq(jarvisCasesTable.status, "open"),
      ))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(300),
  ]);

  const points: JarvisGeoPoint[] = [];

  for (const lead of leads) {
    const latitude = asCoordinate(lead.latitude, -90, 90);
    const longitude = asCoordinate(lead.longitude, -180, 180);
    if (latitude == null || longitude == null) continue;
    points.push({
      id: `lead:${lead.id}`,
      kind: "lead",
      latitude,
      longitude,
      label: compact(lead.empresa ? `${lead.nome} — ${lead.empresa}` : lead.nome),
      weight: 25,
      source: "lead_coordinates",
      leadId: lead.id,
    });
  }

  for (const item of cases) {
    const coordinates = evidenceCoordinates(item.evidence);
    if (!coordinates) continue;
    points.push({
      id: `case:${item.id}`,
      kind: caseKind(item.severity),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      label: compact(item.title),
      weight: caseWeight(item.severity, item.impact, item.confidence),
      source: "case_evidence",
      caseId: item.id,
    });
  }

  const geographicCases = points.filter((item) => item.source === "case_evidence");
  return {
    generatedAt: new Date(),
    summary: {
      totalPoints: points.length,
      geocodedLeads: points.filter((item) => item.kind === "lead").length,
      geographicCases: geographicCases.length,
      risks: geographicCases.filter((item) => item.kind === "risk").length,
      opportunities: geographicCases.filter((item) => item.kind === "opportunity").length,
      attention: geographicCases.filter((item) => item.kind === "attention").length,
      casesWithoutCoordinates: cases.length - geographicCases.length,
    },
    points,
  };
}
