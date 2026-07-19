import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/jwt.js", () => ({
  verifyToken: vi.fn(),
}));

import {
  collectTenantScopes,
  enforceTenantPath,
} from "./tenant-path-guard.js";

const tenantUser = {
  sub: "user-1",
  email: "user@example.com",
  platformRole: "tenant_admin" as const,
  tenantId: "tenant-a",
  role: "admin" as const,
};

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    path: "/api/leads",
    params: {},
    query: {},
    body: {},
    headers: {},
    user: tenantUser,
    ...overrides,
  } as Request;
}

function makeResponse() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return {
    response: { status } as unknown as Response,
    status,
    json,
  };
}

describe("collectTenantScopes", () => {
  it("collects tenant scope from path, query, nested body, header and resolved domain", () => {
    const req = makeRequest({
      path: "/api/tenants/tenant-a/leads",
      query: { tenant_id: "tenant-a" },
      body: { context: { tenantId: "tenant-a" } },
      headers: { "x-tenant-id": "tenant-a" },
      tenantId: "tenant-a",
    });

    expect(collectTenantScopes(req)).toEqual(
      expect.arrayContaining([
        { source: "path", value: "tenant-a" },
        { source: "query.tenant_id", value: "tenant-a" },
        { source: "body.context.tenantId", value: "tenant-a" },
        { source: "header.x-tenant-id", value: "tenant-a" },
        { source: "resolved-domain", value: "tenant-a" },
      ]),
    );
  });
});

describe("enforceTenantPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows matching tenant scopes", () => {
    const req = makeRequest({
      path: "/api/tenants/tenant-a/leads",
      query: { tenantId: "tenant-a" },
      body: { tenant_id: "tenant-a" },
      tenantId: "tenant-a",
    });
    const { response, status } = makeResponse();
    const next = vi.fn();

    enforceTenantPath(req, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("blocks a tenant id mismatch in the URL", () => {
    const req = makeRequest({ path: "/api/tenants/tenant-b/leads" });
    const { response, status, json } = makeResponse();
    const next = vi.fn();

    enforceTenantPath(req, response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: "Access denied to this tenant",
      code: "TENANT_SCOPE_MISMATCH",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks a tenant id mismatch in the query string", () => {
    const req = makeRequest({ query: { tenantId: "tenant-b" } });
    const { response, status } = makeResponse();
    const next = vi.fn();

    enforceTenantPath(req, response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks a nested tenant id mismatch in the request body", () => {
    const req = makeRequest({ body: { payload: { tenant_id: "tenant-b" } } });
    const { response, status } = makeResponse();
    const next = vi.fn();

    enforceTenantPath(req, response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks a JWT tenant that differs from the resolved custom domain", () => {
    const req = makeRequest({ tenantId: "tenant-b" });
    const { response, status } = makeResponse();
    const next = vi.fn();

    enforceTenantPath(req, response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows super admins to operate across tenants", () => {
    const req = makeRequest({
      path: "/api/tenants/tenant-b/leads",
      user: { ...tenantUser, platformRole: "super_admin" },
    });
    const { response, status } = makeResponse();
    const next = vi.fn();

    enforceTenantPath(req, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("defers unauthenticated requests to the authentication middleware", () => {
    const req = makeRequest({
      path: "/api/tenants/tenant-b/leads",
      user: undefined,
    });
    const { response, status } = makeResponse();
    const next = vi.fn();

    enforceTenantPath(req, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });
});
