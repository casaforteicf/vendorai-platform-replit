import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function read(relativePathFromLib: string): string {
  return readFileSync(resolve(here, relativePathFromLib), "utf8");
}

const guardedConsumers = [
  "../routes/tenants.ts",
  "./onboarding-implementation.ts",
  "../routes/leads.ts",
] as const;

const forbiddenLegacyReads = [
  "businessProfilesTable.produtos",
  "profile?.produtos",
  "profile.produtos",
] as const;

describe("Catálogo oficial — guard de fonte única", () => {
  for (const file of guardedConsumers) {
    it(`${file} não volta a ler produtos legados do business profile`, () => {
      const source = read(file);
      for (const forbidden of forbiddenLegacyReads) {
        expect(source, `${file} contém leitura legada: ${forbidden}`).not.toContain(forbidden);
      }
    });
  }

  it("mantém o helper central como fonte de readiness do Catálogo ativo", () => {
    const source = read("./catalog-readiness.ts");
    expect(source).toContain("getActiveCatalogCount");
    expect(source).toContain("produtosCatalogoTable.ativo");
    expect(source).toContain("getActiveCatalogPreview");
  });
});
