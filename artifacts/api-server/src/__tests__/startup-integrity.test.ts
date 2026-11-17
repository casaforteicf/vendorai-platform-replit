import { describe, expect, it } from "vitest";
import { isAcceptedMigrationChecksum, isChecksumEnforcementDisabled } from "@workspace/db";
import { resolveStartupMigrationPolicy } from "../lib/startup-migrations-policy.js";
import { resolveTrustProxy } from "../lib/trust-proxy.js";

describe("resolveStartupMigrationPolicy", () => {
  it("reconhece RAILWAY_ENVIRONMENT=production (regressão do boot degradado)", () => {
    const policy = resolveStartupMigrationPolicy({
      RAILWAY_ENVIRONMENT: "production",
    } as NodeJS.ProcessEnv);
    expect(policy.railwayEnvironment).toBe("production");
    expect(policy.productionManagedSchema).toBe(true);
  });

  it("dá prioridade a RAILWAY_ENVIRONMENT_NAME quando presente", () => {
    const policy = resolveStartupMigrationPolicy({
      RAILWAY_ENVIRONMENT: "staging",
      RAILWAY_ENVIRONMENT_NAME: "production",
    } as NodeJS.ProcessEnv);
    expect(policy.railwayEnvironment).toBe("production");
    expect(policy.productionManagedSchema).toBe(true);
  });

  it("não trata ambientes não-produção como schema gerenciado", () => {
    const policy = resolveStartupMigrationPolicy({
      RAILWAY_ENVIRONMENT: "homologation",
    } as NodeJS.ProcessEnv);
    expect(policy.productionManagedSchema).toBe(false);
  });

  it("reconhece o flag de homologação", () => {
    const policy = resolveStartupMigrationPolicy({
      VENDORAI_HOMOLOGATION_SEED: "TRUE",
    } as NodeJS.ProcessEnv);
    expect(policy.homologationManagedSchema).toBe(true);
  });

  it("sem variáveis não assume produção", () => {
    const policy = resolveStartupMigrationPolicy({} as NodeJS.ProcessEnv);
    expect(policy.railwayEnvironment).toBe("");
    expect(policy.productionManagedSchema).toBe(false);
  });
});

describe("resolveTrustProxy", () => {
  it("usa 1 hop por padrão (plataforma)", () => {
    expect(resolveTrustProxy(undefined)).toBe(1);
    expect(resolveTrustProxy("")).toBe(1);
  });

  it("nunca devolve boolean true, mesmo com TRUST_PROXY=true", () => {
    expect(resolveTrustProxy("true")).toBe(1);
    expect(resolveTrustProxy("TRUE")).toBe(1);
  });

  it("respeita número explícito de hops", () => {
    expect(resolveTrustProxy("2")).toBe(2);
    expect(resolveTrustProxy("0")).toBe(false);
  });

  it("desliga com false/off", () => {
    expect(resolveTrustProxy("false")).toBe(false);
    expect(resolveTrustProxy("off")).toBe(false);
  });

  it("aceita lista de subnets do Express", () => {
    expect(resolveTrustProxy("loopback, linklocal, uniquelocal")).toBe(
      "loopback, linklocal, uniquelocal",
    );
  });
});

describe("isChecksumEnforcementDisabled", () => {
  it("aceita os valores ligados", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on"]) {
      expect(isChecksumEnforcementDisabled({ DRIZZLE_IGNORE_CHECKSUM: value } as NodeJS.ProcessEnv)).toBe(true);
    }
  });

  it("mantém a proteção quando desligado/ausente", () => {
    expect(isChecksumEnforcementDisabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isChecksumEnforcementDisabled({ DRIZZLE_IGNORE_CHECKSUM: "false" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("continua aceitando match exato de checksum", () => {
    expect(isAcceptedMigrationChecksum("123", "abc", "abc")).toBe(true);
    expect(isAcceptedMigrationChecksum("123", "abc", "def")).toBe(false);
  });
});
