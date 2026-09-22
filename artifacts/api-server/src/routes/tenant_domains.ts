import { Router, type IRouter } from "express";
import { resolveCname } from "node:dns/promises";
import { eq, and } from "drizzle-orm";
import {
  db,
  tenantsTable,
  tenantDomainsTable,
} from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth.js";
import {
  createOrGetCustomHostname,
  getCustomHostname,
  deleteCustomHostname,
  getDnsInstructions,
  getCloudflareCustomDomainConfig,
} from "../lib/cloudflare.js";

const router: IRouter = Router();

type DomainStatus = "pending_dns" | "pending_ssl" | "active" | "failed";

type DnsCheck = {
  checked: boolean;
  matches: boolean;
  expected: string | null;
  answers: string[];
  error: string | null;
};

// Domain name validation (FQDN)
const domainRegex = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)\.(?:[a-zA-Z]{2,}|(xn--)[a-zA-Z0-9]+)$|^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)\.(?:[a-zA-Z0-9-]{1,63}\.)+(?:[a-zA-Z]{2,}|(xn--)[a-zA-Z0-9]+)$/;

function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  return domainRegex.test(domain);
}

function normalizeDnsValue(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/\.$/, "");
}

async function inspectCname(name: string | null, expected: string | null): Promise<DnsCheck> {
  const recordName = normalizeDnsValue(name);
  const expectedValue = normalizeDnsValue(expected);
  if (!recordName || !expectedValue) {
    return {
      checked: false,
      matches: false,
      expected: expectedValue || null,
      answers: [],
      error: "DNS instructions are not available for this domain",
    };
  }

  try {
    const answers = (await resolveCname(recordName)).map(normalizeDnsValue).filter(Boolean);
    return {
      checked: true,
      matches: answers.includes(expectedValue),
      expected: expectedValue,
      answers,
      error: null,
    };
  } catch (error: unknown) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    const message = error instanceof Error ? error.message : String(error);
    const waitingForPropagation = ["ENODATA", "ENOTFOUND", "ESERVFAIL", "ETIMEOUT", "EREFUSED"].includes(code);
    return {
      checked: true,
      matches: false,
      expected: expectedValue,
      answers: [],
      error: waitingForPropagation ? null : message,
    };
  }
}

function statusFromCloudflare(cf: { status: string; sslStatus: string }, dnsCheck: DnsCheck): DomainStatus {
  if (cf.status === "active" && cf.sslStatus === "active") return "active";
  if (cf.status === "active" || dnsCheck.matches) return "pending_ssl";
  return "pending_dns";
}

async function findTenantDomain(tenantId: string, domainId: string) {
  const [domain] = await db
    .select()
    .from(tenantDomainsTable)
    .where(
      and(
        eq(tenantDomainsTable.id, domainId),
        eq(tenantDomainsTable.tenantId, tenantId),
      ),
    );
  return domain ?? null;
}

type ProvisionableTenantDomain = {
  id: string;
  domain: string;
  cloudflareCustomHostnameId: string | null;
};

type DnsRefreshableTenantDomain = ProvisionableTenantDomain & {
  dnsRecordName: string | null;
  dnsRecordValue: string | null;
};

async function refreshDnsInstructions(domain: DnsRefreshableTenantDomain) {
  const instructions = getDnsInstructions(domain.domain);
  const nextValue = instructions.value || null;
  const changed =
    domain.dnsRecordName !== instructions.name ||
    domain.dnsRecordValue !== nextValue;

  if (changed) {
    await db
      .update(tenantDomainsTable)
      .set({
        dnsRecordName: instructions.name,
        dnsRecordValue: nextValue,
        updatedAt: new Date(),
      })
      .where(eq(tenantDomainsTable.id, domain.id));

    domain.dnsRecordName = instructions.name;
    domain.dnsRecordValue = nextValue;
  }

  return instructions;
}

async function loadOrProvisionCloudflareHostname(domain: ProvisionableTenantDomain) {
  const config = getCloudflareCustomDomainConfig();
  if (!config.apiConfigured) return null;

  if (domain.cloudflareCustomHostnameId) {
    return getCustomHostname(domain.cloudflareCustomHostnameId);
  }

  const cf = await createOrGetCustomHostname(domain.domain);
  await db
    .update(tenantDomainsTable)
    .set({
      cloudflareCustomHostnameId: cf.id,
      updatedAt: new Date(),
    })
    .where(eq(tenantDomainsTable.id, domain.id));

  domain.cloudflareCustomHostnameId = cf.id;
  return cf;
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
    ? `https://${tenant.subdomainSlug}.appvendorai.com`
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
    res.status(400).json({ error: "Invalid domain name. Provide a valid FQDN (e.g., lp.example.com.br)." });
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

  // Create in Cloudflare (if configured). Registration remains tenant-scoped
  // even when Cloudflare is temporarily unavailable so the assistant can still
  // show and validate the expected DNS record.
  let cfId: string | null = null;
  let cfStatus: DomainStatus = "pending_dns";

  try {
    const cf = await createOrGetCustomHostname(domain);
    cfId = cf.id;
    cfStatus = cf.status === "active" && cf.sslStatus === "active" ? "active" : "pending_dns";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.warn({ error: msg, domain }, "Cloudflare custom hostname creation failed");
  }

  const dnsInstructions = getDnsInstructions(domain);

  const [record] = await db
    .insert(tenantDomainsTable)
    .values({
      tenantId,
      domain,
      status: cfStatus,
      cloudflareCustomHostnameId: cfId,
      dnsRecordName: dnsInstructions.name,
      dnsRecordValue: dnsInstructions.value || null,
    })
    .returning();

  res.status(201).json({
    ...record,
    dnsInstructions: {
      recordType: "CNAME",
      name: dnsInstructions.name,
      value: dnsInstructions.value,
    },
    provisioningAvailable: Boolean(cfId),
    infrastructure: getCloudflareCustomDomainConfig(),
  });
});

// ── GET /tenants/:tenantId/domains/:domainId/status ──────────────────────────
router.get(
  "/tenants/:tenantId/domains/:domainId/status",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const domainId = String(req.params["domainId"]);
    const domain = await findTenantDomain(tenantId, domainId);

    if (!domain) {
      res.status(404).json({ error: "Domain not found" });
      return;
    }

    await refreshDnsInstructions(domain);
    const dnsCheck = await inspectCname(domain.dnsRecordName, domain.dnsRecordValue);
    let cloudflareStatus: string | null = null;
    let cloudflareSslStatus: string | null = null;

    try {
      const cf = await loadOrProvisionCloudflareHostname(domain);
      if (cf) {
        cloudflareStatus = cf.status;
        cloudflareSslStatus = cf.sslStatus;
        const status = statusFromCloudflare(cf, dnsCheck);

        if (status !== domain.status) {
          await db
            .update(tenantDomainsTable)
            .set({ status, updatedAt: new Date() })
            .where(eq(tenantDomainsTable.id, domainId));
          domain.status = status;
        }
      } else if (dnsCheck.matches && domain.status === "pending_dns") {
        await db
          .update(tenantDomainsTable)
          .set({ status: "pending_ssl", updatedAt: new Date() })
          .where(eq(tenantDomainsTable.id, domainId));
        domain.status = "pending_ssl";
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      req.log.warn({ error: msg, domainId }, "Cloudflare status check/provisioning failed");
    }

    if (!domain.cloudflareCustomHostnameId && dnsCheck.matches && domain.status === "pending_dns") {
      // DNS is correct, but without a provisioned custom hostname we cannot
      // truthfully mark SSL/site activation as complete.
      await db
        .update(tenantDomainsTable)
        .set({ status: "pending_ssl", updatedAt: new Date() })
        .where(eq(tenantDomainsTable.id, domainId));
      domain.status = "pending_ssl";
    }

    res.json({
      domain,
      dnsInstructions: {
        recordType: "CNAME",
        name: domain.dnsRecordName,
        value: domain.dnsRecordValue,
      },
      dnsCheck,
      provisioningAvailable: Boolean(domain.cloudflareCustomHostnameId),
      infrastructure: getCloudflareCustomDomainConfig(),
      cloudflareStatus,
      cloudflareSslStatus,
    });
  },
);

// ── POST /tenants/:tenantId/domains/:domainId/verify ─────────────────────────
router.post(
  "/tenants/:tenantId/domains/:domainId/verify",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const domainId = String(req.params["domainId"]);
    const domain = await findTenantDomain(tenantId, domainId);

    if (!domain) {
      res.status(404).json({ error: "Domain not found" });
      return;
    }

    await refreshDnsInstructions(domain);
    const dnsCheck = await inspectCname(domain.dnsRecordName, domain.dnsRecordValue);

    // Re-attempt provisioning on every explicit verification. This self-heals
    // domains created while Cloudflare credentials/origin were temporarily
    // unavailable and also recovers an existing hostname already present in
    // Cloudflare.
    try {
      await loadOrProvisionCloudflareHostname(domain);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      req.log.warn({ error: msg, domainId }, "Cloudflare reprovisioning failed");
    }

    // DNS verification remains useful even if Cloudflare provisioning is not
    // available. It lets the UI distinguish "record not created" from
    // "record correct, waiting for SSL/provisioning" instead of returning a
    // generic error to the customer.
    if (!domain.cloudflareCustomHostnameId) {
      const status: DomainStatus = dnsCheck.matches ? "pending_ssl" : "pending_dns";
      if (status !== domain.status) {
        await db
          .update(tenantDomainsTable)
          .set({ status, updatedAt: new Date() })
          .where(eq(tenantDomainsTable.id, domainId));
      }

      res.json({
        domain: { ...domain, status },
        dnsCheck,
        provisioningAvailable: false,
        cloudflareStatus: null,
        cloudflareSslStatus: null,
        infrastructure: getCloudflareCustomDomainConfig(),
        message: dnsCheck.matches
          ? "DNS verified. VendorAI hosting still needs custom-hostname/SSL provisioning before publication can be enabled."
          : "CNAME not found yet. Check the DNS record and propagation.",
      });
      return;
    }

    try {
      const cf = await getCustomHostname(domain.cloudflareCustomHostnameId);
      const status = statusFromCloudflare(cf, dnsCheck);

      await db
        .update(tenantDomainsTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(tenantDomainsTable.id, domainId));

      res.json({
        domain: { ...domain, status },
        dnsCheck,
        provisioningAvailable: true,
        cloudflareStatus: cf.status,
        cloudflareSslStatus: cf.sslStatus,
        infrastructure: getCloudflareCustomDomainConfig(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      req.log.warn({ error: msg, domainId }, "Cloudflare verification failed");
      res.status(502).json({
        error: `Cloudflare API error: ${msg}`,
        dnsCheck,
      });
    }
  },
);

// ── DELETE /tenants/:tenantId/domains/:domainId ───────────────────────────────
router.delete(
  "/tenants/:tenantId/domains/:domainId",
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["tenantId"]);
    const domainId = String(req.params["domainId"]);
    const domain = await findTenantDomain(tenantId, domainId);

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
  },
);

export default router;
