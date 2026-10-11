import { describe, expect, it, vi } from "vitest";
import { authorizeSharedDirectory } from "./shared-directory-authorization.js";
import type { Request, Response, NextFunction } from "express";

function attempt(method: string, role?: string, originalUrl?: string) {
  const next = vi.fn();
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  authorizeSharedDirectory(
    { method, originalUrl, user: role ? { platformRole: role, tenantId: "tenant-b" } : undefined } as unknown as Request,
    { status } as unknown as Response, next as NextFunction,
  );
  return { next, status, json };
}
describe("shared platform directory authorization", () => {
  it.each(["POST", "PATCH", "PUT", "DELETE"])("blocks tenant-admin %s before the directory handler", method => {
    const r = attempt(method, "tenant_admin");
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.next).not.toHaveBeenCalled();
  });
  it("does not allow the authenticated regular user to delete another company's record", () => {
    const r = attempt("DELETE", "user");
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.next).not.toHaveBeenCalled();
  });
  it("denies unauthenticated reads", () => {
    const r = attempt("GET");
    expect(r.status).toHaveBeenCalledWith(401);
    expect(r.next).not.toHaveBeenCalled();
  });
  it("keeps tenant browsing available", () => {
    const r = attempt("GET", "tenant_admin");
    expect(r.next).toHaveBeenCalledOnce();
    expect(r.status).not.toHaveBeenCalled();
  });
  it.each(["POST", "PATCH", "PUT", "DELETE"])("allows Superadmin %s through the existing handler", method => {
    const r = attempt(method, "super_admin");
    expect(r.next).toHaveBeenCalledOnce();
    expect(r.status).not.toHaveBeenCalled();
  });
  it("lets an authenticated tenant follow a directory company (relationship action, not a directory mutation)", () => {
    const r = attempt("POST", "tenant_admin", "/api/ecosystem-hub/companies/abc-123/follow");
    expect(r.next).toHaveBeenCalledOnce();
    expect(r.status).not.toHaveBeenCalled();
  });
  it("still blocks a non-admin mutation of a directory record even with a follow-like suffix elsewhere", () => {
    const r = attempt("DELETE", "tenant_admin", "/api/ecosystem-hub/companies/abc-123");
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.next).not.toHaveBeenCalled();
  });
});
