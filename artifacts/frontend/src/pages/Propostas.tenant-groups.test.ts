import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./Propostas.tsx", import.meta.url), "utf8");
const editEffectStart = source.indexOf('if (!open || !editingProposta || businessProfileLoading) return;');
const editEffectEnd = source.indexOf('if (!open || editingProposta || !initialExternalBudget?.projectId) return;', editEffectStart);
const editEffect = source.slice(editEffectStart, editEffectEnd);

describe("budget groups by tenant while editing", () => {
  it("waits for the tenant profile before hydrating an existing budget", () => {
    expect(editEffectStart).toBeGreaterThan(-1);
  });

  it("does not force ICF stages when editing an empty non-construction budget", () => {
    expect(editEffect).toContain('const defaultEditGroups: OrcamentoEtapaDraft[] = isConstructionTenant');
    expect(editEffect).toContain('setOrcamentoEtapas(defaultEditGroups)');
  });

  it("remaps legacy construction stages away from non-construction tenants", () => {
    expect(editEffect).toContain('const remappedStageIds = new Map<string, string>()');
    expect(editEffect).toContain('if (polluted) remappedStageIds.set(etapa.id, DEFAULT_ETAPA_ID)');
  });
});
