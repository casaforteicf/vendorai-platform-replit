/**
 * blenderService — renderização de cenas via gpt-image-1
 *
 * NOTA: gpt-image-1 retorna b64_json (não URL). Tamanhos suportados:
 *   1024x1024 | 1024x1536 | 1536x1024
 * dall-e-3 não está disponível nesta conta.
 */

import OpenAI from "openai";
import {
  db,
  archCenasTable,
  archRendersTable,
  archProjetosTable,
  archAmbientesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { objectStorageClient } from "../lib/objectStorage.js";

type SceneData = {
  estilo?:       string;
  cores?:        string;
  produtos?:     string[];
  iluminacao?:   string;
  observacoes?:  string;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function buildPrompt(sceneData: SceneData, ambienteNome: string | null): string {
  const estilo    = sceneData.estilo     ?? "contemporary";
  const cores     = sceneData.cores      ?? "neutral palette";
  const ilum      = sceneData.iluminacao ?? "natural daylight";
  const ambiente  = ambienteNome         ?? "interior space";
  const produtos  = (sceneData.produtos ?? []).join(", ") || "modern furniture";
  const obs       = sceneData.observacoes ? ` ${sceneData.observacoes}.` : "";

  return (
    `Photorealistic interior design render, ${estilo} style, ${ambiente}, ` +
    `products: ${produtos}, lighting: ${ilum}, color palette: ${cores}, ` +
    `Brazilian home, 4K quality, architectural visualization.${obs}`
  );
}

async function saveImageToStorage(
  b64: string,
  tenantId: string,
  cenaId: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR não configurado.");

  const ts         = Date.now();
  const objectPath = `${privateDir}/arch-renders/${tenantId}/${cenaId}/${ts}.jpg`;
  const parts      = objectPath.replace(/^\//, "").split("/");
  const bucketName = parts[0]!;
  const objectName = parts.slice(1).join("/");

  const buffer = Buffer.from(b64, "base64");
  const bucket = objectStorageClient.bucket(bucketName);
  const file   = bucket.file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });

  return `/api/storage/objects/arch-renders/${tenantId}/${cenaId}/${ts}.jpg`;
}

// ── renderCena (executa o render) ────────────────────────────────────────────

export async function renderCena(cenaId: string, renderId: string): Promise<void> {
  // 1. Buscar cena + projeto + ambiente
  const [cena] = await db
    .select()
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) throw new Error(`Cena ${cenaId} não encontrada.`);

  const [projeto] = await db
    .select({ id: archProjetosTable.id, tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto) throw new Error(`Projeto ${cena.projetoId} não encontrado.`);

  let ambienteNome: string | null = null;
  if (cena.ambienteId) {
    const [amb] = await db
      .select({ nome: archAmbientesTable.nome })
      .from(archAmbientesTable)
      .where(eq(archAmbientesTable.id, cena.ambienteId))
      .limit(1);
    ambienteNome = amb?.nome ?? null;
  }

  // 2. Montar prompt
  const sceneData = (cena.sceneData ?? {}) as SceneData;
  const prompt    = buildPrompt(sceneData, ambienteNome ?? cena.nome);

  // 3. Chamar gpt-image-1 (retorna b64_json)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurado.");

  const openai = new OpenAI({ apiKey });

  const response = await openai.images.generate({
    model:           "gpt-image-1",
    prompt,
    n:               1,
    size:            "1536x1024",
    response_format: "b64_json",
  } as Parameters<typeof openai.images.generate>[0]);

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 não retornou imagem.");

  // 4. Salvar em object storage
  const imageUrl = await saveImageToStorage(b64, projeto.tenantId, cenaId);

  // 5. Atualizar arch_renders
  await db
    .update(archRendersTable)
    .set({ status: "concluido", imageUrl, tempoRenderMs: Date.now() })
    .where(eq(archRendersTable.id, renderId));

  // 6. Atualizar arch_cenas
  await db
    .update(archCenasTable)
    .set({ status: "concluido", renderUrl: imageUrl, updatedAt: new Date() })
    .where(eq(archCenasTable.id, cenaId));
}

// ── iniciarRender (lança em background) ──────────────────────────────────────

export async function iniciarRender(
  cenaId: string,
): Promise<{ renderId: string; status: string }> {
  // 1. Inserir registro de render em estado aguardando
  const [render] = await db
    .insert(archRendersTable)
    .values({ cenaId, status: "renderizando" })
    .returning();

  // 2. Marcar cena como renderizando
  await db
    .update(archCenasTable)
    .set({ status: "renderizando", updatedAt: new Date() })
    .where(eq(archCenasTable.id, cenaId));

  const startMs = Date.now();

  // 3. Disparar em background (não await)
  renderCena(cenaId, render.id)
    .then(() => {
      // sucesso já tratado dentro de renderCena
    })
    .catch(async (err: unknown) => {
      const erroMsg = err instanceof Error ? err.message : String(err);
      await db
        .update(archRendersTable)
        .set({ status: "erro", erroMsg, tempoRenderMs: Date.now() - startMs })
        .where(eq(archRendersTable.id, render.id))
        .catch(() => undefined);

      await db
        .update(archCenasTable)
        .set({ status: "erro", updatedAt: new Date() })
        .where(eq(archCenasTable.id, cenaId))
        .catch(() => undefined);
    });

  return { renderId: render.id, status: "renderizando" };
}
