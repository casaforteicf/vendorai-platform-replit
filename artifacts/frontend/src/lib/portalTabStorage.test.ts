import { beforeEach, describe, expect, it } from "vitest";
import {
  resolveTabPreference,
  obraStorageKey,
  tokenStorageKey,
} from "./portalTabStorage";

// Use the jsdom localStorage provided by the vitest environment
beforeEach(() => {
  localStorage.clear();
});

describe("resolveTabPreference — tab survives link regeneration", () => {
  it("returns the saved tab when the client opens a new token for the same obra", () => {
    const OBRA_ID = "obra-abc-123";
    const TOKEN_A = "token-aaa";
    const TOKEN_B = "token-bbb";

    // Simulate: client visited with token A and navigated to "Diário"
    // The component stores the preference under the obra key once it knows the obra ID
    localStorage.setItem(obraStorageKey(OBRA_ID), "diario");

    // Now the architect regenerates the link → token B for the same obra
    // resolveTabPreference is called inside the fetch .then() with the new token
    const resolved = resolveTabPreference(TOKEN_B, OBRA_ID);

    expect(resolved).toBe("diario");
  });

  it("falls back to 'dados' (null) when no preference was ever stored", () => {
    const resolved = resolveTabPreference("token-new", "obra-xyz");
    expect(resolved).toBeNull();
  });
});

describe("resolveTabPreference — token-keyed entry is cleaned up after migration", () => {
  it("removes the token-keyed entry after migrating its value to the obra key", () => {
    const TOKEN = "token-ccc";
    const OBRA_ID = "obra-def-456";

    // Simulate: a legacy token-keyed entry exists (written before the obra ID was known)
    localStorage.setItem(tokenStorageKey(TOKEN), "cronograma");

    const resolved = resolveTabPreference(TOKEN, OBRA_ID);

    // The value should have been migrated to the obra key
    expect(resolved).toBe("cronograma");
    expect(localStorage.getItem(obraStorageKey(OBRA_ID))).toBe("cronograma");

    // The token-keyed entry must be gone
    expect(localStorage.getItem(tokenStorageKey(TOKEN))).toBeNull();
  });

  it("removes the token-keyed entry even when the obra key already has a value", () => {
    const TOKEN = "token-ddd";
    const OBRA_ID = "obra-ghi-789";

    // Both keys exist — obra key wins
    localStorage.setItem(obraStorageKey(OBRA_ID), "orcamento");
    localStorage.setItem(tokenStorageKey(TOKEN), "diario");

    const resolved = resolveTabPreference(TOKEN, OBRA_ID);

    expect(resolved).toBe("orcamento");
    // Token-keyed entry must be gone regardless
    expect(localStorage.getItem(tokenStorageKey(TOKEN))).toBeNull();
  });
});
