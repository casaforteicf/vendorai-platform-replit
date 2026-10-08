import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { TENANT_A, TENANT_B, TEST_SECRET, tokenA, tokenSuperAdmin } from "./helpers/auth.js";

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
  },
  activitiesTable: {
    id: "id",
    tenantId: "tenantId",
    leadId: "leadId",
    dealId: "dealId",
    status: "status",
    dataVencimento: "dataVencimento",
    responsavelId: "responsavelId",
    createdAt: "createdAt",
  },
  agendasTable: { id: "id", googleRefreshToken: "googleRefreshToken" },
  leadsTable: { id: "id", nome: "nome", email: "email" },
  tenantsTable: { id: "id", isDemo: "isDemo" },
  insertActivitySchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised" } }),
  },
  updateActivitySchema: {
    safeParse: () => ({ success: false, error: { message: "not exercised" } }),
  },
}));

vi.mock("../lib/google-calendar.js", () => ({
  createGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
}));

vi.mock("../routes/spin.js", () => ({
  generateSpinForActivity: vi.fn(),
}));

vi.mock("../services/customer-intelligence-history.js", () => ({
  recordIntelligenceEvent: vi.fn(),
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import activitiesRouter from "../routes/activities.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, activitiesRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
});

function setupSelectReturning(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValue({ from });
}

describe("GET /api/tenants/:tenantId/activities — tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([]);
  });

  it("returns 403 when tenant A requests tenant B activities", async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/activities`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns 403 when tenant A requests tenant B overdue activities", async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/activities/overdue`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("allows tenant A to list its own activities", async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_A}/activities`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("scopes representative activity listings to the authenticated responsible user", async () => {
    const representativeToken = jwt.sign({
      sub: "representative-user",
      email: "rep@example.com",
      platformRole: "member",
      tenantId: TENANT_A,
      role: "member",
      userFunction: "representante_comercial",
    }, TEST_SECRET, { expiresIn: "1h" });

    await request(app)
      .get(`/api/tenants/${TENANT_A}/activities`)
      .set("Authorization", `Bearer ${representativeToken}`);

    const where = mockDbSelect.mock.results[0]?.value?.from().where;
    expect(where).toBeDefined();
  });

  it("allows representative to query overdue feed only within its authenticated tenant", async () => {
    const representativeToken = jwt.sign({
      sub: "representative-user",
      email: "rep@example.com",
      platformRole: "member",
      tenantId: TENANT_A,
      role: "member",
      userFunction: "representante_comercial",
    }, TEST_SECRET, { expiresIn: "1h" });

    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/activities/overdue`)
      .set("Authorization", `Bearer ${representativeToken}`);

    expect(res.status).toBe(403);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("allows super_admin to inspect another tenant", async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT_B}/activities`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
