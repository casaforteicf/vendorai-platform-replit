import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import {
  db, vehiclesTable, vehicleLookupCacheTable, vehicleLookupHistoryTable,
} from "@workspace/db";
import { VEHICLE_BRAND_ALIASES } from "./vehicle-brand-aliases.js";

export type VehicleQueryType = "plate" | "chassis";
export type VehicleData = {
  plate: string | null; chassis: string | null; renavam: string | null;
  brand: string | null; model: string | null; version: string | null;
  rawDescription: string | null; fullName: string | null;
  manufactureYear: number | null; modelYear: number | null; fuel: string | null;
  engine: string | null; transmission: string | null; powerHp: number | null;
  color: string | null; vehicleType: string | null; fipeCode: string | null;
  source: string; confidence: number; confidenceReasons: string[]; possibleVersions: string[];
  providerData?: Record<string, unknown>;
};
export type ProviderResult = Partial<VehicleData> & { rawDescription?: string | null; source: string; providerData?: Record<string, unknown> };

export interface VehicleLookupProvider {
  readonly name: string;
  lookupByPlate(plate: string): Promise<ProviderResult | null>;
  lookupByChassis(chassis: string): Promise<ProviderResult | null>;
}

export function normalizeVehicleQuery(value: string): string {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function detectVehicleQueryType(value: string): VehicleQueryType | null {
  const query = normalizeVehicleQuery(value);
  if (/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(query)) return "plate";
  if (/^[A-HJ-NPR-Z0-9]{8,30}$/.test(query)) return "chassis";
  return null;
}
export function validateVehicleQuery(value: string): { valid: boolean; query: string; type: VehicleQueryType | null } {
  const query = normalizeVehicleQuery(value);
  const type = detectVehicleQueryType(query);
  return { valid: type !== null, query, type };
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase());
}

function sanitizeProviderData(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const blocked = /propriet|owner|cpf|cnpj|endere[cç]o|address|telefone|phone|email|nome.*propriet/i;
  return Object.fromEntries(Object.entries(input).filter(([key]) => !blocked.test(key)).map(([key, value]) => [
    key,
    value && typeof value === "object" && !Array.isArray(value) ? sanitizeProviderData(value as Record<string, unknown>) : value,
  ]));
}

export class VehicleNormalizer {
  normalize(raw: ProviderResult, type: VehicleQueryType, query: string): VehicleData {
    const description = raw.rawDescription?.trim() || null;
    const tokens = description?.split(/[\/\s]+/).filter(Boolean) ?? [];
    const rawBrand = raw.brand?.trim() || tokens[0] || null;
    const brand = rawBrand ? (VEHICLE_BRAND_ALIASES[rawBrand.toUpperCase()] ?? titleCase(rawBrand)) : null;
    const model = raw.model?.trim() ? titleCase(raw.model) : null;
    const version = raw.version?.trim() ? raw.version.trim() : null;
    const reasons: string[] = [];
    if ((type === "plate" && (raw.plate || query)) || (type === "chassis" && (raw.chassis || query))) reasons.push(`${type}_confirmed`);
    if (brand && model) reasons.push("brand_model_confirmed");
    if (raw.modelYear) reasons.push("model_year_confirmed");
    if (version) reasons.push("version_confirmed_by_source");
    let confidence = raw.confidence ?? 0.55;
    if (reasons.includes("brand_model_confirmed")) confidence += 0.2;
    if (reasons.includes("model_year_confirmed")) confidence += 0.1;
    if (reasons.includes("version_confirmed_by_source")) confidence += 0.1;
    if ((raw.possibleVersions?.length ?? 0) > 1) confidence = Math.min(confidence, 0.69);
    confidence = Math.min(1, Math.max(0, confidence));
    const fullName = raw.fullName?.trim() || [brand, model, version].filter(Boolean).join(" ") || null;
    return {
      plate: type === "plate" ? query : raw.plate ?? null,
      chassis: type === "chassis" ? query : raw.chassis ?? null,
      renavam: raw.renavam ?? null, brand, model, version, rawDescription: description, fullName,
      manufactureYear: raw.manufactureYear ?? null, modelYear: raw.modelYear ?? null,
      fuel: raw.fuel ?? null, engine: raw.engine ?? null, transmission: raw.transmission ?? null,
      powerHp: raw.powerHp ?? null, color: raw.color ?? null, vehicleType: raw.vehicleType ?? null,
      fipeCode: raw.fipeCode ?? null, source: raw.source, confidence,
      confidenceReasons: [...new Set([...(raw.confidenceReasons ?? []), ...reasons])],
      possibleVersions: raw.possibleVersions ?? [], providerData: sanitizeProviderData(raw.providerData),
    };
  }
}

const MOCKS: Record<string, ProviderResult> = {
  ABC1D23: { plate: "ABC1D23", chassis: "9BWZZZ377VT004251", brand: "VW", model: "T-Cross", version: "Highline 250 TSI", rawDescription: "VW/T CROSS HL TSI AE", manufactureYear: 2024, modelYear: 2025, fuel: "Flex", engine: "1.4 TSI", transmission: "Automático", powerHp: 150, color: "Branco", vehicleType: "Automóvel", source: "MOCK", confidence: 0.58 },
  ABC1234: { plate: "ABC1234", brand: "GM", model: "Corsa", manufactureYear: 1999, modelYear: 2000, fuel: "Gasolina", source: "MOCK", confidence: 0.58 },
  "9BWZZZ377VT004251": { plate: "ABC1D23", chassis: "9BWZZZ377VT004251", brand: "VW", model: "T-Cross", possibleVersions: ["Comfortline", "Highline", "Extreme"], modelYear: 2025, source: "MOCK", confidence: 0.45 },
};
export class MockVehicleProvider implements VehicleLookupProvider {
  readonly name = "mock";
  async lookupByPlate(plate: string) { return MOCKS[plate] ?? null; }
  async lookupByChassis(chassis: string) { return MOCKS[chassis] ?? null; }
}

export class SenatranVehicleProvider implements VehicleLookupProvider {
  readonly name = "senatran";
  private async lookup(type: VehicleQueryType, query: string): Promise<ProviderResult | null> {
    const baseUrl = process.env.VEHICLE_LOOKUP_SENATRAN_BASE_URL;
    const token = process.env.VEHICLE_LOOKUP_SENATRAN_TOKEN;
    if (!baseUrl || !token) throw Object.assign(new Error("SENATRAN_NOT_CONFIGURED"), { code: "PROVIDER_NOT_CONFIGURED" });
    const timeoutMs = Number(process.env.VEHICLE_LOOKUP_TIMEOUT_MS ?? 8000);
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/vehicles/${type}/${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw Object.assign(new Error(`SENATRAN_HTTP_${response.status}`), { code: "PROVIDER_ERROR" });
    const data = await response.json() as Record<string, unknown>;
    return { ...(data as ProviderResult), source: "SENATRAN", providerData: data };
  }
  lookupByPlate(plate: string) { return this.lookup("plate", plate); }
  lookupByChassis(chassis: string) { return this.lookup("chassis", chassis); }
}

function providerFromEnv(): VehicleLookupProvider {
  return (process.env.VEHICLE_LOOKUP_PROVIDER ?? "mock").toLowerCase() === "senatran"
    ? new SenatranVehicleProvider() : new MockVehicleProvider();
}
const mask = (value: string) => value.length <= 4 ? "****" : `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;

export class VehicleLookupService {
  constructor(private provider: VehicleLookupProvider = providerFromEnv(), private normalizer = new VehicleNormalizer()) {}
  async lookup(tenantId: string, input: string) {
    const started = Date.now();
    const parsed = validateVehicleQuery(input);
    if (!parsed.valid || !parsed.type) throw Object.assign(new Error("Placa ou chassi inválido."), { code: "INVALID_QUERY", status: 422 });
    const hash = createHash("sha256").update(`${tenantId}:${parsed.type}:${parsed.query}`).digest("hex");
    const [cached] = await db.select({ vehicle: vehiclesTable }).from(vehicleLookupCacheTable)
      .innerJoin(vehiclesTable, eq(vehiclesTable.id, vehicleLookupCacheTable.vehicleId))
      .where(and(eq(vehicleLookupCacheTable.tenantId, tenantId), eq(vehicleLookupCacheTable.lookupType, parsed.type), eq(vehicleLookupCacheTable.lookupHash, hash), gt(vehicleLookupCacheTable.expiresAt, new Date())))
      .limit(1);
    if (cached) return { success: true, searchType: parsed.type, vehicle: this.publicVehicle(cached.vehicle), cacheHit: true };
    try {
      const raw = parsed.type === "plate" ? await this.provider.lookupByPlate(parsed.query) : await this.provider.lookupByChassis(parsed.query);
      if (!raw) {
        await this.history(tenantId, parsed.type, parsed.query, null, false, started, "NOT_FOUND");
        return { success: false, searchType: parsed.type, vehicle: null, errorCode: "NOT_FOUND" };
      }
      const vehicle = this.normalizer.normalize(raw, parsed.type, parsed.query);
      const identity = vehicle.plate ? eq(vehiclesTable.plate, vehicle.plate) : eq(vehiclesTable.chassis, vehicle.chassis!);
      const [existing] = await db.select().from(vehiclesTable).where(and(eq(vehiclesTable.tenantId, tenantId), identity));
      const values = { ...vehicle, confidence: String(vehicle.confidence), providerData: vehicle.providerData ?? null, lastVerifiedAt: new Date(), updatedAt: new Date() };
      const [saved] = existing
        ? await db.update(vehiclesTable).set(values).where(eq(vehiclesTable.id, existing.id)).returning()
        : await db.insert(vehiclesTable).values({ id: crypto.randomUUID(), tenantId, ...values }).returning();
      const ttl = Number(process.env.VEHICLE_LOOKUP_CACHE_TTL ?? 86400);
      await db.delete(vehicleLookupCacheTable).where(and(eq(vehicleLookupCacheTable.tenantId, tenantId), eq(vehicleLookupCacheTable.lookupType, parsed.type), eq(vehicleLookupCacheTable.lookupHash, hash)));
      await db.insert(vehicleLookupCacheTable).values({ id: crypto.randomUUID(), tenantId, lookupType: parsed.type, lookupHash: hash, vehicleId: saved!.id, provider: this.provider.name, expiresAt: new Date(Date.now() + ttl * 1000) });
      await this.history(tenantId, parsed.type, parsed.query, saved!.id, true, started, null);
      return { success: true, searchType: parsed.type, vehicle: this.publicVehicle(saved!), cacheHit: false };
    } catch (error) {
      const code = (error as { code?: string; name?: string }).code ?? ((error as Error).name === "TimeoutError" ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR");
      await this.history(tenantId, parsed.type, parsed.query, null, false, started, code);
      throw Object.assign(new Error(code === "PROVIDER_TIMEOUT" ? "A consulta demorou além do limite." : "Não foi possível consultar o provedor."), { code, status: code === "PROVIDER_TIMEOUT" ? 504 : 502 });
    }
  }
  private publicVehicle(v: typeof vehiclesTable.$inferSelect) {
    const { providerData: _providerData, tenantId: _tenantId, ...safe } = v;
    return { ...safe, confidence: Number(v.confidence) };
  }
  private async history(tenantId: string, type: VehicleQueryType, query: string, vehicleId: string | null, success: boolean, started: number, errorCode: string | null) {
    await db.insert(vehicleLookupHistoryTable).values({ id: crypto.randomUUID(), tenantId, queryType: type, queryMasked: mask(query), vehicleId, provider: this.provider.name, success, durationMs: Date.now() - started, errorCode });
  }
}
