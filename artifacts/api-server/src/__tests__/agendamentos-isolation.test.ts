import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import {
  TENANT_A,
  TENANT_B,
  tokenA,
  tokenB,
  tokenSuperAdmin,
  makeToken,
} from "./helpers/auth.js";
import { MockRow, createDbHelpers } from "./helpers/isolation.js";

const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert, mockInsertSchema, mockUpdateSchema } =
  vi.hoisted(() => ({
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbDelete: vi.fn(),
    mockDbInsert: vi.fn(),
    mockInsertSchema: vi.fn(),
    mockUpdateSchema: vi.fn(() => ({ success: true, data: {} })),
  }));

vi.mock("@workspace/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    delete: mockDbDelete,
    insert: mockDbInsert,
  },
  agendaAccessGrantsTable: { agendaId: "agendaId", tenantId: "tenantId", userId: "userId" },
  agendasTable: { id: "id", tenantId: "tenantId", ownerUserId: "ownerUserId", googleRefreshToken: "googleRefreshToken" },
  leadsTable: { id: "id", tenantId: "tenantId" },
  dealsTable: { id: "id", tenantId: "tenantId", leadId: "leadId" },
  usersTable: { id: "id", tenantId: "tenantId" },
  activitiesTable: { id: "id" },
  agendamentosTable: {
    id: "id",
    tenantId: "tenantId",
    leadId: "leadId",
    responsavelId: "responsavelId",
    dataHoraInicio: "dataHoraInicio",
    dataHoraFim: "dataHoraFim",
    status: "status",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  insertAgendamentoSchema: {
    safeParse: (data: unknown) => mockInsertSchema(data),
  },
  updateAgendamentoSchema: {
    safeParse: (_data: unknown) => mockUpdateSchema(),
  },
}));

import express from "express";
import { authenticate } from "../middlewares/auth.js";
import agendamentosRouter from "../routes/agendamentos.js";

const app = express();
app.use(express.json());
app.use("/api", authenticate, agendamentosRouter);

const {
  setupSelectReturning,
  setupUpdateReturning,
  setupDeleteSuccess,
  setupInsertReturning,
} = createDbHelpers({ mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert });

const RECORD_ID = "agendamento-owned-by-b";

const recordOwnedByTenantB: MockRow = {
  id: RECORD_ID,
  tenantId: TENANT_B,
  tipo: "reuniao",
};

const VALID_START = new Date("2030-06-01T10:00:00Z");
const VALID_END = new Date("2030-06-01T11:00:00Z");

describe("POST /api/agendamentos — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when body.tenantId does not match the authenticated tenant", async () => {
    mockInsertSchema.mockReturnValue({
      success: true,
      data: {
        tenantId: TENANT_B,
        leadId: "lead-1",
        dataHoraInicio: VALID_START,
        dataHoraFim: VALID_END,
      },
    });

    const res = await request(app)
      .post("/api/agendamentos")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tenantId: TENANT_B, leadId: "lead-1" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 201 when tenant posts an agendamento for their own tenant", async () => {
    const newRecord: MockRow = { id: "new-agend", tenantId: TENANT_B, tipo: "reuniao" };
    mockInsertSchema.mockReturnValue({
      success: true,
      data: {
        tenantId: TENANT_B,
        leadId: "lead-1",
        dataHoraInicio: VALID_START,
        dataHoraFim: VALID_END,
      },
    });
    mockDbSelect.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ id: "lead-1" }] }) }) });
    setupInsertReturning([newRecord]);

    const res = await request(app)
      .post("/api/agendamentos")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ tenantId: TENANT_B, leadId: "lead-1" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("new-agend");
  });

  it("returns 201 when super_admin posts an agendamento for any tenant", async () => {
    const newRecord: MockRow = { id: "new-agend", tenantId: TENANT_A, tipo: "reuniao" };
    mockInsertSchema.mockReturnValue({
      success: true,
      data: {
        tenantId: TENANT_A,
        leadId: "lead-1",
        dataHoraInicio: VALID_START,
        dataHoraFim: VALID_END,
      },
    });
    mockDbSelect.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ id: "lead-1" }] }) }) });
    setupInsertReturning([newRecord]);

    const res = await request(app)
      .post("/api/agendamentos")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ tenantId: TENANT_A, leadId: "lead-1" });

    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/agendamentos/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, tipo: "consulta" }]);
  });

  it("returns 403 when tenant A patches a record owned by tenant B", async () => {
    const res = await request(app)
      .patch(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tipo: "consulta" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 200 when tenant B patches its own record", async () => {
    const res = await request(app)
      .patch(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ tipo: "consulta" });

    expect(res.status).toBe(200);
  });

  it("returns 200 when super_admin patches a cross-tenant record", async () => {
    const res = await request(app)
      .patch(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`)
      .send({ tipo: "consulta" });

    expect(res.status).toBe(200);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .patch(`/api/agendamentos/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tipo: "consulta" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/agendamentos/:id — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupDeleteSuccess();
  });

  it("returns 403 when tenant A deletes a record owned by tenant B", async () => {
    const res = await request(app)
      .delete(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("Access denied") });
  });

  it("returns 204 when tenant B deletes its own record", async () => {
    const res = await request(app)
      .delete(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(204);
  });

  it("returns 204 when super_admin deletes a cross-tenant record", async () => {
    const res = await request(app)
      .delete(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 when the record does not exist", async () => {
    setupSelectReturning([]);

    const res = await request(app)
      .delete(`/api/agendamentos/nonexistent`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

describe("Unauthenticated access — agendamentos", () => {
  it("returns 401 for POST without a token", async () => {
    const res = await request(app).post("/api/agendamentos").send({ leadId: "lead-1" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for PATCH without a token", async () => {
    const res = await request(app)
      .patch(`/api/agendamentos/${RECORD_ID}`)
      .send({ tipo: "consulta" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for DELETE without a token", async () => {
    const res = await request(app).delete(`/api/agendamentos/${RECORD_ID}`);
    expect(res.status).toBe(401);
  });
});

// ─── Past date validation tests ───────────────────────────────────────────────

describe("POST /api/agendamentos — past date validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when dataHoraInicio is in the past", async () => {
    mockInsertSchema.mockReturnValue({
      success: true,
      data: {
        tenantId: TENANT_A,
        leadId: "lead-1",
        dataHoraInicio: new Date("2020-01-01T10:00:00Z"),
        dataHoraFim: new Date("2020-01-01T11:00:00Z"),
      },
    });

    const res = await request(app)
      .post("/api/agendamentos")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tenantId: TENANT_A, leadId: "lead-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/passado/);
  });
});

describe("PATCH /api/agendamentos/:id — past date validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSelectReturning([recordOwnedByTenantB]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, tipo: "consulta" }]);
  });

  it("returns 400 when reagendamento sets dataHoraInicio to the past", async () => {
    mockUpdateSchema.mockReturnValue({
      success: true,
      data: {
        dataHoraInicio: new Date("2020-01-01T10:00:00Z"),
        dataHoraFim: new Date("2020-01-01T11:00:00Z"),
      },
    });

    const res = await request(app)
      .patch(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ dataHoraInicio: "2020-01-01T10:00:00Z", dataHoraFim: "2020-01-01T11:00:00Z" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/passado/);
  });

  it("returns 200 when editing non-date fields of a past appointment", async () => {
    mockUpdateSchema.mockReturnValue({
      success: true,
      data: { status: "concluido", observacoes: "Cliente nao compareceu" },
    });

    const res = await request(app)
      .patch(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ status: "concluido", observacoes: "Cliente nao compareceu" });

    expect(res.status).toBe(200);
  });
});


describe("member ownership authorization — agendamentos", () => {
  const memberToken = makeToken(TENANT_B, "member");
  const memberId = `user-${TENANT_B}`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSchema.mockReturnValue({ success: true, data: { tipo: "consulta" } });
  });

  it("refuses creation assigned to a different user before any DB write", async () => {
    mockInsertSchema.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_B, leadId: "lead-1", responsavelId: "another-user", dataHoraInicio: VALID_START, dataHoraFim: VALID_END },
    });
    const res = await request(app).post("/api/agendamentos")
      .set("Authorization", `Bearer ${memberToken}`).send({ tenantId: TENANT_B });
    expect(res.status).toBe(403);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("refuses Meet with no explicitly selected calendar", async () => {
    mockInsertSchema.mockReturnValue({
      success: true,
      data: { tenantId: TENANT_B, leadId: "lead-1", responsavelId: memberId, gerarMeet: true, dataHoraInicio: VALID_START, dataHoraFim: VALID_END },
    });
    const res = await request(app).post("/api/agendamentos")
      .set("Authorization", `Bearer ${memberToken}`).send({ tenantId: TENANT_B });
    expect(res.status).toBe(403);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("rejects editing an owned appointment after its calendar grant is revoked", async () => {
    const ownedCalendarRecord = { ...recordOwnedByTenantB, responsavelId: memberId, agendaId: "calendar-revoked" };
    // First query fetches the appointment, second fetches the calendar.
    // Neither an owner match nor a grant is returned.
    const query = (rows: MockRow[]) => ({
      from: () => ({ where: () => ({ limit: async () => rows }) }),
    });
    mockDbSelect.mockReturnValueOnce(query([ownedCalendarRecord]))
      .mockReturnValueOnce(query([{ id: "calendar-revoked", ownerUserId: "different-user" }]))
      .mockReturnValueOnce(query([]));
    const res = await request(app).patch(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${memberToken}`).send({ tipo: "consulta" });
    expect(res.status).toBe(403);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("allows a member to edit their own appointment", async () => {
    setupSelectReturning([{ ...recordOwnedByTenantB, responsavelId: memberId }]);
    setupUpdateReturning([{ ...recordOwnedByTenantB, responsavelId: memberId, tipo: "consulta" }]);
    const res = await request(app).patch(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${memberToken}`).send({ tipo: "consulta" });
    expect(res.status).toBe(200);
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("allows a member to delete their own appointment", async () => {
    setupSelectReturning([{ ...recordOwnedByTenantB, responsavelId: memberId }]);
    setupDeleteSuccess();
    const res = await request(app).delete(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(204);
    expect(mockDbDelete).toHaveBeenCalled();
  });

  it("refuses editing another member's appointment in the same tenant", async () => {
    setupSelectReturning([{ ...recordOwnedByTenantB, responsavelId: "another-user" }]);
    const res = await request(app).patch(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${memberToken}`).send({ tipo: "consulta" });
    expect(res.status).toBe(403);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("refuses deleting another member's appointment in the same tenant", async () => {
    setupSelectReturning([{ ...recordOwnedByTenantB, responsavelId: "another-user" }]);
    const res = await request(app).delete(`/api/agendamentos/${RECORD_ID}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
    expect(mockDbDelete).not.toHaveBeenCalled();
  });
});
