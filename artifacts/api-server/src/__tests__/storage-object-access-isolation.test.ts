import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const {
  mockGetObjectEntityFile,
  mockDownloadObject,
  mockSearchPublicObject,
  mockPoolQuery,
  mockVerifyToken,
} = vi.hoisted(() => ({
  mockGetObjectEntityFile: vi.fn(),
  mockDownloadObject: vi.fn(),
  mockSearchPublicObject: vi.fn(),
  mockPoolQuery: vi.fn(),
  mockVerifyToken: vi.fn(),
}));

vi.mock("@workspace/api-zod", () => ({
  RequestUploadUrlBody: { safeParse: vi.fn(() => ({ success: false })) },
  RequestUploadUrlResponse: { parse: vi.fn((value: unknown) => value) },
}));

vi.mock("@workspace/db", () => ({
  pool: { query: mockPoolQuery },
}));

vi.mock("../lib/jwt.js", () => ({
  verifyToken: mockVerifyToken,
}));

vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {}
  class ObjectStorageService {
    getObjectEntityFile = mockGetObjectEntityFile;
    downloadObject = mockDownloadObject;
    searchPublicObject = mockSearchPublicObject;
    getObjectEntityUploadURL = vi.fn();
    normalizeObjectEntityPath = vi.fn();
  }
  return { ObjectStorageService, ObjectNotFoundError };
});

import storageRouter from "../routes/storage.js";

const app = express();
app.use(express.json());
app.use("/api", (req, _res, next) => {
  (req as any).log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  next();
}, storageRouter);

describe("storage object access isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyToken.mockImplementation((token: string) => {
      if (token === "token-a") return { sub: "user-a", tenantId: "tenant-a", platformRole: "tenant_admin" };
      if (token === "token-b") return { sub: "user-b", tenantId: "tenant-b", platformRole: "tenant_admin" };
      if (token === "super") return { sub: "sa", tenantId: "platform", platformRole: "super_admin" };
      throw new Error("invalid token");
    });
    mockGetObjectEntityFile.mockResolvedValue({ bucketName: "private", objectName: "file.png" });
    mockDownloadObject.mockResolvedValue(new Response(Buffer.from("private-ok"), {
      status: 200,
      headers: { "content-type": "image/png" },
    }));
    mockSearchPublicObject.mockResolvedValue({ bucketName: "public", objectName: "logo.png" });
    mockPoolQuery.mockResolvedValue({ rows: [{ allowed: false }] });
  });

  it("returns 401 for an anonymous private object request", async () => {
    const res = await request(app).get("/api/storage/objects/tenants/tenant-a/file.png");

    expect(res.status).toBe(401);
    expect(mockGetObjectEntityFile).not.toHaveBeenCalled();
  });

  it("returns 403 when tenant A requests an object under tenant B prefix", async () => {
    const res = await request(app)
      .get("/api/storage/objects/tenants/tenant-b/file.png")
      .set("Authorization", "Bearer token-a");

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Cross-tenant");
    expect(mockGetObjectEntityFile).not.toHaveBeenCalled();
  });

  it("streams a private object owned by the authenticated tenant", async () => {
    const res = await request(app)
      .get("/api/storage/objects/tenants/tenant-a/file.png")
      .set("Authorization", "Bearer token-a");

    expect(res.status).toBe(200);
    expect(mockGetObjectEntityFile).toHaveBeenCalledWith("/objects/tenants/tenant-a/file.png");
    expect(mockDownloadObject).toHaveBeenCalled();
    expect(res.headers["cache-control"]).toBe("private, max-age=900");
  });

  it("keeps explicitly public objects accessible without a private session", async () => {
    const res = await request(app).get("/api/storage/public-objects/logo.png");

    expect(res.status).toBe(200);
    expect(mockSearchPublicObject).toHaveBeenCalledWith("logo.png");
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("allows super admin private-object access without tenant-prefix matching", async () => {
    const res = await request(app)
      .get("/api/storage/objects/tenants/tenant-b/file.png")
      .set("Authorization", "Bearer super");

    expect(res.status).toBe(200);
    expect(mockGetObjectEntityFile).toHaveBeenCalled();
  });
});
