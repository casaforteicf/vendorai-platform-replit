import { randomUUID } from "node:crypto";
import type { Pool } from "@workspace/db";

export class RenderGalleryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Serialize gallery writes on the concept, including requests from other tabs.
export const LOCK_CONCEPT_SQL = `SELECT id FROM arch_concept_projects
  WHERE id = $1 AND tenant_id = $2 FOR UPDATE`;
export const FIND_RENDER_SQL = `SELECT * FROM arch_ai_renders WHERE id = $1 AND tenant_id = $2`;
export const CLEAR_PRIMARY_SQL = `UPDATE arch_ai_renders SET is_primary = false
  WHERE concept_project_id = $1 AND tenant_id = $2 AND is_primary = true`;
export const SET_PRIMARY_SQL = `UPDATE arch_ai_renders SET is_primary = true
  WHERE id = $1 AND tenant_id = $2 AND status = 'concluido' AND result_image_url IS NOT NULL`;
export const FIND_REGENERATION_SQL = `SELECT id, status FROM arch_ai_renders
  WHERE tenant_id = $1 AND parent_render_id = $2 AND job_input->>'regenerationKey' = $3`;
export const FIND_ACTIVE_SQL = `SELECT id FROM arch_ai_renders
  WHERE concept_project_id = $1 AND tenant_id = $2 AND status IN ('queued', 'processando', 'processing') LIMIT 1`;
export const REGENERATE_SQL = `INSERT INTO arch_ai_renders
  (id, tenant_id, project_id, concept_project_id, parent_render_id, mode, ambiente,
   estilo, iluminacao, angulo, mask_zones, original_image_url, source, render_view,
   job_input, prompt, motor, status, operation_type)
  SELECT $3, tenant_id, project_id, concept_project_id, id, mode, ambiente,
    estilo, COALESCE($5::text, iluminacao), angulo, mask_zones, original_image_url, source, render_view,
    $6::jsonb || jsonb_build_object('regenerationKey', $4::text), CASE WHEN $5::text IS NULL THEN prompt ELSE NULL END, motor, 'queued', 'initial'
  FROM arch_ai_renders WHERE id = $1 AND tenant_id = $2
  RETURNING id, status`;

export function withLightingVariation(notes: unknown, lighting: string) {
  const instruction = lighting === "night"
    ? "nighttime photography, dark sky, warm practical lights and realistic material colors"
    : lighting === "sunset" ? "warm sunset photography with long soft shadows" : "natural daytime photography with balanced shadows";
  const original = typeof notes === "string" ? notes : "";
  return original.split("\n")
    .filter((line) => !/^(Lighting:|(?:EXTERIOR|INTERIOR) LIGHTING:|LIGHTING VARIATION:)/i.test(line))
    .map((line) => line.replace(/Lighting scenario selected in editor: [^.]+\./g, `Lighting scenario selected in editor: ${lighting}.`)
      // Resumo curto do render (primeiro bloco, o único que o motor lê inteiro).
      .replace(/Light: [^.]+\./g, `Light: ${instruction}.`)
      .replace(/physically plausible daylight/g, "physically plausible lighting"))
    .concat(`LIGHTING VARIATION: ${instruction}. This scenario overrides the reference image lighting. Preserve all geometry, materials and camera framing.`)
    .join("\n");
}

export async function updateConceptRenderGallery(
  pool: Pick<Pool, "connect">,
  input: { tenantId: string; renderId: string; action: "primary" | "regenerate"; requestId?: string; lighting?: string },
) {
  if (input.action === "regenerate" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId ?? "")) {
    throw new RenderGalleryError(400, "Identificador da solicitação inválido.");
  }
  if (input.lighting !== undefined && !["day", "sunset", "night"].includes(input.lighting)) {
    throw new RenderGalleryError(400, "Iluminação inválida.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const identity = [input.renderId, input.tenantId];
    const found = await client.query(FIND_RENDER_SQL, identity);
    const render = found.rows[0];
    if (!render?.concept_project_id) throw new RenderGalleryError(404, "Render do pré-projeto não encontrado.");
    const concept = [render.concept_project_id, input.tenantId];
    const locked = await client.query(LOCK_CONCEPT_SQL, concept);
    if (!locked.rowCount) throw new RenderGalleryError(404, "Pré-projeto não encontrado.");
    const current = (await client.query(FIND_RENDER_SQL, identity)).rows[0];
    if (!current || current.concept_project_id !== render.concept_project_id) {
      throw new RenderGalleryError(409, "O render foi alterado. Atualize o histórico.");
    }
    let result: { id: string; status: string };
    if (input.action === "primary") {
      if (current.status !== "concluido" || !current.result_image_url) {
        throw new RenderGalleryError(409, "Escolha uma imagem concluída como principal.");
      }
      await client.query(CLEAR_PRIMARY_SQL, concept);
      await client.query(SET_PRIMARY_SQL, identity);
      result = { id: current.id, status: current.status };
    } else {
      const existing = await client.query(FIND_REGENERATION_SQL, [input.tenantId, input.renderId, input.requestId]);
      if (existing.rows[0]) {
        result = existing.rows[0];
      } else {
        if (current.mode !== "preservar" || !current.job_input || !current.original_image_url) {
          throw new RenderGalleryError(409, "Esta versão não tem referência salva. Gere uma nova imagem pela fachada ou pelo 3D.");
        }
        const active = await client.query(FIND_ACTIVE_SQL, concept);
        if (active.rowCount) throw new RenderGalleryError(409, "Já existe um render em andamento neste pré-projeto.");
        const jobInput = input.lighting
          ? { ...current.job_input, userNotes: withLightingVariation(current.job_input.userNotes, input.lighting) }
          : current.job_input;
        result = (await client.query(REGENERATE_SQL, [...identity, randomUUID(), input.requestId, input.lighting ?? null, JSON.stringify(jobInput)])).rows[0];
      }
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
