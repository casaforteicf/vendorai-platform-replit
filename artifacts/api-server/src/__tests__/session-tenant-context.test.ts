import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { select: mockSelect },
  tenantsTable: {
    id: "tenant.id",
    vertical: "tenant.vertical",
    logoUrl: "tenant.logoUrl",
    whiteLabelCompleto: "tenant.whiteLabelCompleto",
    organizacaoId: "tenant.organizacaoId",
  },
  usuariosOrganizacaoTable: {
    id: "membership.id",
    userId: "membership.userId",
    organizacaoId: "membership.organizacaoId",
  },
}));

import { resolveSessionTenantContext } from "../lib/session-tenant-context.js";

function selectRows(...responses: Record<string, unknown>[][]) {
  for (const rows of responses) {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
    });
  }
}

describe("resolveSessionTenantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mantém o tenant-base sem exigir vínculo de organização", async () => {
    selectRows([
      {
        id: "tenant-a",
        vertical: "construcao",
        logoUrl: null,
        whiteLabelCompleto: false,
        organizacaoId: "org-a",
      },
    ]);

    const result = await resolveSessionTenantContext({
      userId: "user-1",
      baseTenantId: "tenant-a",
      tokenTenantId: "tenant-a",
    });

    expect(result).toEqual({
      ok: true,
      tenant: {
        id: "tenant-a",
        vertical: "construcao",
        logoUrl: null,
        whiteLabelCompleto: false,
        organizacaoId: "org-a",
      },
    });
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("permite superadmin operar tenant alternado sem vínculo de organização", async () => {
    selectRows([
      {
        id: "tenant-c",
        vertical: "construcao",
        logoUrl: null,
        whiteLabelCompleto: false,
        organizacaoId: "org-c",
      },
    ]);

    const result = await resolveSessionTenantContext({
      userId: "super-1",
      baseTenantId: "platform-tenant",
      tokenTenantId: "tenant-c",
      platformRole: "super_admin",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tenant.id).toBe("tenant-c");
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("preserva tenant alternado do JWT quando pertence à mesma organização e o usuário é membro", async () => {
    selectRows(
      [
        {
          id: "tenant-b",
          vertical: "construcao",
          logoUrl: "logo-b",
          whiteLabelCompleto: true,
          organizacaoId: "org-a",
        },
      ],
      [{ organizacaoId: "org-a" }],
      [{ id: "membership-1" }],
    );

    const result = await resolveSessionTenantContext({
      userId: "user-1",
      baseTenantId: "tenant-a",
      tokenTenantId: "tenant-b",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tenant.id).toBe("tenant-b");
    expect(mockSelect).toHaveBeenCalledTimes(3);
  });

  it("bloqueia tenant alternado de outra organização", async () => {
    selectRows(
      [
        {
          id: "tenant-c",
          vertical: "construcao",
          logoUrl: null,
          whiteLabelCompleto: false,
          organizacaoId: "org-b",
        },
      ],
      [{ organizacaoId: "org-a" }],
    );

    const result = await resolveSessionTenantContext({
      userId: "user-1",
      baseTenantId: "tenant-a",
      tokenTenantId: "tenant-c",
    });

    expect(result).toEqual({ ok: false, reason: "cross_org" });
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("bloqueia tenant alternado quando o vínculo da organização foi removido", async () => {
    selectRows(
      [
        {
          id: "tenant-b",
          vertical: "construcao",
          logoUrl: null,
          whiteLabelCompleto: false,
          organizacaoId: "org-a",
        },
      ],
      [{ organizacaoId: "org-a" }],
      [],
    );

    const result = await resolveSessionTenantContext({
      userId: "user-1",
      baseTenantId: "tenant-a",
      tokenTenantId: "tenant-b",
    });

    expect(result).toEqual({ ok: false, reason: "membership_missing" });
    expect(mockSelect).toHaveBeenCalledTimes(3);
  });
});
