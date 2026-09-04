import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { select: mockDbSelect, update: mockDbUpdate },
  usersTable: { id: "id", tenantId: "tenantId", active: "active" },
  tenantDistribuicaoConfigTable: { tenantId: "tenantId", criterios: "criterios" },
}));

import {
  canReceiveLeads,
  matchesTerritory,
  narrowBySegmento,
  narrowByTerritorio,
  pickNextVendedor,
  type AssignmentCandidate,
} from "../lib/round-robin.js";

function candidate(overrides: Partial<AssignmentCandidate> = {}): AssignmentCandidate {
  return {
    id: "vend-1",
    lastAssignedAt: null,
    platformRole: "tenant_seller",
    userFunction: "vendedor",
    leadAssignmentEnabled: null,
    leadAssignmentCities: [],
    leadAssignmentRegions: [],
    leadAssignmentSegments: [],
    leadAssignmentLat: null,
    leadAssignmentLng: null,
    leadAssignmentRaioKm: null,
    ...overrides,
  };
}

describe("canReceiveLeads", () => {
  it("vendedor sem config explícita (null) é elegível por platformRole/userFunction", () => {
    expect(canReceiveLeads(candidate({ leadAssignmentEnabled: null, platformRole: "tenant_seller", userFunction: null }))).toBe(true);
    expect(canReceiveLeads(candidate({ leadAssignmentEnabled: null, platformRole: "member", userFunction: "vendedor" }))).toBe(true);
    expect(canReceiveLeads(candidate({ leadAssignmentEnabled: null, platformRole: "member", userFunction: "financeiro" }))).toBe(false);
  });

  it("leadAssignmentEnabled explícito sempre vence, mesmo contra role/function de vendedor", () => {
    expect(canReceiveLeads(candidate({ leadAssignmentEnabled: false, platformRole: "tenant_seller", userFunction: "vendedor" }))).toBe(false);
    expect(canReceiveLeads(candidate({ leadAssignmentEnabled: true, platformRole: "member", userFunction: "financeiro" }))).toBe(true);
  });
});

describe("matchesTerritory", () => {
  it("bate por substring, ignorando acento/caixa", () => {
    expect(matchesTerritory("Rua X, Chapecó - SC", "chapeco")).toBe(true);
    expect(matchesTerritory("Rua X, Chapecó - SC", "CHAPECÓ")).toBe(true);
  });

  it("território curto (sigla de UF) exige token exato, não substring solto", () => {
    // "sc" não deveria bater dentro de "Descanso" (contém "sc" como substring)
    expect(matchesTerritory("Descanso - SC", "sc")).toBe(true); // "SC" é token isolado no endereço
    expect(matchesTerritory("Descanso", "sc")).toBe(false); // sem token "sc" isolado
  });

  it("retorna false quando falta localização ou território", () => {
    expect(matchesTerritory("", "Chapecó")).toBe(false);
    expect(matchesTerritory("Rua X, Chapecó", "")).toBe(false);
  });
});

describe("narrowBySegmento", () => {
  it("retorna null (não restringe) quando o lead não tem segmento", () => {
    const pool = [candidate({ id: "a", leadAssignmentSegments: ["Óleo"] })];
    expect(narrowBySegmento(pool, {})).toBeNull();
  });

  it("retorna null quando nenhum vendedor cobre a linha do lead", () => {
    const pool = [candidate({ id: "a", leadAssignmentSegments: ["Peças de Motor"] })];
    expect(narrowBySegmento(pool, { segmento: "Óleos & Lubrificantes" })).toBeNull();
  });

  it("filtra só quem cobre a linha", () => {
    const oleo = candidate({ id: "oleo", leadAssignmentSegments: ["Óleos & Lubrificantes"] });
    const pecas = candidate({ id: "pecas", leadAssignmentSegments: ["Peças de Motor"] });
    const result = narrowBySegmento([oleo, pecas], { segmento: "Óleos & Lubrificantes" });
    expect(result).toEqual([oleo]);
  });
});

describe("narrowByTerritorio", () => {
  it("cidade tem prioridade sobre região quando ambas batem", () => {
    const porCidade = candidate({ id: "cidade", leadAssignmentCities: ["Chapecó"] });
    const porRegiao = candidate({ id: "regiao", leadAssignmentRegions: ["SC"] });
    const result = narrowByTerritorio([porCidade, porRegiao], { city: "Chapecó", region: "SC" });
    expect(result).toEqual([porCidade]);
  });

  it("cai pra região quando cidade não bate ninguém", () => {
    const porRegiao = candidate({ id: "regiao", leadAssignmentRegions: ["SC"] });
    const semTerritorio = candidate({ id: "geral" });
    const result = narrowByTerritorio([porRegiao, semTerritorio], { city: "Chapecó", region: "SC" });
    expect(result).toEqual([porRegiao]);
  });

  it("raio: escolhe o mais próximo dentro do alcance e ordena por distância", () => {
    // Lead em (0, 0.1) — perto (~11km) do vendedor A (0,0) e mais longe (~44km) do B (0,0.5)
    const perto = candidate({ id: "perto", leadAssignmentLat: 0, leadAssignmentLng: 0, leadAssignmentRaioKm: 100 });
    const longe = candidate({ id: "longe", leadAssignmentLat: 0, leadAssignmentLng: 0.5, leadAssignmentRaioKm: 100 });
    const result = narrowByTerritorio([longe, perto], { lat: 0, lng: 0.1 });
    expect(result?.map((c) => c.id)).toEqual(["perto", "longe"]);
  });

  it("raio: exclui vendedor fora do próprio alcance configurado", () => {
    const foraDoRaio = candidate({ id: "fora", leadAssignmentLat: 0, leadAssignmentLng: 5, leadAssignmentRaioKm: 10 });
    const result = narrowByTerritorio([foraDoRaio], { lat: 0, lng: 0 });
    expect(result).toBeNull();
  });

  it("cai pro rodízio geral (sem território configurado) quando nada mais bate", () => {
    const comCidade = candidate({ id: "com-cidade", leadAssignmentCities: ["Xanxerê"] });
    const semTerritorio = candidate({ id: "sem-territorio" });
    const result = narrowByTerritorio([comCidade, semTerritorio], { city: "Chapecó" });
    expect(result).toEqual([semTerritorio]);
  });

  it("retorna null quando absolutamente nada bate (todo mundo tem território, nenhum casa)", () => {
    const porCidade = candidate({ id: "a", leadAssignmentCities: ["Xanxerê"] });
    const result = narrowByTerritorio([porCidade], { city: "Chapecó" });
    expect(result).toBeNull();
  });
});

describe("pickNextVendedor (integração com db mockado)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockSelects(...resultsInOrder: unknown[][]) {
    let call = 0;
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => Promise.resolve(resultsInOrder[call++] ?? []),
      }),
    }));
  }

  function mockUpdate() {
    mockDbUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve(undefined) }) });
  }

  it("ordem padrão (sem config): segmento restringe primeiro, território desempata dentro do grupo", async () => {
    const oleoChapeco = { id: "oleo-chapeco", lastAssignedAt: null, platformRole: "tenant_seller", userFunction: "vendedor", leadAssignmentEnabled: null, leadAssignmentCities: [], leadAssignmentRegions: [], leadAssignmentSegments: ["Óleo"] };
    const pecasChapeco = { id: "pecas-chapeco", lastAssignedAt: null, platformRole: "tenant_seller", userFunction: "vendedor", leadAssignmentEnabled: null, leadAssignmentCities: [], leadAssignmentRegions: [], leadAssignmentSegments: ["Peças"] };
    mockSelects([oleoChapeco, pecasChapeco], []); // 1ª select = usuários, 2ª = config (vazio = padrão)
    mockUpdate();

    const result = await pickNextVendedor("tenant-1", { segmento: "Óleo" });
    expect(result).toBe("oleo-chapeco");
  });

  it("ordem invertida via tenant_distribuicao_config: território decide antes do segmento", async () => {
    // X só cobre segmento (sem cidade) — vence na ordem padrão.
    // Y só cobre cidade (sem segmento) — vence quando território vai primeiro.
    const porSegmento = { id: "vend-x", lastAssignedAt: null, platformRole: "tenant_seller", userFunction: "vendedor", leadAssignmentEnabled: null, leadAssignmentCities: [], leadAssignmentRegions: [], leadAssignmentSegments: ["Óleo"] };
    const porCidade = { id: "vend-y", lastAssignedAt: null, platformRole: "tenant_seller", userFunction: "vendedor", leadAssignmentEnabled: null, leadAssignmentCities: ["Chapecó"], leadAssignmentRegions: [], leadAssignmentSegments: [] };

    mockSelects([porSegmento, porCidade], [{ criterios: ["territorio", "segmento"] }]);
    mockUpdate();

    const result = await pickNextVendedor("tenant-1", { segmento: "Óleo", city: "Chapecó" });
    expect(result).toBe("vend-y");
  });

  it("fallback de segurança: se a cascata zerar o pool, volta pra qualquer vendedor elegível do tenant", async () => {
    const qualquerUm = { id: "qualquer", lastAssignedAt: null, platformRole: "tenant_seller", userFunction: "vendedor", leadAssignmentEnabled: null, leadAssignmentCities: ["Outra Cidade"], leadAssignmentRegions: [], leadAssignmentSegments: [] };
    mockSelects([qualquerUm], []);
    mockUpdate();

    // Segmento não bate ninguém (null, não filtra) e território não acha match de
    // cidade/região/geral (candidato tem cidade configurada mas não bate) — narrowByTerritorio
    // retorna null, então o pool original (todo mundo) segue adiante e vence no fallback final.
    const result = await pickNextVendedor("tenant-1", { segmento: "Inexistente", city: "Chapecó" });
    expect(result).toBe("qualquer");
  });

  it("retorna null quando não há nenhum vendedor elegível no tenant", async () => {
    mockSelects([], []);
    const result = await pickNextVendedor("tenant-1", {});
    expect(result).toBeNull();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
