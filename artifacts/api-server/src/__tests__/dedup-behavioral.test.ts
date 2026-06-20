import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
  },
  leadsTable: {
    id: "id",
    tenantId: "tenantId",
    telefone: "telefone",
    documento: "documento",
    nome: "nome",
  },
}));

import { normalizePhone, normalizeDocument, storePhone, storeDocument, findLeadByDedup } from "../lib/dedup.js";

function buildMockChain(limitFn: ReturnType<typeof vi.fn>) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: limitFn,
      }),
    }),
  };
}

type MockRow = {
  id: string;
  tenantId: string;
  telefone?: string | null;
  documento?: string | null;
  nome?: string;
};

// ---------------------------------------------------------------------------
// Unit-level behavioral tests for dedup logic
// ---------------------------------------------------------------------------
describe("findLeadByDedup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches by phone first (adds DDI 55 on the fly)", async () => {
    mockDbSelect.mockReturnValue(
      buildMockChain(
        vi.fn().mockResolvedValue([{ id: "lead-phone", tenantId: "t1", telefone: "5511999998888" }]),
      ),
    );

    const result = await findLeadByDedup("t1", "(11) 99999-8888", null, "Nome");
    expect(result).toEqual({
      found: true,
      lead: { id: "lead-phone", tenantId: "t1", telefone: "5511999998888" },
      matchBy: "telefone",
    });
  });

  it("matches by document when no phone match", async () => {
    let callCount = 0;
    mockDbSelect.mockReturnValue(
      buildMockChain(
        vi.fn().mockImplementation(() => {
          callCount++;
          // Phone is null => skipped. First callCount (1) is the doc block.
          return Promise.resolve([{ id: "lead-doc", tenantId: "t1", documento: "12345678900" }]);
        }),
      ),
    );

    const result = await findLeadByDedup("t1", null, "123.456.789-00", "Nome");
    expect(result).toEqual({
      found: true,
      lead: { id: "lead-doc", tenantId: "t1", documento: "12345678900" },
      matchBy: "documento",
    });
  });

  it("returns similar (found:false) when only name matches", async () => {
    mockDbSelect.mockReturnValue(
      buildMockChain(
        vi.fn().mockResolvedValue([{ id: "lead-name", tenantId: "t1", nome: "Jo\u00e3o Silva" }]),
      ),
    );

    const result = await findLeadByDedup("t1", null, null, "Jo\u00e3o Silva");
    expect(result).toEqual({
      found: false,
      similar: { id: "lead-name", tenantId: "t1", nome: "Jo\u00e3o Silva" },
    });
  });

  it("matches legacy phone stored without DDI 55", async () => {
    let callCount = 0;
    mockDbSelect.mockReturnValue(
      buildMockChain(
        vi.fn().mockImplementation(() => {
          callCount++;
          // Call 1: phone with 55 (empty), Call 2: phone without 55 (match)
          if (callCount === 2) {
            return Promise.resolve([{ id: "lead-legacy", tenantId: "t1", telefone: "11999998888" }]);
          }
          return Promise.resolve([]);
        }),
      ),
    );

    const result = await findLeadByDedup("t1", "11999998888", null, "Nome");
    expect(result).toEqual({
      found: true,
      lead: { id: "lead-legacy", tenantId: "t1", telefone: "11999998888" },
      matchBy: "telefone",
    });
  });

  it("returns no match when nothing is provided", async () => {
    mockDbSelect.mockReturnValue(
      buildMockChain(vi.fn().mockResolvedValue([])),
    );

    const result = await findLeadByDedup("t1", null, null, null);
    expect(result).toEqual({ found: false, similar: null });
  });
});

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------
describe("normalizePhone", () => {
  it("prepends 55 to raw 11-digit number", () => {
    expect(normalizePhone("11999998888")).toBe("5511999998888");
  });
  it("keeps number already with 55 prefix", () => {
    expect(normalizePhone("5511999998888")).toBe("5511999998888");
  });
  it("strips formatting characters", () => {
    expect(normalizePhone("(11) 99999-8888")).toBe("5511999998888");
  });
  it("handles +55 prefix", () => {
    expect(normalizePhone("+5511999998888")).toBe("5511999998888");
  });
  it("returns null for empty/null/undefined", () => {
    expect(normalizePhone("")).toBe(null);
    expect(normalizePhone(null)).toBe(null);
    expect(normalizePhone(undefined)).toBe(null);
  });
});

describe("normalizeDocument", () => {
  it("removes dots and dashes from CPF", () => {
    expect(normalizeDocument("123.456.789-00")).toBe("12345678900");
  });
  it("removes dots, dashes and slash from CNPJ", () => {
    expect(normalizeDocument("12.345.678/0001-00")).toBe("12345678000100");
  });
  it("returns null for empty/null/undefined", () => {
    expect(normalizeDocument("")).toBe(null);
    expect(normalizeDocument(null)).toBe(null);
    expect(normalizeDocument(undefined)).toBe(null);
  });
});

describe("storePhone", () => {
  it("normalizes before storage", () => {
    expect(storePhone("11999998888")).toBe("5511999998888");
  });
  it("returns null for empty input", () => {
    expect(storePhone("")).toBe(null);
    expect(storePhone(undefined)).toBe(null);
  });
});

describe("storeDocument", () => {
  it("normalizes before storage", () => {
    expect(storeDocument("123.456.789-00")).toBe("12345678900");
  });
  it("returns null for empty input", () => {
    expect(storeDocument("")).toBe(null);
    expect(storeDocument(undefined)).toBe(null);
  });
});
