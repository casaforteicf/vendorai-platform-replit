import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import {
  BASE_URL,
  attachDiagnostics,
  authenticatePage,
  collectDiagnostics,
  getVendorSession,
} from "../helpers/vendorai-session";

type CreatedState = {
  leadId?: string;
  autoDealIds: string[];
  dealId?: string;
  propostaId?: string;
  agendamentoId?: string;
  prospectorFlowId?: string;
};

async function requestJson(
  request: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  token: string,
  data?: unknown,
) {
  const response = await request.fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    data,
  });
  const text = await response.text();
  let body: any = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { response, body, text };
}

async function expectOk(
  request: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  token: string,
  data?: unknown,
) {
  const result = await requestJson(request, method, path, token, data);
  expect(
    result.response.status(),
    `${method} ${path} falhou: ${result.response.status()} ${String(result.text).slice(0, 500)}`,
  ).toBeLessThan(400);
  return result.body;
}

async function verifyUiText(page: Page, path: string, text: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(text, { timeout: 25_000 });
}

async function cleanup(
  request: APIRequestContext,
  token: string,
  state: CreatedState,
) {
  const attempts: Array<Promise<unknown>> = [];
  if (state.prospectorFlowId) {
    attempts.push(requestJson(request, "DELETE", `/api/prospector/flows/${state.prospectorFlowId}`, token));
  }
  if (state.agendamentoId) {
    attempts.push(requestJson(request, "DELETE", `/api/agendamentos/${state.agendamentoId}`, token));
  }
  if (state.propostaId) {
    attempts.push(requestJson(request, "DELETE", `/api/propostas/${state.propostaId}`, token));
  }
  if (state.dealId) {
    attempts.push(requestJson(request, "DELETE", `/api/deals/${state.dealId}`, token));
  }
  for (const id of state.autoDealIds) {
    attempts.push(requestJson(request, "DELETE", `/api/deals/${id}`, token));
  }
  await Promise.allSettled(attempts);

  if (state.leadId) {
    await requestJson(
      request,
      "DELETE",
      `/api/leads/${state.leadId}`,
      token,
      { motivo: "Limpeza automática E2E P1" },
    ).catch(() => undefined);
  }
}

test.describe("P1 — fluxo transacional comercial", () => {
  test("lead → negócio → pipeline → orçamento/proposta → agenda → Prospector", async ({
    page,
    request,
  }, testInfo: TestInfo) => {
    test.skip(process.env.E2E_MUTATION_ENABLED !== "1", "P1 mutável desativado");

    const expectedTenantId = process.env.E2E_TENANT_ID?.trim();
    expect(expectedTenantId, "E2E_TENANT_ID obrigatório para P1").toBeTruthy();

    const session = await getVendorSession(request);
    expect(
      session.user?.tenantId,
      "P1 só pode rodar no tenant E2E dedicado",
    ).toBe(expectedTenantId);

    const diagnostics = collectDiagnostics(page);
    const state: CreatedState = { autoDealIds: [] };
    const runId = randomUUID().slice(0, 8);
    const leadName = `E2E-P1 Lead ${runId}`;
    const dealTitle = `E2E-P1 Oportunidade ${runId}`;
    const proposalTitle = `E2E-P1 Orçamento ${runId}`;
    const meetingTitle = `E2E-P1 Agenda ${runId}`;
    const flowName = `E2E-P1 Prospector ${runId}`;

    try {
      const lead = await expectOk(request, "POST", "/api/leads", session.token, {
        tenantId: expectedTenantId,
        nome: leadName,
        empresa: "VendorAI QA",
        status: "novo",
        proximaAcao: "Validar fluxo E2E",
      });
      expect(lead?.id).toBeTruthy();
      state.leadId = lead.id;

      const autoDeals = await expectOk(
        request,
        "GET",
        `/api/tenants/${expectedTenantId}/deals?leadId=${encodeURIComponent(lead.id)}`,
        session.token,
      );
      expect(Array.isArray(autoDeals)).toBeTruthy();
      state.autoDealIds = (autoDeals as any[]).map((item) => String(item.id)).filter(Boolean);
      expect(state.autoDealIds.length, "Lead deveria gerar negócio de aquecimento").toBeGreaterThan(0);

      const deal = await expectOk(request, "POST", "/api/deals", session.token, {
        tenantId: expectedTenantId,
        leadId: lead.id,
        titulo: dealTitle,
        valor: 1234.56,
        etapa: "novo",
        probabilidade: 25,
      });
      expect(deal?.id).toBeTruthy();
      state.dealId = deal.id;

      const qualified = await expectOk(
        request,
        "PATCH",
        `/api/deals/${deal.id}`,
        session.token,
        { etapa: "qualificado", probabilidade: 50 },
      );
      expect(qualified?.etapa).toBe("qualificado");

      const proposta = await expectOk(request, "POST", "/api/propostas", session.token, {
        tenantId: expectedTenantId,
        leadId: lead.id,
        dealId: deal.id,
        titulo: proposalTitle,
        valorTotal: 1234.56,
        status: "rascunho",
        observacoes: "Gerado automaticamente pelo P1 E2E",
        skipAsaasBilling: true,
      });
      expect(proposta?.id).toBeTruthy();
      expect(Number(proposta?.valorTotal)).toBeCloseTo(1234.56, 2);
      state.propostaId = proposta.id;

      const sentProposal = await expectOk(
        request,
        "PATCH",
        `/api/propostas/${proposta.id}/status`,
        session.token,
        { status: "enviada" },
      );
      expect(sentProposal?.status).toBe("enviada");

      const proposalStage = await expectOk(
        request,
        "PATCH",
        `/api/deals/${deal.id}`,
        session.token,
        { etapa: "proposta", probabilidade: 70 },
      );
      expect(proposalStage?.etapa).toBe("proposta");

      const start = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 45 * 60 * 1000);
      const agendamento = await expectOk(request, "POST", "/api/agendamentos", session.token, {
        tenantId: expectedTenantId,
        leadId: lead.id,
        dealId: deal.id,
        tipo: "visita",
        titulo: meetingTitle,
        dataHoraInicio: start.toISOString(),
        dataHoraFim: end.toISOString(),
        status: "agendado",
        observacoes: "Agendamento técnico P1 E2E",
        gerarMeet: false,
        criadoPor: "humano",
      });
      expect(agendamento?.id).toBeTruthy();
      state.agendamentoId = agendamento.id;

      const agendaRows = await expectOk(
        request,
        "GET",
        `/api/tenants/${expectedTenantId}/agendamentos?leadId=${encodeURIComponent(lead.id)}`,
        session.token,
      );
      expect((agendaRows as any[]).some((item) => item.id === agendamento.id)).toBeTruthy();

      const flow = await expectOk(request, "POST", "/api/prospector/flows", session.token, {
        nome: flowName,
        segmento: "E2E",
        ativo: true,
      });
      expect(flow?.id).toBeTruthy();
      state.prospectorFlowId = flow.id;

      const step = await expectOk(
        request,
        "POST",
        `/api/prospector/flows/${flow.id}/steps`,
        session.token,
        {
          ordem: 1,
          canal: "email",
          delayHoras: 0,
          mensagemTemplate: `Mensagem técnica ${runId}`,
        },
      );
      expect(step?.id).toBeTruthy();

      const steps = await expectOk(
        request,
        "GET",
        `/api/prospector/flows/${flow.id}/steps`,
        session.token,
      );
      expect(Array.isArray(steps)).toBeTruthy();
      expect((steps as any[]).some((item) => item.id === step.id)).toBeTruthy();

      await authenticatePage(page, session);
      await verifyUiText(page, `/leads/${lead.id}`, leadName);
      await verifyUiText(page, "/deals", dealTitle);
      await verifyUiText(page, "/propostas", proposalTitle);
      await verifyUiText(page, "/prospector/flows", flowName);

      await page.goto(`${BASE_URL}/agenda`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("Agenda", { timeout: 20_000 });

      await attachDiagnostics(testInfo, diagnostics);
      expect(diagnostics.pageErrors, "P1 encontrou pageerror nas telas validadas").toEqual([]);
      expect(diagnostics.serverErrors, "P1 encontrou resposta 5xx nas telas validadas").toEqual([]);
    } finally {
      await cleanup(request, session.token, state);
    }
  });
});
