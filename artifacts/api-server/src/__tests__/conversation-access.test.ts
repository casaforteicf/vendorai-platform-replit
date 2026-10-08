import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("@workspace/db", () => ({
  db: { select: mockSelect },
  conversationsTable: { id: "id", tenantId: "tenantId", assignedTo: "assignedTo", leadId: "leadId", whatsappConnectionId: "whatsappConnectionId" },
  leadsTable: { id: "id", assignedTo: "assignedTo" },
  usersTable: { id: "id", permissions: "permissions", platformRole: "platformRole", userFunction: "userFunction" },
  whatsappConnectionsTable: { id: "id", assignedUserId: "assignedUserId" },
}));

import { canViewAllConversations } from "../lib/conversation-access.js";

function setupUser(user: Record<string, unknown>) {
  const limit = vi.fn().mockResolvedValue([user]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mockSelect.mockReturnValue({ from });
}

describe("canViewAllConversations — admin-only global visibility", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies a regular user even when conversations:view_all was assigned by mistake", async () => {
    setupUser({ permissions: ["conversations:view_all"], platformRole: "tenant_seller", userFunction: "vendedor" });
    const req = { user: { sub: "seller-1", tenantId: "tenant-a", platformRole: "tenant_seller", userFunction: "vendedor" } } as any;
    await expect(canViewAllConversations(req)).resolves.toBe(false);
  });

  it("allows a tenant admin when conversations:view_all is explicitly granted", async () => {
    setupUser({ permissions: ["conversations:view_all"], platformRole: "tenant_admin", userFunction: "administrador" });
    const req = { user: { sub: "admin-1", tenantId: "tenant-a", platformRole: "tenant_admin", userFunction: "administrador" } } as any;
    await expect(canViewAllConversations(req)).resolves.toBe(true);
  });

  it("allows super_admin independently of tenant permissions", async () => {
    const req = { user: { sub: "super-1", platformRole: "super_admin" } } as any;
    await expect(canViewAllConversations(req)).resolves.toBe(true);
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
