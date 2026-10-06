import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { TENANT_A, TENANT_B, tokenA, tokenB, tokenSuperAdmin } from "./helpers/auth.js";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  getObjectEntityUploadURL: vi.fn(),
  normalizeObjectEntityPath: vi.fn(),
  searchPublicObject: vi.fn(),
  getObjectEntityFile: vi.fn(),
  downloadObject: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  pool: { query: mocks.poolQuery },
}));

vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {}
  class ObjectStorageService {
    getObjectEntityUploadURL = mocks.getObjectEntityUploadURL;
    normalizeObjectEntityPath = mocks.normalizeObjectEntityPath;
    searchPublicObject = mocks.searchPublicObject;
    getObjectEntityFile = mocks.getObjectEntityFile;
    downloadObject = mocks.downloadObject;
  }
  return { ObjectStorageService, ObjectNotFoundError };
});

import storageRouter from "../routes/storage.js";

const app = express();
app.use(express.json());
app.use("/api", storageRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
});

describe("private storage isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getObjectEntityFile.mockResolvedValue({ id: "file" });
    mocks.downloadObject.mockResolvedValue(new Response(Buffer.from("ok"), {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    }));
    mocks.poolQuery.mockResolvedValue({ rows: [{ allowed: false }] });
  });

  it("blocks anonymous private object reads", async () => {
    const res = await request(app).get("/api/storage/objects/uploads/secret");
    expect(res.status).toBe(401);
    expect(mocks.getObjectEntityFile).not.toHaveBeenCalled();
  });

  it("blocks an explicit path owned by another tenant", async () => {
    const res = await request(app)
      .get(`/api/storage/objects/tenants/${TENANT_B}/uploads/secret`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.getObjectEntityFile).not.toHaveBeenCalled();
  });

  it("allows an explicit path owned by the authenticated tenant", async () => {
    const path = `/objects/tenants/${TENANT_A}/uploads/secret`;
    const res = await request(app)
      .get(`/api/storage${path}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe("ok");
    expect(mocks.getObjectEntityFile).toHaveBeenCalledWith(path);
    expect(res.headers["cache-control"]).toContain("private");
  });

  it("requires a tenant database reference for legacy paths", async () => {
    const denied = await request(app)
      .get("/api/storage/objects/quotes/legacy.pdf")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(denied.status).toBe(403);

    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ allowed: true }] });
    const allowed = await request(app)
      .get("/api/storage/objects/quotes/legacy.pdf")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(allowed.status).toBe(200);
  });

  it("keeps super-admin access for legacy objects", async () => {
    const res = await request(app)
      .get("/api/storage/objects/quotes/platform-audit.pdf")
      .set("Authorization", `Bearer ${tokenSuperAdmin}`);
    expect(res.status).toBe(200);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("does not allow the storage cookie to mint upload URLs", async () => {
    const res = await request(app)
      .post("/api/storage/uploads/request-url")
      .set("Cookie", [`vendorai_storage_session=${encodeURIComponent(tokenA)}`])
      .send({ name: "x.png", size: 10, contentType: "image/png" });
    expect(res.status).toBe(401);
    expect(mocks.getObjectEntityUploadURL).not.toHaveBeenCalled();
  });

  it("binds new signed uploads to the bearer tenant", async () => {
    mocks.getObjectEntityUploadURL.mockResolvedValue("https://storage.example/upload");
    mocks.normalizeObjectEntityPath.mockReturnValue(`/objects/tenants/${TENANT_A}/uploads/uuid`);

    const res = await request(app)
      .post("/api/storage/uploads/request-url")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "x.png", size: 10, contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(mocks.getObjectEntityUploadURL).toHaveBeenCalledWith(TENANT_A);
    expect(res.body.objectPath).toBe(`/objects/tenants/${TENANT_A}/uploads/uuid`);
  });

  it("rejects a second tenant on the same namespaced object", async () => {
    const res = await request(app)
      .get(`/api/storage/objects/tenants/${TENANT_A}/uploads/secret`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
  });
});
