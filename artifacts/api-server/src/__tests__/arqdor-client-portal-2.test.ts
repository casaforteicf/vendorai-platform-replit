import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "src/routes/portal.ts"), "utf8");

describe("Arqdor Client Portal 2.0 contracts", () => {
  it("supports private customer registration/login and hashed sessions", () => {
    expect(source).toContain('"/portal/obra/:token/register"');
    expect(source).toContain('"/portal/obra/:token/login"');
    expect(source).toContain("bcrypt.hash");
    expect(source).toContain("bcrypt.compare");
    expect(source).toContain("hashPortalToken");
    expect(source).toContain("obra_portal_sessions");
  });

  it("links executive balance and commercial proposal data to the obra", () => {
    expect(source).toContain("executiveBalance");
    expect(source).toContain("plannedProgress");
    expect(source).toContain("actualProgress");
    expect(source).toContain("arch_proposals");
    expect(source).toContain("arch_budgets");
    expect(source).toContain("arch_proposal_items");
  });

  it("keeps client documents, invoices, support and chat behind publication/auth controls", () => {
    expect(source).toContain("obra_portal_documents");
    expect(source).toContain("showContracts");
    expect(source).toContain("showManuals");
    expect(source).toContain("showInvoices");
    expect(source).toContain("obra_portal_support_tickets");
    expect(source).toContain("obra_portal_messages");
    expect(source).toContain("resolvePortalUser");
  });

  it("allows tenant staff to manage portal content with authenticated tenant checks", () => {
    expect(source).toContain("canManagePortal");
    expect(source).toContain('"/tenants/:tenantId/obras/:obraId/portal/documents"');
    expect(source).toContain('"/tenants/:tenantId/obras/:obraId/portal/support"');
    expect(source).toContain('"/tenants/:tenantId/obras/:obraId/portal/messages"');
  });
  it("supports the complete publication engine, client responses, audit and Vendi", () => {
    expect(source).toContain("obra_portal_items");
    expect(source).toContain("obra_portal_item_responses");
    expect(source).toContain("obra_portal_audit");
    expect(source).toContain('"/portal/obra/:token/items/:itemId/respond"');
    expect(source).toContain('"/portal/obra/:token/vendi"');
    expect(source).toContain('"/tenants/:tenantId/obras/:obraId/portal/items"');
    expect(source).toContain('"/tenants/:tenantId/obras/:obraId/portal/audit"');
    expect(source).toContain("itemIsPublishedByConfig");
    expect(source).toContain("getOpenAIForTenant");
  });

  it("keeps internal construction costs private and supports granular publication", () => {
    expect(source).toContain("visible_to_client=true");
    expect(source).toContain("showUnitPrice");
    expect(source).toContain("showTotal");
    expect(source).toContain("precoUnitarioCliente");
    expect(source).toContain("valorTotalCliente");
    expect(source).toContain('"/tenants/:tenantId/obras/:obraId/portal/budget-items"');
    expect(source).not.toContain("Custo realizado");
  });

});

[executed on device: vmi3624448 (5bc1259f-2bcf-417a-b2e2-7864f48f2673)]