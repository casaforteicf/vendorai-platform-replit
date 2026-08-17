import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
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
  private certificate(): Buffer {
    const encoded = process.env.VEHICLE_LOOKUP_SENATRAN_CERT_BASE64?.trim();
    if (encoded) return Buffer.from(encoded, "base64");
    const path = process.env.VEHICLE_LOOKUP_SENATRAN_CERT_PATH?.trim();
    if (path) return readFileSync(path);
    throw Object.assign(new Error("SENATRAN_CERTIFICATE_NOT_CONFIGURED"), { code: "PROVIDER_NOT_CONFIGURED" });
  }
  private officialVehicle(data: Record<string, unknown>): ProviderResult | null {
    const collection = Array.isArray(data.veiculo) ? data.veiculo : Array.isArray(data.veiculos) ? data.veiculos : null;
    const row = (collection?.[0] ?? data) as Record<string, unknown>;
    if (!row || (!row.placa && !row.chassi && !row.codigoRenavam)) return null;
    const description = String(row.descricaoMarcaModelo ?? "").trim() || null;
    const [brandToken, ...modelTokens] = description?.split(/[\/\s]+/).filter(Boolean) ?? [];
    return {
      plate: row.placa ? String(row.placa) : null, chassis: row.chassi ? String(row.chassi) : null,
      renavam: row.codigoRenavam ? String(row.codigoRenavam) : null, brand: brandToken || null,
      model: modelTokens.join(" ") || description, rawDescription: description,
      manufactureYear: Number.isFinite(Number(row.anoFabricacao)) ? Number(row.anoFabricacao) : null,
      modelYear: Number.isFinite(Number(row.anoModelo)) ? Number(row.anoModelo) : null,
      fuel: row.descricaoCombustivel ? String(row.descricaoCombustivel) : null,
      engine: row.cilindradas ? `${row.cilindradas} cc` : null,
      powerHp: Number.isFinite(Number(row.potencia)) ? Number(row.potencia) : null,
      color: row.descricaoCor ? String(row.descricaoCor) : null,
      vehicleType: row.descricaoTipoVeiculo ? String(row.descricaoTipoVeiculo) : null,
      source: "SENATRAN", confidence: 0.95, confidenceReasons: ["official_senatran_registry"], providerData: data,
    };
  }
  private request(url: URL, timeoutMs: number): Promise<Record<string, unknown>> {
    const cpf = String(process.env.VEHICLE_LOOKUP_SENATRAN_USER_CPF ?? "").replace(/\D/g, "");
    const passphrase = process.env.VEHICLE_LOOKUP_SENATRAN_CERT_PASSPHRASE;
    if (cpf.length !== 11 || !passphrase) return Promise.reject(Object.assign(new Error("SENATRAN_CREDENTIALS_NOT_CONFIGURED"), { code: "PROVIDER_NOT_CONFIGURED" }));
    return new Promise((resolve, reject) => {
      const req = httpsRequest(url, { method: "GET", pfx: this.certificate(), passphrase,
        headers: { Accept: "application/json", "x-cpf-usuario": cpf }, rejectUnauthorized: true, timeout: timeoutMs }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode === 404) return resolve({});
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) return reject(Object.assign(new Error(`SENATRAN_HTTP_${res.statusCode ?? 0}`), { code: res.statusCode === 401 || res.statusCode === 403 ? "PROVIDER_UNAUTHORIZED" : "PROVIDER_ERROR" }));
          try { resolve(body ? JSON.parse(body) as Record<string, unknown> : {}); }
          catch { reject(Object.assign(new Error("SENATRAN_INVALID_RESPONSE"), { code: "PROVIDER_ERROR" })); }
        });
      });
      req.on("timeout", () => req.destroy(Object.assign(new Error("SENATRAN_TIMEOUT"), { code: "PROVIDER_TIMEOUT" })));
      req.on("error", reject);
      req.end();
    });
  }
  private async lookup(type: VehicleQueryType, query: string): Promise<ProviderResult | null> {
    const environment = (process.env.VEHICLE_LOOKUP_SENATRAN_ENVIRONMENT ?? "homologacao").toLowerCase();
    const defaultBaseUrl = environment === "producao" ? "https://renavam.denatran.serpro.gov.br" : "https://wsrenavam.hom.denatran.serpro.gov.br";
    const baseUrl = process.env.VEHICLE_LOOKUP_SENATRAN_BASE_URL?.trim() || defaultBaseUrl;
    const timeoutMs = Number(process.env.VEHICLE_LOOKUP_TIMEOUT_MS ?? 8000);
    const officialType = type === "plate" ? "placa" : "chassi";
    const url = new URL(`v1/veiculos/${officialType}/${encodeURIComponent(query)}`, `${baseUrl.replace(/\/$/, "")}/`);
    url.searchParams.set("idUltimoRegistro", "0");
    return this.officialVehicle(await this.request(url, timeoutMs));
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
