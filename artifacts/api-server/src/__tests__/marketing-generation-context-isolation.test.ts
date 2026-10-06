import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@workspace/db", () => ({
  db: { select: mockSelect },
  mediaPlansTable: { id: "mediaPlans.id", tenantId: "mediaPlans.tenantId", conteudo: "mediaPlans.conteudo" },
  contentCalendarItemsTable: {
    id: "calendar.id",
    tenantId: "calendar.tenantId",
    mediaPlanId: "calendar.mediaPlanId",
    pilar: "calendar.pilar",
  },
}));

import { validateMediaPlanGenerationContext } from "../services/marketingGenerationContext.js";

function chain(rows: unknown[]) {
  const value: any = {};
  value.from = vi.fn().mockReturnValue(value);
  value.where = vi.fn().mockReturnValue(value);
  value.limit = vi.fn().mockResolvedValue(rows);
  return value;
}

const campaign = {
  id: "campaign-icf",
  nome: "Casas ICF Monticiano",
  objetivo: "Gerar oportunidades",
  produtoServico: "Construção de casas em ICF",
  publico: "Famílias construindo alto padrão",
  oferta: "Solicitar diagnóstico",
  mensagemCentral: "Construção ICF de alto desempenho",
};

const headers = {
  "x-vendorai-media-plan-id": "plan-a",
  "x-vendorai-campaign-id": "campaign-icf",
  "x-vendorai-calendar-item-id": "calendar-a",
};

describe("marketing generation context isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts only a campaign that belongs to the current plan and calendar item", async () => {
    mockSelect
      .mockReturnValueOnce(chain([{ id: "plan-a", tenantId: "tenant-a", conteudo: { campanhas: [campaign] } }]))
      .mockReturnValueOnce(chain([{ id: "calendar-a", tenantId: "tenant-a", mediaPlanId: "plan-a", pilar: "Casas ICF Monticiano · Educação" }]));

    const result = await validateMediaPlanGenerationContext("tenant-a", headers);

    expect(result?.campaign.id).toBe("campaign-icf");
    expect(result?.campaign.produtoServico).toBe("Construção de casas em ICF");
  });

  it("rejects a media plan not visible inside the current tenant scope", async () => {
    mockSelect
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{ id: "calendar-a", tenantId: "tenant-a", mediaPlanId: "plan-a", pilar: "Casas ICF Monticiano · Educação" }]));

    await expect(validateMediaPlanGenerationContext("tenant-a", headers))
      .rejects.toMatchObject({ message: "Plano de Mídia não pertence ao tenant atual.", status: 422 });
  });

  it("rejects a campaign id that is not present in the validated plan", async () => {
    mockSelect
      .mockReturnValueOnce(chain([{ id: "plan-a", tenantId: "tenant-a", conteudo: { campanhas: [campaign] } }]))
      .mockReturnValueOnce(chain([{ id: "calendar-a", tenantId: "tenant-a", mediaPlanId: "plan-a", pilar: "Casas ICF Monticiano · Educação" }]));

    await expect(validateMediaPlanGenerationContext("tenant-a", {
      ...headers,
      "x-vendorai-campaign-id": "campaign-piscina",
    })).rejects.toMatchObject({ message: "Campanha não pertence ao Plano de Mídia informado.", status: 422 });
  });

  it("rejects a valid campaign from the plan when it does not match the calendar action", async () => {
    const poolCampaign = { ...campaign, id: "campaign-piscina", nome: "Piscinas", produtoServico: "Trocador de calor para piscina" };
    mockSelect
      .mockReturnValueOnce(chain([{ id: "plan-a", tenantId: "tenant-a", conteudo: { campanhas: [campaign, poolCampaign] } }]))
      .mockReturnValueOnce(chain([{ id: "calendar-a", tenantId: "tenant-a", mediaPlanId: "plan-a", pilar: "Casas ICF Monticiano · Educação" }]));

    await expect(validateMediaPlanGenerationContext("tenant-a", {
      ...headers,
      "x-vendorai-campaign-id": "campaign-piscina",
    })).rejects.toMatchObject({ message: "Campanha informada não corresponde à ação atual do calendário.", status: 422 });
  });

  it("rejects partial context instead of silently falling back", async () => {
    await expect(validateMediaPlanGenerationContext("tenant-a", {
      "x-vendorai-media-plan-id": "plan-a",
      "x-vendorai-campaign-id": "campaign-icf",
    })).rejects.toMatchObject({ message: "Contexto de Plano de Mídia incompleto.", status: 422 });

    expect(mockSelect).not.toHaveBeenCalled();
  });
});
