import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  tenantsTable,
  tenantDomainsTable,
  insertTenantDomainSchema,
  updateTenantDomainSchema,
} from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth.js";
import {
  createCustomHostname,
  getCustomHostname,
  deleteCustomHostname,
  getDnsInstructions,
} from "../lib/cloudflare.js";
import { z } from "zod/v4";

const router: IRouter = Router();

// Domain name validation (FQDN)
const domainRegex = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)\.(?:[a-zA-Z]{2,}|(xn--)[a-zA-Z0-9]+)$|^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)\.(?:[a-zA-Z0-9-]{1,63}\.)+(?:[a-zA-Z]{2,}|(xn--)[a-zA-Z0-9]+)$/;

function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  return domainRegex.test(domain);
}

// ── GET /tenants/:tenantId/domains ───────────────────────────────────────────
router.get("/tenants/:tenantId/domains", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      subdomainSlug: tenantsTable.subdomainSlug,
      slug: tenantsTable.slug,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const domains = await db
    .select()
    .from(tenantDomainsTable)
    .where(eq(tenantDomainsTable.tenantId, tenantId))
    .orderBy(tenantDomainsTable.createdAt);

  const subdomainUrl = tenant.subdomainSlug
    ? `https://${tenant.subdomainSlug}.vendor.ai`
    : null;

  const publicSiteUrl = `/api/public/${tenant.slug}/site`;

  res.json({
    tenantId,
    subdomainSlug: tenant.subdomainSlug,
    subdomainUrl,
    publicSiteUrl,
    domains,
  });
});

// ── POST /tenants/:tenantId/domains ──────────────────────────────────────────
router.post("/tenants/:tenantId/domains", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const body = req.body as { domain?: string };

  if (!body.domain || !isValidDomain(body.domain)) {
    res.status(400).json({ error: "Invalid domain name. Provide a valid FQDN (e.g., example.com.br)." });
    return;
  }

  const domain = body.domain.toLowerCase().trim();

  // Check if domain already exists for another tenant
  const [existingDomain] = await db
    .select({ tenantId: tenantDomainsTable.tenantId })
    .from(tenantDomainsTable)
    .where(eq(tenantDomainsTable.domain, domain));

  if (existingDomain && existingDomain.tenantId !== tenantId) {
    res.status(409).json({ error: "Domain already registered by another tenant" });
    return;
  }

  if (existingDomain) {
    res.status(409).json({ error: "Domain already registered for this tenant" });
    return;
  }

  // Create in Cloudflare (if configured)
  let cfId: string | null = null;
  let cfStatus = "pending_dns";
  let dnsName = "";
  let dnsValue = "";

  try {
    const cf = await createCustomHostname(domain);
    cfId = cf.id;
    cfStatus = cf.sslStatus === "active" ? "active" : "pending_dns";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.warn({ error: msg, domain }, "Cloudflare custom hostname creation failed");
    // Continue without Cloudflare integration — domain is registered but needs manual setup
    cfStatus = "pending_dns";
  }

  const dnsInstructions = getDnsInstructions(domain);
  dnsName = dnsInstructions.name;
  dnsValue = dnsInstructions.value;

  const [record] = await db
    .insert(tenantDomainsTable)
    .values({
      tenantId,
      domain,
      status: cfStatus as "pending_dns" | "pending_ssl" | "active" | "failed",
      cloudflareCustomHostnameId: cfId,
      dnsRecordName: dnsName,
      dnsRecordValue: dnsValue,
    })
    .returning();

  res.status(201).json({
    ...record,
    dnsRecordName: dnsName,
    dnsRecordValue: dnsValue,
    dnsInstructions: {
      recordType: "CNAME",
      name: dnsName,
      value: dnsValue,
    },
  });
});

// ── GET /tenants/:tenantId/domains/:domainId/status ──────────────────────────
router.get(
  "/tenants/:tenantId/domains/:domainId/status",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const domainId = String(req.params["domainId"]);

    const [domain] = await db
      .select()
      .from(tenantDomainsTable)
      .where(
        and(
          eq(tenantDomainsTable.id, domainId),
          eq(tenantDomainsTable.tenantId, tenantId)
        )
      );

    if (!domain) {
      res.status(404).json({ error: "Domain not found" });
      return;
    }

    // Poll Cloudflare status if we have an ID
    if (domain.cloudflareCustomHostnameId) {
      try {
        const cf = await getCustomHostname(domain.cloudflareCustomHostnameId);
        let status: "pending_dns" | "pending_ssl" | "active" | "failed";
        if (cf.status === "active" && cf.sslStatus === "active") {
          status = "active";
        } else if (cf.status === "active" && cf.sslStatus !== "active") {
          status = "pending_ssl";
        } else {
          status = "pending_dns";
        }

        if (status !== domain.status) {
          await db
            .update(tenantDomainsTable)
            .set({ status, updatedAt: new Date() })
            .where(eq(tenantDomainsTable.id, domainId));
          domain.status = status;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        req.log.warn({ error: msg, domainId }, "Cloudflare status check failed");
      }
    }

    res.json({
      domain,
      dnsInstructions: {
        recordType: "CNAME",
        name: domain.dnsRecordName,
        value: domain.dnsRecordValue,
      },
    });
  }
);

// ── POST /tenants/:tenantId/domains/:domainId/verify ─────────────────────────
router.post(
  "/tenants/:tenantId/domains/:domainId/verify",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const domainId = String(req.params["domainId"]);

    const [domain] = await db
      .select()
      .from(tenantDomainsTable)
      .where(
        and(
          eq(tenantDomainsTable.id, domainId),
          eq(tenantDomainsTable.tenantId, tenantId)
        )
      );

    if (!domain) {
      res.status(404).json({ error: "Domain not found" });
      return;
    }

    if (!domain.cloudflareCustomHostnameId) {
      res.status(400).json({ error: "No Cloudflare custom hostname configured for this domain" });
      return;
    }

    try {
      const cf = await getCustomHostname(domain.cloudflareCustomHostnameId);
      let status: "pending_dns" | "pending_ssl" | "active" | "failed";
      if (cf.status === "active" && cf.sslStatus === "active") {
        status = "active";
      } else if (cf.status === "active" && cf.sslStatus !== "active") {
        status = "pending_ssl";
      } else {
        status = "pending_dns";
      }

      await db
        .update(tenantDomainsTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(tenantDomainsTable.id, domainId));

      res.json({
        domain: { ...domain, status },
        cloudflareStatus: cf.status,
        cloudflareSslStatus: cf.sslStatus,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Cloudflare API error: ${msg}` });
    }
  }
);

// ── DELETE /tenants/:tenantId/domains/:domainId ───────────────────────────────
router.delete(
  "/tenants/:tenantId/domains/:domainId",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const domainId = String(req.params["domainId"]);

    const [domain] = await db
      .select()
      .from(tenantDomainsTable)
      .where(
        and(
          eq(tenantDomainsTable.id, domainId),
          eq(tenantDomainsTable.tenantId, tenantId)
        )
      );

    if (!domain) {
      res.status(404).json({ error: "Domain not found" });
      return;
    }

    // Delete from Cloudflare if we have an ID
    if (domain.cloudflareCustomHostnameId) {
      try {
        await deleteCustomHostname(domain.cloudflareCustomHostnameId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        req.log.warn({ error: msg, domainId }, "Cloudflare deletion failed, continuing");
      }
    }

    await db
      .delete(tenantDomainsTable)
      .where(eq(tenantDomainsTable.id, domainId));

    res.status(204).send();
  }
);

export default router;
