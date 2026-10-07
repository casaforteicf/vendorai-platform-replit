import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { pool } from "@workspace/db";
import { processRenderJob } from "../routes/arch_ai_render_legacy.js";

// Only explicitly queued concept jobs are claimed. The other render pipelines
// and tenants' unrelated jobs are not modified by this worker.
export const CLAIM_CONCEPT_RENDER_SQL = `
  WITH candidate AS (
    SELECT r.id, r.tenant_id FROM arch_ai_renders r
    WHERE r.job_input IS NOT NULL AND r.mode = 'preservar'
      AND r.status IN ('queued', 'processando')
      AND (r.job_lease_until IS NULL OR r.job_lease_until < NOW())
    ORDER BY r.created_at, r.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE arch_ai_renders r
  SET status = 'processando', job_lease_token = $1,
      job_lease_until = NOW() + INTERVAL '2 minutes',
      job_attempts = r.job_attempts + 1
  FROM candidate c WHERE r.id = c.id AND r.tenant_id = c.tenant_id
  RETURNING r.*`;

export const RENEW_CONCEPT_RENDER_SQL = `
  UPDATE arch_ai_renders SET job_lease_until = NOW() + INTERVAL '2 minutes'
  WHERE id = $1 AND tenant_id = $2 AND job_lease_token = $3
    AND job_lease_until > NOW() AND status = 'processando'`;

export const START_PROVIDER_SUBMISSION_SQL = `
  UPDATE arch_ai_renders SET provider_submission_started_at = NOW()
  WHERE id = $1 AND tenant_id = $2 AND job_lease_token = $3
    AND job_lease_until > NOW() AND status = 'processando'
    AND provider_submission_started_at IS NULL`;

export const CHECKPOINT_PREDICTION_SQL = `
  UPDATE arch_ai_renders SET provider_prediction_id = $4
  WHERE id = $1 AND tenant_id = $2 AND job_lease_token = $3
    AND job_lease_until > NOW() AND status = 'processando'`;

export function startArchConceptRenderRunner(logger: Logger, pollMs = 3000) {
  let stopped = false;
  let busy = false;
  let active: AbortController | undefined;

  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const leaseToken = randomUUID();
      const claimed = await pool.query(CLAIM_CONCEPT_RENDER_SQL, [leaseToken]);
      const render = claimed.rows[0];
      if (!render) return;
      active = new AbortController();
      const controller = active;
      const identity = [render.id, render.tenant_id, leaseToken];
      if (render.job_attempts > 5) {
        await pool.query(`UPDATE arch_ai_renders SET status='erro', erro_msg=$4
          WHERE id=$1 AND tenant_id=$2 AND job_lease_token=$3`,
          [...identity, "O processamento foi interrompido repetidamente. Tente novamente."]);
        return;
      }
      // Fencing prevents a worker whose lease expired from writing a late result.
      heartbeat = setInterval(() => {
        void pool.query(RENEW_CONCEPT_RENDER_SQL, identity).then((result) => {
          if (!result.rowCount) controller.abort();
        }).catch(() => controller.abort());
      }, 20_000);
      heartbeat.unref?.();
      deadline = setTimeout(() => controller.abort(), 15 * 60_000);
      deadline.unref?.();
      const input = render.job_input as {
        userNotes?: string;
        materials?: Array<{ zone: string; promptFragment: string }>;
        renderPresets?: import("../lib/arqdor-render-prompts.js").ArqdorRenderPreset[];
        realEnvironmentSourceUrl?: string;
        realEnvironmentKind?: string;
      };
      await processRenderJob({
        renderId: render.id,
        tenantId: render.tenant_id,
        mode: "preservar",
        originalUrl: render.original_image_url,
        maskZones: render.mask_zones ?? [],
        ambiente: render.ambiente,
        estilo: render.estilo,
        iluminacao: render.iluminacao,
        angulo: render.angulo,
        materials: input.materials ?? [],
        userNotes: input.userNotes,
        renderPresets: input.renderPresets ?? [],
        source: render.source,
        renderView: render.render_view,
        realEnvironmentSourceUrl: input.realEnvironmentSourceUrl,
        realEnvironmentKind: input.realEnvironmentKind,
        retentativas: Number.parseInt(String(render.retentativas ?? "0"), 10) || 0,
        logger,
        leaseToken,
        signal: controller.signal,
        resumePredictionId: render.provider_prediction_id ?? undefined,
        beforeProviderSubmit: async () => {
          controller.signal.throwIfAborted();
          const started = await pool.query(START_PROVIDER_SUBMISSION_SQL, identity);
          if (!started.rowCount) {
            throw new Error("A geração foi interrompida durante o envio ao motor. Verifique o resultado antes de solicitar uma nova geração.");
          }
        },
        onPredictionCreated: async (id) => {
          const saved = await pool.query(CHECKPOINT_PREDICTION_SQL, [...identity, id]);
          if (!saved.rowCount) throw new Error("O processamento perdeu sua reserva. O resultado não será sobrescrito.");
        },
      });
    } catch (error) {
      logger.error({ err: error }, "arch-concept-render: falha no worker");
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (deadline) clearTimeout(deadline);
      active = undefined;
      busy = false;
    }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, Math.max(1000, pollMs));
  timer.unref?.();
  return { stop() { stopped = true; clearInterval(timer); active?.abort(); } };
}
