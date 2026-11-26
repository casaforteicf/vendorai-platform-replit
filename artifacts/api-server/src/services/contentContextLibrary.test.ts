import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  pool: { query: vi.fn() },
}));

import { pool } from "@workspace/db";
import { resolveContentContext } from "./contentContextLibrary";

const query = pool.query as unknown as ReturnType<typeof vi.fn>;

type Entry = {
  id: string;
  title: string;
  kind: string;
  summary: string;
  details: string | null;
  tags: string[] | null;
  asset_ids: string[] | null;
  updated_at: Date;
};

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "entry-1",
    title: "Quem somos",
    kind: "empresa",
    summary: "Hotel fazenda com águas termais em Iraí.",
    details: "Estrutura completa, restaurante e lazer para famílias.",
    tags: ["hotel", "termas"],
    asset_ids: [],
    updated_at: new Date("2026-10-01T12:00:00Z"),
    ...overrides,
  };
}

function productsResult(rows: unknown[] = []) {
  return { rows };
}

describe("resolveContentContext", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("usa as fontes aprovadas mais recentes quando o tema não casa por palavra-chave", async () => {
    query
      .mockResolvedValueOnce({ rows: [entry()] })
      .mockResolvedValueOnce(productsResult());

    const result = await resolveContentContext({
      tenantId: "tenant-1",
      query: "promoção pacotes corporativos eventos confraternização",
      limit: 8,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.title).toBe("Quem somos");
    expect(result.promptBlock).toContain("informações gerais aprovadas");
    expect(result.promptBlock).toContain("Quem somos");
  });

  it("não usa fallback quando existe fonte que casa com o tema", async () => {
    query
      .mockResolvedValueOnce({ rows: [entry({ title: "Pacotes 2027", summary: "Pacotes com pensão completa para 2027." })] })
      .mockResolvedValueOnce(productsResult());

    const result = await resolveContentContext({
      tenantId: "tenant-1",
      query: "pacotes 2027 hotel termas",
      limit: 8,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.promptBlock).not.toContain("informações gerais aprovadas");
  });

  it("mantém o aviso quando não existe nenhuma fonte aprovada", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(productsResult());

    const result = await resolveContentContext({
      tenantId: "tenant-1",
      query: "pacotes 2027",
      limit: 8,
    });

    expect(result.sources).toHaveLength(0);
    expect(result.promptBlock).toContain("Nenhuma fonte aprovada relevante foi encontrada");
  });
});
