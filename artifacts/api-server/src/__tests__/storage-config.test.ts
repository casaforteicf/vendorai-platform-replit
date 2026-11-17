import { describe, expect, it } from "vitest";
import {
  inspectStorageConfiguration,
  inspectSupabaseServiceRoleKey,
} from "../lib/objectStorage.js";

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function serviceRoleJwt(payload: Record<string, unknown> = {}): string {
  return [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({ iss: "supabase", ref: "projeto", role: "service_role", ...payload }),
    "assinatura-fake",
  ].join(".");
}

const PRIVATE_DIR = "/vendorai-uploads/.private";

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe("inspectSupabaseServiceRoleKey", () => {
  it("aceita um JWT completo com role service_role", () => {
    const result = inspectSupabaseServiceRoleKey(serviceRoleJwt());
    expect(result.valid).toBe(true);
    expect(result.format).toBe("jwt");
    expect(result.issue).toBeNull();
  });

  it("rejeita a chave truncada que derrubou os uploads (2 segmentos)", () => {
    const truncated = serviceRoleJwt().split(".").slice(0, 2).join(".");
    const result = inspectSupabaseServiceRoleKey(truncated);
    expect(result.valid).toBe(false);
    expect(result.issue).toContain("2 segmentos");
  });

  it("rejeita chave anon (não é service_role)", () => {
    const result = inspectSupabaseServiceRoleKey(serviceRoleJwt({ role: "anon" }));
    expect(result.valid).toBe(false);
    expect(result.issue).toContain("service_role");
  });

  it("aceita as novas chaves sb_secret_", () => {
    const result = inspectSupabaseServiceRoleKey(`sb_secret_${"a".repeat(40)}`);
    expect(result.valid).toBe(true);
    expect(result.format).toBe("sb_secret");
  });

  it("trata chave ausente como missing", () => {
    const result = inspectSupabaseServiceRoleKey(undefined);
    expect(result.configured).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.format).toBe("missing");
  });

  it("rejeita quebra de linha/whitespace interno", () => {
    const key = serviceRoleJwt();
    const result = inspectSupabaseServiceRoleKey(`${key.slice(0, 20)}\n${key.slice(20)}`);
    expect(result.valid).toBe(false);
    expect(result.issue).toContain("espaços");
  });
});

describe("inspectStorageConfiguration", () => {
  it("seleciona R2 quando as 4 variáveis estão completas", () => {
    const status = inspectStorageConfiguration(
      env({
        R2_ACCOUNT_ID: "conta",
        R2_ACCESS_KEY_ID: "access",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_BUCKET: "vendorai-uploads",
        PRIVATE_OBJECT_DIR: PRIVATE_DIR,
      }),
    );
    expect(status.backend).toBe("r2");
    expect(status.errors).toEqual([]);
    expect(status.r2Bucket).toBe("vendorai-uploads");
    expect(status.r2EndpointHost).toBe("conta.r2.cloudflarestorage.com");
  });

  it("trata R2 parcial como misconfigured em vez de cair no Supabase", () => {
    const status = inspectStorageConfiguration(
      env({
        R2_ACCOUNT_ID: "conta",
        R2_ACCESS_KEY_ID: "access",
        R2_BUCKET: "vendorai-uploads",
        SUPABASE_URL: "https://exemplo.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleJwt(),
        PRIVATE_OBJECT_DIR: PRIVATE_DIR,
      }),
    );
    expect(status.backend).toBe("misconfigured");
    expect(status.errors.join(" ")).toContain("R2 incompleta");
    expect(status.errors.join(" ")).toContain("R2_SECRET_ACCESS_KEY");
  });

  it("cai para Supabase quando R2 está ausente e a chave é válida", () => {
    const status = inspectStorageConfiguration(
      env({
        SUPABASE_URL: "https://exemplo.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleJwt(),
        PRIVATE_OBJECT_DIR: "/app-uploads/private",
      }),
    );
    expect(status.backend).toBe("supabase");
    expect(status.errors).toEqual([]);
  });

  it("marca chave Supabase truncada como misconfigured", () => {
    const truncated = serviceRoleJwt().split(".").slice(0, 2).join(".");
    const status = inspectStorageConfiguration(
      env({
        SUPABASE_URL: "https://exemplo.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: truncated,
        PRIVATE_OBJECT_DIR: PRIVATE_DIR,
      }),
    );
    expect(status.backend).toBe("misconfigured");
    expect(status.errors.join(" ")).toContain("2 segmentos");
  });

  it("reporta unconfigured quando não há backend algum", () => {
    const status = inspectStorageConfiguration(env());
    expect(status.backend).toBe("unconfigured");
    expect(status.errors.join(" ")).toContain("Nenhum backend");
    expect(status.errors.join(" ")).toContain("PRIVATE_OBJECT_DIR");
  });

  it("valida o formato de PRIVATE_OBJECT_DIR", () => {
    const status = inspectStorageConfiguration(
      env({
        R2_ACCOUNT_ID: "conta",
        R2_ACCESS_KEY_ID: "access",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_BUCKET: "vendorai-uploads",
        PRIVATE_OBJECT_DIR: "/prefixo-sem-bucket",
      }),
    );
    expect(status.errors.join(" ")).toContain("/<bucket>/<prefixo>");
  });
});
