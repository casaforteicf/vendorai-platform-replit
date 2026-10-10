import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { classifyManagerDemand, managerSupportSourceRef, type ManagerDomain } from "./agent-manager-policy.js";

/**
 * Explicit structural findings only: never reinterpret a tenant configuration
 * problem as a platform defect. Creates a review request, NOT a Vendi mission.
 */
export interface ManagerPlatformFinding {
  module: ManagerDomain;
  kind: "platform_defect" | "platform_improvement" | "shared_behavior" | "security_incident";
  fingerprint: string;
  title: string;
  description: string;
  evidence: string;
  acceptanceCriteria: string;
  tenantId?: string;
  priority?: "baixa" | "media" | "alta" | "urgente";
}
export async function enqueueManagerSupportReview(f: ManagerPlatformFinding): Promise<string> {
  if (!f.fingerprint.trim() || !f.title.trim() || !f.evidence.trim() || !f.acceptanceCriteria.trim()) {
    throw new Error("MANAGER_SUPPORT_EVIDENCE_REQUIRED");
  }
  // Keep invalid runtime payloads from creating ambiguous Superadmin cases.
  const priorities = ["baixa", "media", "alta", "urgente"];
  if (f.priority !== undefined && !priorities.includes(f.priority)) {
    throw new Error("MANAGER_SUPPORT_PRIORITY_INVALID");
  }
  const policy = classifyManagerDemand(f.kind);
  if (policy.route !== "superadmin_support" || policy.approval !== "superadmin_required") {
    throw new Error("MANAGER_SUPPORT_APPROVAL_POLICY");
  }
  // Preserve the same normalized tenant identity in dedupe, scope and persistence.
  const tenantId = f.tenantId === undefined ? undefined : f.tenantId.trim();
  if (tenantId === "") throw new Error("TENANT_REQUIRED");
  // A security incident must never be silently downgraded to routine priority.
  const priority = f.kind === "security_incident" && f.priority !== "urgente"
    ? "urgente"
    : (f.priority ?? "media");
  const sourceRef = managerSupportSourceRef(f.module, f.kind, f.fingerprint, tenantId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Transaction scoped dedupe across all application replicas.
    // Use both independent hash halves to reduce unrelated advisory-lock collisions.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      [sourceRef.slice(0, 24), sourceRef.slice(24)],
    );
    const previous = await client.query<{ id: string }>(
      "SELECT id FROM admin_improvements WHERE source_type='audit' AND source_ref_id=$1 AND status NOT IN ('cancelada','producao_validada') LIMIT 1",
      [sourceRef],
    );
    if (previous.rows[0]) {
      // A deduplicated security incident may predate the urgent-priority rule.
      // Upgrade it in place without duplicating the review or changing its status.
      if (f.kind === "security_incident") {
        const escalation = await client.query(
          "UPDATE admin_improvements SET priority='urgente' WHERE id=$1 AND priority <> 'urgente' RETURNING id",
          [previous.rows[0].id],
        );
        if (escalation.rowCount) {
          await client.query(
            `INSERT INTO admin_improvement_events
              (id,improvement_id,event_type,message,actor,payload)
             VALUES ($1,$2,'manager_security_escalation',$3,'agent_master',$4::jsonb)`,
            [randomUUID(), previous.rows[0].id,
              "Incidente de segurança existente escalonado automaticamente para prioridade urgente.",
              JSON.stringify({ sourceRef, priority: "urgente", kind: f.kind })],
          );
        }
      }
      await client.query("COMMIT");
      return previous.rows[0].id;
    }
    const id = randomUUID();
    const scope = tenantId === undefined ? "global" : "tenant";
    await client.query(
      `INSERT INTO admin_improvements
       (id,title,description,module,priority,status,source_type,source_ref_id,source_tenant_id,
        change_scope,acceptance_criteria,risk_summary,owner_agent,agent_status,agent_summary,test_status,created_by)
       VALUES ($1,$2,$3,$4,$5,'solicitada','audit',$6,$7,$8,$9,$10,'agent_master','awaiting_superadmin_approval',$11,'pending','agent_master')`,
      [id, f.title, f.description, f.module, priority, sourceRef, tenantId ?? null, scope,
        f.acceptanceCriteria, "Exige revisão e aprovação do Superadmin antes de qualquer alteração de código.",
        `Diagnóstico encaminhado sem execução. Evidência: ${f.evidence}`],
    );
    await client.query(
      `INSERT INTO admin_improvement_events
       (id,improvement_id,event_type,message,actor,payload)
       VALUES ($1,$2,'manager_support_review',$3,'agent_master',$4::jsonb)`,
      [randomUUID(), id, "Agente Gestor identificou demanda estrutural. Aguardando análise e aprovação do Superadmin.",
        JSON.stringify({ module: f.module, kind: f.kind, fingerprint: f.fingerprint, tenantId: tenantId ?? null, evidence: f.evidence })],
    );
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
