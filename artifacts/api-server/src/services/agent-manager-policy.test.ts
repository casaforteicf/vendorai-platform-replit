import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  classifyManagerDemand,
  isManagerDue,
  managerExecutionBucket,
  managerTenantPageOffset,
  managerSupportSourceRef,
  validateManagerOpportunity,
} from "./agent-manager-policy.js";

describe("agent manager policy", () => {
  it("rejects oversized opportunity payloads before they reach persistence", () => {
    const base = { tenantId: "tenant-1", domain: "crm" as const, kind: "tenant_operation" as const, fingerprint: "ok", evidence: "observação" };
    expect(() => validateManagerOpportunity({ ...base, fingerprint: "x".repeat(513) })).toThrow("FINGERPRINT_TOO_LONG");
    expect(() => validateManagerOpportunity({ ...base, evidence: "x".repeat(8001) })).toThrow("EVIDENCE_TOO_LONG");
    expect(() => validateManagerOpportunity(base)).not.toThrow();
  });

  it("tracks 24-hour Omnichannel response backlog separately", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    expect(source).toContain("active-manager:omnichannel:unread-conversations");
    expect(source).toContain("active-manager:omnichannel:unread-over-24h");
    expect(source).toContain('domain === "omnichannel" && !secondaryObservation');
  });

  it("tracks critical pipeline delays independently of routine overdue activity", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    expect(source).toContain("active-manager:pipeline:overdue-activities");
    expect(source).toContain("active-manager:pipeline:severely-overdue-activities");
    expect(source).toContain("interval '7 days'");
    expect(source).toContain('domain === "pipeline" && !secondaryObservation');
    expect(source).toContain("for (const observation of observations)");
  });

  it("records CRM ownership and follow-up signals independently in one cycle", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    expect(source).toContain("active-manager:crm:unassigned-leads");
    expect(source).toContain("active-manager:crm:old-leads-without-activities");
    expect(source).toContain("for (const observation of observations)");
    expect(source).toContain("let findingsCount = 0");
    expect(source).toContain("hadCollision ?");
    expect(source).toContain("findingsCount],");
    expect(source).toContain("if (!observation && !secondaryObservation)");
    expect(source).toContain("domain === \"crm\" && !secondaryObservation");
  });

  it("routes Master scanner incidents to Superadmin after transaction commit", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    expect(source).toContain('if (domain === "master" && observation)');
    expect(source).toContain('kind: "platform_defect"');
    expect(source).toContain('enqueueManagerSupportReview({');
    expect(source.indexOf('enqueueManagerSupportReview({'))
      .toBeGreaterThan(source.indexOf('await client.query("COMMIT");', source.indexOf('for (const tenantId of tenantIds)')));
    expect(source).toContain('priority: "alta"');
  });

  it("retries failed cadence scans and replaces their durable result", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    expect(source).toContain("SELECT outcome FROM agent_manager_runs");
    expect(source).toContain("alreadyDone.rows[0].outcome !== 'failed'");
    expect(source).toContain("ON CONFLICT (tenant_id,domain,period_key) DO UPDATE SET outcome=EXCLUDED.outcome");
    expect(source).toContain("finding_count=EXCLUDED.finding_count, checked_at=now()");
    // Failures remain inspectable, while a successful retry becomes completed.
    expect(source).toContain("'failed',0");
    expect(source).toContain("'completed',0");
  });

  it("makes failed scan retries observable", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    expect(source).toContain("alreadyDone.rows[0]?.outcome === 'failed'");
    expect(source).toContain("active-managers: retrying failed scan");
  });

  it("records failed tenant domain scans for the Master Manager after rollback", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    const errorHandler = source.indexOf("} catch (domainError) {");
    const last = source.indexOf("} catch (tenantError) {", errorHandler);
    const body = source.slice(errorHandler, last);
    expect(errorHandler).toBeGreaterThan(-1);
    expect(body).toContain("ROLLBACK TO SAVEPOINT manager_domain");
    expect(body).toContain("'failed',0");
    expect(body).toContain("managerExecutionBucket(domain, now)");
    expect(source).toContain("latest WHERE outcome='failed'");
    expect(source).toContain("SELECT DISTINCT ON (domain) domain, outcome");
    expect(source).toContain("ORDER BY domain, checked_at DESC");
  });

  it("bounds automated Superadmin support payloads before database access", () => {
    const source = readFileSync(new URL("./agent-manager-support.ts", import.meta.url), "utf8");
    const guard = source.indexOf('throw new Error("MANAGER_SUPPORT_PAYLOAD_TOO_LARGE")');
    const db = source.indexOf("const client = await pool.connect()");
    expect(guard).toBeGreaterThan(-1);
    expect(db).toBeGreaterThan(guard);
    expect(source).toContain("f.evidence.length > 8000");
    expect(source).toContain("f.acceptanceCriteria.length > 4000");
  });


  it("checks notification tables before scheduling tenant scans", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    const prereq = source.indexOf("to_regclass('public.notifications')");
    const users = source.indexOf("to_regclass('public.users')");
    const scan = source.indexOf("SELECT count(*)::int AS total FROM tenants");
    expect(prereq).toBeGreaterThan(-1);
    expect(users).toBeGreaterThan(-1);
    expect(scan).toBeGreaterThan(prereq);
    expect(source).toContain("!ready.rows[0]?.notifications || !ready.rows[0]?.users");
  });

  it("rejects invalid cycle timestamps before opening a database transaction", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    const validation = source.indexOf("if (!Number.isFinite(now.getTime()))");
    const connection = source.indexOf("const client = await pool.connect()");
    expect(validation).toBeGreaterThan(-1);
    expect(connection).toBeGreaterThan(validation);
  });

  it("records a source collision as skipped instead of generating an alert", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    const collision = source.indexOf("if ((inserted.rowCount ?? 0) === 0)");
    const alert = source.indexOf("INSERT INTO notifications");
    expect(collision).toBeGreaterThan(-1);
    expect(alert).toBeGreaterThan(collision);
    expect(source.slice(collision, alert)).toContain("hadCollision = true");
    expect(source.slice(collision, alert)).toContain("continue;");
    expect(source).toContain("hadCollision ? 'skipped_source_collision' : 'completed', findingsCount");
  });

  it("does not count a manually closed case as an active finding", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    const manuallyClosed = source.indexOf("if (activeCase.rows[0]?.status !== 'open')");
    const notifications = source.indexOf("INSERT INTO notifications");
    const branch = source.slice(manuallyClosed, notifications);
    expect(manuallyClosed).toBeGreaterThan(-1);
    expect(notifications).toBeGreaterThan(manuallyClosed);
    expect(branch).not.toContain("cases += inserted.rowCount");
    expect(branch).not.toContain("findingsCount++");
    expect(branch).toContain("continue;");
  });

  it("guards Jarvis case upserts by source", () => {
    const source = readFileSync(new URL("./active-manager-cycle.ts", import.meta.url), "utf8");
    expect(source).toContain("ON CONFLICT (tenant_id,signal_key) DO UPDATE SET");
    expect(source).toContain("WHERE jarvis_cases.source='active_manager'");
  });

  it("rejects unsupported support-review priorities before opening database connection", () => {
    const source = readFileSync(new URL("./agent-manager-support.ts", import.meta.url), "utf8");
    const guard = source.indexOf('throw new Error("MANAGER_SUPPORT_PRIORITY_INVALID")');
    const connect = source.indexOf("const client = await pool.connect()");
    expect(guard).toBeGreaterThan(-1);
    expect(connect).toBeGreaterThan(guard);
    expect(source).toContain('["baixa", "media", "alta", "urgente"]');
  });

  it("uses the normalized tenant identity for support review storage and deduplication", () => {
    const source = readFileSync(new URL("./agent-manager-support.ts", import.meta.url), "utf8");
    expect(source).toContain("f.tenantId.trim()");
    expect(source).toContain('if (tenantId === "") throw new Error("TENANT_REQUIRED")');
    expect(source).toContain("managerSupportSourceRef(f.module, f.kind, f.fingerprint, tenantId)");
    expect(source).toContain("sourceRef, tenantId ?? null, scope");
    expect(managerSupportSourceRef("crm", "platform_defect", "same", " tenant-a "))
      .toBe(managerSupportSourceRef("crm", "platform_defect", "same", "tenant-a"));
  });

  it("selects the most recent existing review deterministically", () => {
    const source = readFileSync(new URL("./agent-manager-support.ts", import.meta.url), "utf8");
    expect(source).toContain("ORDER BY created_at DESC, id DESC LIMIT 1");
  });

  it("audits security escalation only when the existing record changes", () => {
    const source = readFileSync(new URL("./agent-manager-support.ts", import.meta.url), "utf8");
    expect(source).toContain("RETURNING id");
    expect(source).toContain("if (escalation.rowCount)");
    expect(source).toContain("'manager_security_escalation'");
    expect(source).toContain("admin_improvement_events");
  });

  it("escalates an existing deduplicated security review without duplicating it", () => {
    const source = readFileSync(new URL("./agent-manager-support.ts", import.meta.url), "utf8");
    const prior = source.indexOf("if (previous.rows[0])");
    const upgrade = source.indexOf("UPDATE admin_improvements SET priority='urgente'");
    const commit = source.indexOf('await client.query("COMMIT")', prior);
    expect(prior).toBeGreaterThan(-1);
    expect(upgrade).toBeGreaterThan(prior);
    expect(commit).toBeGreaterThan(upgrade);
    expect(source).toContain('if (f.kind === "security_incident")');
  });

  it("rejects non-structural demand kinds before support database writes", () => {
    const source = readFileSync(new URL("./agent-manager-support.ts", import.meta.url), "utf8");
    const rejection = source.indexOf('throw new Error("MANAGER_SUPPORT_KIND_INVALID")');
    const connect = source.indexOf("const client = await pool.connect()");
    expect(rejection).toBeGreaterThan(-1);
    expect(connect).toBeGreaterThan(rejection);
    expect(source).toContain('"platform_defect", "platform_improvement", "shared_behavior", "security_incident"');
  });

  it("forces urgent priority for security incident support reviews", () => {
    const source = readFileSync(new URL("./agent-manager-support.ts", import.meta.url), "utf8");
    expect(source).toContain('f.kind === "security_incident" && f.priority !== "urgente"');
    expect(source).toContain('const priority =');
    expect(source).toContain('priority, sourceRef,');
  });

  it("uses two-key advisory locking for support deduplication", () => {
    const source = readFileSync(new URL("./agent-manager-support.ts", import.meta.url), "utf8");
    expect(source).toContain("pg_advisory_xact_lock(hashtext($1), hashtext($2))");
    expect(source).toContain("[sourceRef.slice(0, 24), sourceRef.slice(24)]");
  });

  it("rejects unknown modules and nonstructural kinds in support identifiers", () => {
    expect(() => managerSupportSourceRef("invalid" as "crm", "platform_defect", "x"))
      .toThrow("INVALID_MANAGER_DOMAIN");
    expect(() => managerSupportSourceRef("crm", "tenant_operation", "x"))
      .toThrow("MANAGER_SUPPORT_KIND_INVALID");
  });

  it("rejects oversized tenant identities across support reviews and opportunities", () => {
    const oversizedTenant = "t".repeat(257);
    const base = { tenantId: "tenant-a", domain: "crm" as const, kind: "tenant_operation" as const, fingerprint: "signal", evidence: "observed" };
    expect(() => validateManagerOpportunity({ ...base, tenantId: oversizedTenant }))
      .toThrow("TENANT_TOO_LONG");
    expect(() => managerSupportSourceRef("crm", "platform_defect", "signal", oversizedTenant))
      .toThrow("TENANT_TOO_LONG");
    expect(() => validateManagerOpportunity({ ...base, tenantId: "t".repeat(256) }))
      .not.toThrow();
    expect(() => managerSupportSourceRef("crm", "platform_defect", "signal", "t".repeat(256)))
      .not.toThrow();
  });

  it("bounds support-review fingerprints before hashing or database access", () => {
    expect(() => managerSupportSourceRef("crm", "platform_defect", "x".repeat(512), "tenant-a"))
      .not.toThrow();
    expect(() => managerSupportSourceRef("crm", "platform_defect", "x".repeat(513), "tenant-a"))
      .toThrow("FINGERPRINT_TOO_LONG");
    expect(() => managerSupportSourceRef("crm", "platform_defect", "  " + "x".repeat(512) + "  ", "tenant-a"))
      .not.toThrow();
  });

  it("normalizes fingerprint whitespace before deduplicating support reviews", () => {
    const a = managerSupportSourceRef("crm", "platform_defect", "signal-1", "tenant-a");
    const b = managerSupportSourceRef("crm", "platform_defect", "  signal-1  ", "tenant-a");
    expect(a).toBe(b);
    expect(() => managerSupportSourceRef("crm", "platform_defect", "   ", "tenant-a"))
      .toThrow("FINGERPRINT_REQUIRED");
  });

  it("rejects malformed support dedupe identifiers before hashing", () => {
    expect(() => managerSupportSourceRef("crm", "platform_defect", null as unknown as string))
      .toThrow("FINGERPRINT_REQUIRED");
    expect(() => managerSupportSourceRef("crm", "platform_defect", "signal", 123 as unknown as string))
      .toThrow("TENANT_REQUIRED");
  });

  it("does not conflate the global namespace with a tenant named global", () => {
    const globalReview = managerSupportSourceRef("crm", "platform_defect", "same");
    const tenantReview = managerSupportSourceRef("crm", "platform_defect", "same", "global");
    expect(globalReview).not.toBe(tenantReview);
  });

  it("keeps support review deduplication isolated by tenant", () => {
    const a = managerSupportSourceRef("crm", "platform_defect", "same-fingerprint", "tenant-a");
    const b = managerSupportSourceRef("crm", "platform_defect", "same-fingerprint", "tenant-b");
    const global = managerSupportSourceRef("crm", "platform_defect", "same-fingerprint");
    expect(a).not.toBe(b);
    expect(a).not.toBe(global);
    expect(b).not.toBe(global);
    expect(a).toBe(managerSupportSourceRef("crm", "platform_defect", "same-fingerprint", "tenant-a"));
    expect(() => managerSupportSourceRef("crm", "platform_defect", "x", " ")).toThrow("TENANT_REQUIRED");
  });

  it("routes tenant operations to Jarvis", () => {
    for (const kind of ["tenant_guidance", "tenant_configuration", "tenant_operation"] as const) {
      expect(classifyManagerDemand(kind)).toMatchObject({
        route: "jarvis",
        approval: "tenant_when_required",
        mayChangePlatformCode: false,
      });
    }
  });

  it("requires Superadmin approval for platform work, security and unknown cases", () => {
    for (const kind of ["platform_defect", "platform_improvement", "shared_behavior", "security_incident", "unknown"] as const) {
      expect(classifyManagerDemand(kind)).toMatchObject({
        route: "superadmin_support",
        approval: "superadmin_required",
        mayChangePlatformCode: false,
      });
    }
    expect(classifyManagerDemand("security_incident").requiresImmediateAttention).toBe(true);
  });

  it("schedules regular reviews even without an incident", () => {
    const now = new Date("2026-10-09T18:30:00Z");
    expect(isManagerDue("pipeline", null, now)).toBe(true);
    expect(isManagerDue("pipeline", new Date("2026-10-09T18:16:00Z"), now)).toBe(false);
    expect(isManagerDue("pipeline", new Date("2026-10-09T18:15:00Z"), now)).toBe(true);
    expect(isManagerDue("marketing", new Date("2026-10-09T17:30:00Z"), now)).toBe(true);
    expect(isManagerDue("arqdor", new Date("2026-10-09T17:30:00Z"), now)).toBe(false);
  });

  it("recovers from a future last-success timestamp without starving scans", () => {
    const now = new Date("2026-10-09T18:30:00Z");
    const erroneousFuture = new Date("2026-10-10T18:30:00Z");
    expect(isManagerDue("crm", erroneousFuture, now)).toBe(true);
    expect(isManagerDue("crm", new Date("invalid"), now)).toBe(true);
    expect(isManagerDue("crm", now, new Date("invalid"))).toBe(false);
  });

  it("rejects unknown cadence domains rather than scheduling silently", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const unexpected = "unknown_domain" as Parameters<typeof managerExecutionBucket>[0];
    expect(() => managerExecutionBucket(unexpected, now)).toThrow("INVALID_MANAGER_DOMAIN");
    expect(isManagerDue(unexpected, null, now)).toBe(false);
    expect(isManagerDue(unexpected, new Date("2026-10-10T11:00:00Z"), now)).toBe(false);
  });

  it("rotates tenant pages deterministically and independently by cadence", () => {
    const start = new Date("2026-10-10T12:00:00Z");
    const nextQuarter = new Date("2026-10-10T12:15:00Z");
    expect(managerTenantPageOffset("crm", start, 500)).toBe(0);
    const first = managerTenantPageOffset("crm", start, 1200);
    const next = managerTenantPageOffset("crm", nextQuarter, 1200);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(next).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1200);
    expect(next).toBeLessThan(1200);
    expect(next).not.toBe(first);
    expect(managerTenantPageOffset("marketing", start, 1200))
      .toBe(managerTenantPageOffset("marketing", nextQuarter, 1200));
  });

  it("rejects invalid pagination and manager clocks", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(managerTenantPageOffset("crm", now, 0)).toBe(0);
    expect(() => managerTenantPageOffset("crm", now, -1)).toThrow("INVALID_MANAGER_PAGINATION");
    expect(() => managerTenantPageOffset("crm", now, 100, 0)).toThrow("INVALID_MANAGER_PAGINATION");
    expect(() => managerTenantPageOffset("crm", new Date("invalid"), 100)).toThrow("INVALID_MANAGER_TIME");
    expect(() => managerTenantPageOffset("not_a_domain" as "crm", now, 100))
      .toThrow("INVALID_MANAGER_DOMAIN");
  });

  it("keeps the same idempotency bucket during an interval", () => {
    expect(managerExecutionBucket("pipeline", new Date("2026-10-09T18:00:01Z")))
      .toBe(managerExecutionBucket("pipeline", new Date("2026-10-09T18:14:59Z")));
    expect(managerExecutionBucket("pipeline", new Date("2026-10-09T18:15:00Z")))
      .not.toBe(managerExecutionBucket("pipeline", new Date("2026-10-09T18:14:59Z")));
  });

  it("deduplicates hourly marketing independently of 15-minute CRM", () => {
    const a = new Date("2026-10-09T18:00:01Z");
    const b = new Date("2026-10-09T18:45:59Z");
    const c = new Date("2026-10-09T19:00:01Z");
    expect(managerExecutionBucket("marketing", a)).toBe(managerExecutionBucket("marketing", b));
    expect(managerExecutionBucket("marketing", b)).not.toBe(managerExecutionBucket("marketing", c));
    expect(managerExecutionBucket("crm", a)).not.toBe(managerExecutionBucket("crm", b));
    expect(managerExecutionBucket("crm", b)).not.toBe(managerExecutionBucket("crm", c));
  });

  it("rejects malformed runtime manager findings before persistence or routing", () => {
    const valid = {
      tenantId: "tenant-a", domain: "crm", kind: "tenant_operation",
      fingerprint: "unassigned-leads", evidence: "3 active leads",
    } as const;
    expect(() => validateManagerOpportunity(valid)).not.toThrow();
    expect(() => validateManagerOpportunity({ ...valid, domain: "unknown" as "crm" }))
      .toThrow("INVALID_MANAGER_DOMAIN");
    expect(() => validateManagerOpportunity({ ...valid, kind: "execute_code" as "tenant_operation" }))
      .toThrow("INVALID_MANAGER_DEMAND_KIND");
    expect(() => validateManagerOpportunity({ ...valid, fingerprint: null as unknown as string }))
      .toThrow("FINGERPRINT_REQUIRED");
    expect(() => validateManagerOpportunity({ ...valid, evidence: 10 as unknown as string }))
      .toThrow("EVIDENCE_REQUIRED");
  });

  it("bounds evidence and fingerprint size before any persistence", () => {
    const valid = { tenantId: "tenant-a", domain: "crm", kind: "tenant_operation", fingerprint: "f", evidence: "observed" } as const;
    expect(() => validateManagerOpportunity({ ...valid, evidence: "x".repeat(16_001) })).toThrow("MANAGER_FINDING_TOO_LARGE");
    expect(() => validateManagerOpportunity({ ...valid, fingerprint: "f".repeat(513) })).toThrow("FINGERPRINT_TOO_LONG");
  });

  it("rejects findings without tenant identity or evidence", () => {
    expect(() => validateManagerOpportunity({ tenantId: "", domain: "crm", kind: "tenant_operation", fingerprint: "x", evidence: "abc" })).toThrow("TENANT_REQUIRED");
    expect(() => validateManagerOpportunity({ tenantId: "t", domain: "crm", kind: "tenant_operation", fingerprint: "x", evidence: "" })).toThrow("EVIDENCE_REQUIRED");
  });
});
