import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { TENANT_B, tokenB } from "./helpers/auth.js";

const { mockDbSelect, mockDbInsert, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

const mockDispatchAgentBackground = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
  },
  leadsTable: { id: "id", tenantId: "tenantId" },
  leadSpouseConsentTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  tenantCalendarSettingsTable: { tenantId: "tenantId", enableSpouseGiftFlow: "enableSpouseGiftFlow" },
  insertLeadSpouseConsentSchema: {
    safeParse: (v: Record<string, unknown>) => ({ success: true, data: v }),
  },
  updateLeadSpouseConsentSchema: {
    safeParse: (v: Record<string, unknown>) => ({ success: true, data: v }),
  },
}));

vi.mock("../services/agent-dispatch.js", () => ({
  dispatchAgentBackground: mockDispatchAgentBackground,
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import spouseConsentRouter from "../routes/lead_spouse_consent.js";

const app = express();
app.use(express.json());
app.use(
  "/api",
  authenticate,
  (req, _res, next) => {
    (req as any).log = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      child: vi.fn(() => (req as any).log),
    };
    next();
  },
  spouseConsentRouter,
);

type MockRow = Record<string, unknown>;

function createSelectChain(rows: MockRow[]) {
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  chain.then = (resolve: any) => resolve(rows);
  return chain;
}

function createInsertChain(rows: MockRow[]) {
  const chain: any = {};
  chain.values = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(rows);
  chain.then = (resolve: any) => resolve(undefined);
  return chain;
}

const LEAD_ID = "lead-with-spouse";
const leadWithSpouse: MockRow = {
  id: LEAD_ID,
  tenantId: TENANT_B,
  nome: "João",
  conjugeNome: "Maria",
  conjugeTelefone: "+5511999999999",
  conjugeEmail: "maria@example.com",
};

describe("POST /api/leads/:leadId/spouse-consent — first consent granted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates spouse referral lead and dispatches welcome on first consent", async () => {
    // select order: 1) lead, 2) existing consent (none), 3) tenant settings
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return createSelectChain([leadWithSpouse]);
      if (selectCall === 2 || selectCall >= 4) return createSelectChain([]);
      return createSelectChain([{ enableSpouseGiftFlow: true }]);
    });

    // insert order: 1) spouse lead, 2) consent
    let insertCall = 0;
    mockDbInsert.mockImplementation(() => {
      insertCall++;
      if (insertCall === 1) {
        return createInsertChain([
          { id: "spouse-lead-1", tenantId: TENANT_B, source: "spouse_referral", pipelineExempt: true },
        ]);
      }
      return createInsertChain([
        {
          id: "consent-1",
          tenantId: TENANT_B,
          leadId: LEAD_ID,
          consentGiven: true,
          consentStatus: "given",
          spouseLeadId: "spouse-lead-1",
        },
      ]);
    });

    const res = await request(app)
      .post(`/api/leads/${LEAD_ID}/spouse-consent`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ consentGiven: true });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.spouseLeadId).toBe("spouse-lead-1");
    expect(res.body.consentStatus).toBe("given");

    // spouse lead inserted with the right markers
    const spouseInsertValues = mockDbInsert.mock.results[0]?.value.values.mock.calls[0][0];
    expect(spouseInsertValues).toMatchObject({
      tenantId: TENANT_B,
      nome: "Maria",
      source: "spouse_referral",
      pipelineExempt: true,
    });

    // transparent welcome message dispatched via the relacionamento agent
    expect(mockDispatchAgentBackground).toHaveBeenCalledTimes(1);
    expect(mockDispatchAgentBackground.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT_B,
      leadId: "spouse-lead-1",
      forcedAgent: "relacionamento",
      scenario: { type: "spouse_welcome", referrerName: "João", spouseName: "Maria" },
    });
  });

  it("does not create spouse lead when consent is not given", async () => {
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return createSelectChain([leadWithSpouse]);
      return createSelectChain([]);
    });
    mockDbInsert.mockReturnValue(
      createInsertChain([
        { id: "consent-2", tenantId: TENANT_B, leadId: LEAD_ID, consentGiven: false, consentStatus: "pending" },
      ]),
    );

    const res = await request(app)
      .post(`/api/leads/${LEAD_ID}/spouse-consent`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ consentGiven: false });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(mockDispatchAgentBackground).not.toHaveBeenCalled();
    // only the consent row is inserted (no spouse lead)
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
});
