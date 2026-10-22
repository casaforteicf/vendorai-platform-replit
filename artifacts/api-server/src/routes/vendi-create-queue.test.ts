import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  missionTable: { table: "vendi_missions" },
  eventTable: { table: "vendi_mission_events" },
  transaction: vi.fn(),
  executeMission: vi.fn(),
  inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
}));

vi.mock("@workspace/db", () => ({
  db: { transaction: state.transaction },
  vendiMissionsTable: state.missionTable,
  vendiMissionEventsTable: state.eventTable,
}));

vi.mock("../services/vendi-mission-supervisor.js", () => ({
  executeVendiMission: state.executeMission,
}));

vi.mock("../services/vendi-tool-registry.js", () => ({
  listVendiToolDomains: () => [],
  listVendiTools: () => [],
}));

import vendiRouter from "./vendi.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      sub: "user-1", tenantId: "tenant-1", email: "test@example.invalid",
      platformRole: "tenant_admin", role: "admin",
    };
    next();
  });
  app.use("/api", vendiRouter);
  return app;
}

describe("POST /api/vendi/missions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.inserts.length = 0;
    state.executeMission.mockResolvedValue({ status: "completed" });
    state.transaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        insert: (table: unknown) => ({
          values: (values: Record<string, unknown>) => {
            state.inserts.push({ table, values });
            if (table === state.missionTable) {
              return {
                returning: async () => [{ id: "mission-1", ...values }],
              };
            }
            return Promise.resolve(undefined);
          },
        }),
      };
      return callback(tx);
    });
  });

  it("persists automatic missions and the queue event atomically without running tools in the request", async () => {
    const response = await request(createApp())
      .post("/api/vendi/missions")
      .send({ objective: "Revisar oportunidades", autoExecute: true });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ missionId: "mission-1", status: "queued" });
    expect(state.transaction).toHaveBeenCalledTimes(1);
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0]).toMatchObject({
      table: state.missionTable,
      values: { tenantId: "tenant-1", status: "queued" },
    });
    expect(state.inserts[1]).toMatchObject({
      table: state.eventTable,
      values: { tenantId: "tenant-1", missionId: "mission-1", type: "queued", status: "pending" },
    });
    expect(state.executeMission).not.toHaveBeenCalled();
  });

  it("persists manual-only missions without scheduling them", async () => {
    const response = await request(createApp())
      .post("/api/vendi/missions")
      .send({ objective: "Analisar uma conta", autoExecute: false });

    expect(response.status).toBe(201);
    expect(response.body.mission).toMatchObject({ id: "mission-1", status: "planning" });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({ values: { status: "planning" } });
    expect(state.executeMission).not.toHaveBeenCalled();
  });
});
