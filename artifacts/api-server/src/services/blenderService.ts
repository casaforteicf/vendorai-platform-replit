/**
 * blenderService — renderização de cenas 3D e geração de imagens via IA.
 *
 * Fluxo principal (com BLENDER_SERVER_URL configurado):
 *   1. iniciarRender(cenaId) → monta sceneConfig, chama POST /render no servidor
 *      Blender, salva blenderJobId em arch_renders, retorna imediatamente.
 *   2. checkRenderStatus(renderId) → chama GET /render/:jobId no servidor Blender,
 *      atualiza arch_renders e arch_cenas conforme o status retornado.
 *   3. O scheduler chama checkRenderStatus a cada 30s para renders pendentes.
 *
 * Fallback automático (sem BLENDER_SERVER_URL):
 *   iniciarRender dispara _renderComGPTImage em background via setImmediate.
 *   Usa gpt-image-1 (quality: "high", size: "1536x1024") para gerar a imagem,
 *   insere em arch_render_versoes (versao=1, origem="original") e atualiza
 *   arch_renders/arch_cenas para status "concluido". O polling via render-status
 *   resolve normalmente — checkRenderStatus ignora renders sem blenderJobId.
 *
 * Fluxo de solicitações (sempre usa gpt-image-1):
 *   processarSolicitacao(solicitacaoId) → gpt-image-1 → nova versão em arch_render_versoes.
 *
 * Env vars opcionais (fallback ativo quando ausentes):
 *   BLENDER_SERVER_URL — ex: https://vendorai-blender-server.seuusuario.repl.co
 *   BLENDER_SECRET     — mesmo valor configurado no servidor Blender
 */

import {
  db,
  archCenasTable,
  archRendersTable,
  archProjetosTable,
  archAmbientesTable,
  archRenderVersoesTable,
  archRenderSolicitacoesTable,
  type ItemAdicionado,
  type TexturaAlterada,
} from "@workspace/db";
import { eq, or, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { ModelFileStore, safeSegment } from "../lib/arqdor-model-files.js";

// ─── Tipos locais ──────────────────────────────────────────────────────────────

type SceneData = {
  // Private worker staging key; never an arbitrary filesystem path or URL.
  model?: {
    key: string;
    sha256: string;
    calibration: { measuredDistance: number; actualMeters: number };
    referenceDimensions: { width: number; depth: number; height: number };
    tolerance?: number;
  };
  estilo?:       string;
  cores?:        string;
  produtos?:     string[];
  iluminacao?:   string;
  observacoes?:  string;
  // Campos extendidos (editor futuro)
  resolution?:   [number, number];
  samples?:      number;
  hdri?:         string;
  hdriStrength?: number;
  room?:         Record<string, unknown>;
  camera?:       Record<string, unknown>;
  objects?:      BlenderObject[];
};

type BlenderObject = {
  type:      string;
  name:      string;
  location:  [number, number, number];
  rotation?: [number, number, number];
  scale?:    [number, number, number];
  color?:    [number, number, number];
  metallic?: number;
  roughness?: number;
};

type BlenderJobStatus = "aguardando" | "processando" | "concluido" | "erro" | "cancelado";

type BlenderStatusResponse = {
  jobId:     string;
  status:    BlenderJobStatus;
  imageUrl?: string;
  erro?:     string;
  updatedAt?: string;
};

// ─── Config ───────────────────────────────────────────────────────────────────

function getBlenderUrl(): string {
  const url = process.env.BLENDER_SERVER_URL;
  if (!url) throw new Error("BLENDER_SERVER_URL não configurado.");
  return url.replace(/\/$/, "");
}

function getBlenderSecret(): string {
  const secret = process.env.BLENDER_SECRET;
  if (!secret) throw new Error("BLENDER_SECRET não configurado.");
  return secret;
}

function blenderHeaders() {
  return {
    "Content-Type":    "application/json",
    "X-Blender-Secret": getBlenderSecret(),
  };
}

// ─── Mapeamento sceneData → sceneConfig ───────────────────────────────────────

const HDRI_MAP: Record<string, string> = {
  rustico:       "interior_warm",
  rústico:       "interior_warm",
  quente:        "interior_warm",
  madeira:       "interior_warm",
  classico:      "interior_warm",
  clássico:      "interior_warm",
  moderno:       "interior_cool",
  contemporaneo: "interior_cool",
  contemporâneo: "interior_cool",
  clean:         "interior_cool",
  minimalista:   "interior_cool",
  natural:       "natural",
  luz:           "natural",
};

function pickHdri(estilo?: string): string {
  if (!estilo) return "interior_warm";
  const lower = estilo.toLowerCase();
  for (const [key, val] of Object.entries(HDRI_MAP)) {
    if (lower.includes(key)) return val;
  }
  return "interior_warm";
}

const PRODUCT_TYPE_MAP: Array<[string[], string, [number, number, number]]> = [
  [["sofa", "sofá", "couch"],               "sofa",      [0.35, 0.30, 0.25]],
  [["mesa", "table"],                        "mesa",      [0.60, 0.40, 0.25]],
  [["cadeira", "chair"],                     "cadeira",   [0.50, 0.45, 0.40]],
  [["cama", "bed"],                          "cama",      [0.85, 0.85, 0.90]],
  [["armário", "armario", "wardrobe"],       "armario",   [0.70, 0.55, 0.40]],
  [["luminária", "luminaria", "lamp"],       "luminaria", [0.90, 0.85, 0.70]],
  [["janela", "window"],                     "janela",    [0.80, 0.80, 0.85]],
  [["porta", "door"],                        "porta",     [0.55, 0.38, 0.22]],
];

function classifyProduct(nome: string): { type: string; color: [number, number, number] } {
  const lower = nome.toLowerCase();
  for (const [keywords, type, color] of PRODUCT_TYPE_MAP) {
    if (keywords.some((k) => lower.includes(k))) return { type, color };
  }
  return { type: "cube", color: [0.75, 0.70, 0.65] };
}

function buildSceneConfig(
  sceneData: SceneData,
  ambienteNome: string | null,
): Record<string, unknown> {
  if (sceneData.model) {
    return {
      model: sceneData.model,
      resolution: sceneData.resolution ?? [1920, 1080],
      samples: sceneData.samples ?? 64,
      hdri: sceneData.hdri ?? "natural",
      hdriStrength: sceneData.hdriStrength ?? 1,
      camera: sceneData.camera ?? {},
    };
  }
  // Se o sceneData já traz um sceneConfig completo (editor futuro), usa direto
  if (sceneData.objects && sceneData.objects.length > 0 && sceneData.hdri) {
    return {
      resolution:   sceneData.resolution  ?? [1920, 1080],
      samples:      sceneData.samples     ?? 64,
      hdri:         sceneData.hdri,
      hdriStrength: sceneData.hdriStrength ?? 1.0,
      room:         sceneData.room        ?? {},
      camera:       sceneData.camera      ?? {},
      objects:      sceneData.objects,
    };
  }

  // Caso simples: monta a partir dos campos textuais
  const hdri    = pickHdri(sceneData.estilo);
  const produtos = sceneData.produtos ?? [];

  const objects: BlenderObject[] = produtos.map((nome, i) => {
    const { type, color } = classifyProduct(nome);
    // Grade de posicionamento: 3 por linha, espaçamento de 2.5m
    const col = i % 3;
    const row = Math.floor(i / 3);
    return {
      type,
      name:     nome,
      location: [col * 2.5 - 2.5, row * 2.5, 0] as [number, number, number],
      color,
      metallic:  0.0,
      roughness: 0.6,
    };
  });

  return {
    resolution:   [1920, 1080],
    samples:      64,
    hdri,
    hdriStrength: 1.0,
    room: {
      width:          6.0,
      depth:          6.0,
      height:         2.8,
      wallColor:      [0.92, 0.92, 0.92],
      floorColor:     [0.55, 0.45, 0.35],
      floorRoughness: 0.75,
      floorMetallic:  0.0,
    },
    camera: {
      location: [0, -5, 1.6],
      target:   [0, 0, 1.0],
      fov:      60,
    },
    objects,
  };
}

// ─── _renderComGPTImage — fallback quando BLENDER_SERVER_URL não está configurado ──

async function _renderComGPTImage(params: {
  renderId:        string;
  renderCreatedAt: Date;
  cenaId:          string;
  tenantId:        string;
  sceneData:       SceneData;
  ambienteNome:    string | null;
}): Promise<void> {
  const { renderId, renderCreatedAt, cenaId, tenantId, sceneData, ambienteNome } = params;

  try {
    // Marcar como renderizando
    await db
      .update(archRendersTable)
      .set({ status: "renderizando" })
      .where(eq(archRendersTable.id, renderId));

    // ── Montar prompt ────────────────────────────────────────────────────────
    const estilo     = sceneData.estilo    ?? "moderno";
    const ambiente   = ambienteNome        ?? "sala de estar";
    const produtos   = (sceneData.produtos ?? []).join(", ") || "contemporary furniture";
    const iluminacao = sceneData.iluminacao ?? "natural light";

    // cores pode ser string hex, string descritiva ou JSON {parede, piso, teto}
    let coresDesc = "";
    if (sceneData.cores) {
      try {
        const obj = JSON.parse(String(sceneData.cores)) as Record<string, unknown>;
        const parts: string[] = [];
        if (obj.parede) parts.push(`wall color ${obj.parede}`);
        if (obj.piso)   parts.push(`floor ${obj.piso}`);
        if (obj.teto)   parts.push(`ceiling ${obj.teto}`);
        coresDesc = parts.join(", ");
      } catch {
        coresDesc = `color scheme: ${sceneData.cores}`;
      }
    }

    const prompt = [
      "Photorealistic interior design architectural render",
      `${estilo} style`,
      ambiente,
      coresDesc,
      `lighting: ${iluminacao}`,
      `furniture: ${produtos}`,
      "Brazilian home",
      "4K quality",
      "wide angle lens",
      "ray tracing",
    ].filter(Boolean).join(", ");

    // ── Chamar gpt-image-1 ───────────────────────────────────────────────────
    // Nota: dall-e-3 não existe nesta conta — gpt-image-1 é o modelo correto
    // quality: "high" (não "hd") | size: "1536x1024" (landscape suportado)
    const openai = await getOpenAIForTenant(tenantId);
    const imgResp = await (openai.images.generate as Function)({
      model:   "gpt-image-1",
      prompt,
      n:       1,
      size:    "1536x1024",
      quality: "high",
    });

    const b64 = (imgResp.data[0] as Record<string, unknown>)["b64_json"] as string | undefined;
    if (!b64) throw new Error("gpt-image-1 não retornou b64_json");

    // ── Salvar no object storage ─────────────────────────────────────────────
    const ts      = Date.now();
    const buf     = Buffer.from(b64, "base64");
    const storage = new ObjectStorageService();
    const objectPath = await storage.savePrivateBuffer(
      buf,
      "image/png",
      `render-${cenaId}-v${ts}.png`,
    );
    const servePath = objectPath.replace(/^\/objects\//, "");
    const imageUrl  = `/api/storage/objects/${servePath}`;

    const tempoRenderMs = Date.now() - renderCreatedAt.getTime();

    // ── Inserir versão original (v=1, origem=original) ───────────────────────
    await db
      .insert(archRenderVersoesTable)
      .values({
        cenaId,
        versao:    1,
        imageUrl,
        prompt,
        sceneData: sceneData as Record<string, unknown>,
        origem:    "original",
      });

    // ── Atualizar arch_renders ───────────────────────────────────────────────
    await db
      .update(archRendersTable)
      .set({ status: "concluido", imageUrl, tempoRenderMs })
      .where(eq(archRendersTable.id, renderId));

    // ── Atualizar arch_cenas ─────────────────────────────────────────────────
    await db
      .update(archCenasTable)
      .set({ status: "concluido", renderUrl: imageUrl, updatedAt: new Date() })
      .where(eq(archCenasTable.id, cenaId));

    logger.info(
      { renderId, cenaId, imageUrl, tempoRenderMs },
      "blenderService: fallback gpt-image-1 concluído",
    );

  } catch (err) {
    const erroMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, renderId, cenaId }, "blenderService: fallback gpt-image-1 falhou");
    await db
      .update(archRendersTable)
      .set({ status: "erro", erroMsg })
      .where(eq(archRendersTable.id, renderId));
    await db
      .update(archCenasTable)
      .set({ status: "erro", updatedAt: new Date() })
      .where(eq(archCenasTable.id, cenaId));
  }
}

// ─── iniciarRender ────────────────────────────────────────────────────────────

export async function iniciarRender(
  cenaId: string,
): Promise<{ renderId: string; status: string }> {
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

  // A text-only AI fallback cannot reproduce an imported model faithfully.
  // Preserve the existing image path, but reject this request before creating a job.
  const sceneData = (cena.sceneData ?? {}) as SceneData;
  if (sceneData.model && !process.env.BLENDER_SERVER_URL?.trim()) {
    throw new Error("Render 3D indisponível. Configure o worker Blender; use o Render IA com uma imagem de referência para uma alternativa visual.");
  }

  let ambienteNome: string | null = null;
  if (cena.ambienteId) {
    const [amb] = await db
      .select({ nome: archAmbientesTable.nome })
      .from(archAmbientesTable)
      .where(eq(archAmbientesTable.id, cena.ambienteId))
      .limit(1);
    ambienteNome = amb?.nome ?? null;
  }

  // Attach only a private scene configuration tied to the exact imported model.
  // Fail before creating a render job if the saved version cannot be verified.
  let storedSettings: Record<string, unknown> | undefined;
  if (sceneData.model) {
    const root = process.env.ARQDOR_MODEL_ROOT;
    if (!root?.trim()) throw new Error("Armazenamento privado de modelos não configurado");
    const key = sceneData.model.key;
    const match = /^([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/model\.glb$/.exec(key);
    if (!match || match[1] !== cena.projetoId) throw new Error("Referência de modelo incompatível com o projeto");
    const modelId = safeSegment(match[2]);
    const storage = new ModelFileStore(root);
    const record = await storage.get(projeto.tenantId, cena.projetoId, modelId);
    if (record.sha256 !== sceneData.model.sha256) throw new Error("Versão do modelo divergente");
    const persisted = await storage.sceneSettings(projeto.tenantId, cena.projetoId, modelId);
    storedSettings = persisted.settings;
  }

  // 2. Inserir registro de render (aguardando)
  const [render] = await db
    .insert(archRendersTable)
    .values({ cenaId, status: "aguardando" })
    .returning();

  if (!render) throw new Error("Falha ao criar registro de render.");

  // 3. Marcar cena como renderizando
  await db
    .update(archCenasTable)
    .set({ status: "renderizando", updatedAt: new Date() })
    .where(eq(archCenasTable.id, cenaId));

  // 4. Montar sceneConfig
  const sceneConfig = buildSceneConfig(sceneData, ambienteNome ?? cena.nome);
  if (storedSettings) sceneConfig.sceneSettings = storedSettings;
  if (sceneData.model) {
    sceneConfig.model = { ...sceneData.model, tenantId: projeto.tenantId };
  }

  // 5. Verificar se o servidor Blender está configurado; se não, usar fallback gpt-image-1
  if (!process.env.BLENDER_SERVER_URL?.trim()) {
    logger.info(
      { cenaId, renderId: render.id },
      "blenderService: BLENDER_SERVER_URL ausente — usando fallback gpt-image-1",
    );
    setImmediate(() => {
      _renderComGPTImage({
        renderId:        render.id,
        renderCreatedAt: render.createdAt ?? new Date(),
        cenaId,
        tenantId:        projeto.tenantId,
        sceneData,
        ambienteNome,
      }).catch(() => undefined);
    });
    return { renderId: render.id, status: "renderizando" };
  }

  // 5b. Blender path — chamar servidor externo (POST /render)
  const blenderUrl = getBlenderUrl();
  const jobId      = render.id;

  let blenderJobId: string | null = null;

  try {
    const resp = await fetch(`${blenderUrl}/render`, {
      method:  "POST",
      headers: blenderHeaders(),
      body:    JSON.stringify({
        jobId:       jobId,
        cenaId:      cenaId,
        tenantId:    projeto.tenantId,
        sceneConfig,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Blender server retornou ${resp.status}: ${text}`);
    }

    const body = (await resp.json()) as { jobId?: string; status?: string };
    blenderJobId = body.jobId ?? jobId;

    // 6. Salvar blenderJobId no registro de render
    await db
      .update(archRendersTable)
      .set({ blenderJobId, status: "renderizando" })
      .where(eq(archRendersTable.id, render.id));

    logger.info({ renderId: render.id, blenderJobId, cenaId }, "blenderService: job enviado");

  } catch (err) {
    // Falha ao contatar o servidor Blender — marcar como erro imediatamente
    const erroMsg = err instanceof Error ? err.message : String(err);
    await db
      .update(archRendersTable)
      .set({ status: "erro", erroMsg })
      .where(eq(archRendersTable.id, render.id));
    await db
      .update(archCenasTable)
      .set({ status: "erro", updatedAt: new Date() })
      .where(eq(archCenasTable.id, cenaId));

    logger.error({ err, cenaId }, "blenderService: falha ao contatar servidor Blender");
    throw err;
  }

  return { renderId: render.id, status: "renderizando" };
}

// ─── checkRenderStatus ────────────────────────────────────────────────────────

export async function checkRenderStatus(renderId: string): Promise<void> {
  // 1. Buscar render + blenderJobId
  const [render] = await db
    .select()
    .from(archRendersTable)
    .where(eq(archRendersTable.id, renderId))
    .limit(1);

  if (!render || !render.blenderJobId) return;

  // 2. Consultar o servidor Blender
  let statusResp: BlenderStatusResponse;
  try {
    const blenderUrl = getBlenderUrl();
    const resp = await fetch(`${blenderUrl}/render/${render.blenderJobId}`, {
      headers: blenderHeaders(),
      signal:  AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      logger.warn(
        { renderId, blenderJobId: render.blenderJobId, httpStatus: resp.status },
        "blenderService/check: HTTP error do servidor Blender",
      );
      return;
    }

    statusResp = (await resp.json()) as BlenderStatusResponse;
  } catch (err) {
    logger.warn({ err, renderId }, "blenderService/check: falha ao consultar servidor Blender");
    return;
  }

  const remoteStatus = statusResp.status;

  // 3. Mapear status remoto → status local
  //    aguardando   → aguardando
  //    processando  → renderizando
  //    concluido    → concluido
  //    erro/cancelado → erro
  let localStatus: string;
  if (remoteStatus === "concluido")                     localStatus = "concluido";
  else if (remoteStatus === "erro" || remoteStatus === "cancelado") localStatus = "erro";
  else if (remoteStatus === "processando")              localStatus = "renderizando";
  else                                                  localStatus = "aguardando";

  // 4. Se ainda em andamento, nada a persistir além de já saber que está vivo
  if (localStatus === "aguardando" || localStatus === "renderizando") {
    if (render.status !== localStatus) {
      await db
        .update(archRendersTable)
        .set({ status: localStatus })
        .where(eq(archRendersTable.id, renderId));
    }
    return;
  }

  // 5. Concluído ou erro — atualizar render + cena
  const imageUrl = statusResp.imageUrl ?? null;
  const erroMsg  = statusResp.erro     ?? null;
  const agora    = Date.now();

  await db
    .update(archRendersTable)
    .set({
      status:        localStatus,
      imageUrl:      imageUrl ?? undefined,
      erroMsg:       erroMsg  ?? undefined,
      tempoRenderMs: render.createdAt
        ? agora - render.createdAt.getTime()
        : undefined,
    })
    .where(eq(archRendersTable.id, renderId));

  await db
    .update(archCenasTable)
    .set({
      status:    localStatus,
      renderUrl: imageUrl ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(archCenasTable.id, render.cenaId));

  logger.info(
    { renderId, blenderJobId: render.blenderJobId, localStatus, imageUrl },
    "blenderService/check: render finalizado",
  );
}

// ─── processarSolicitacao — gera nova versão de render via gpt-image-1 ────────

export async function processarSolicitacao(solicitacaoId: string): Promise<void> {
  // 1. Buscar solicitação
  const [sol] = await db
    .select()
    .from(archRenderSolicitacoesTable)
    .where(eq(archRenderSolicitacoesTable.id, solicitacaoId))
    .limit(1);

  if (!sol) {
    logger.warn({ solicitacaoId }, "processarSolicitacao: não encontrada");
    return;
  }

  // Marcar como processando imediatamente
  await db
    .update(archRenderSolicitacoesTable)
    .set({ status: "processando" })
    .where(eq(archRenderSolicitacoesTable.id, solicitacaoId));

  try {
    // Buscar cena
    const [cena] = await db
      .select()
      .from(archCenasTable)
      .where(eq(archCenasTable.id, sol.cenaId))
      .limit(1);

    if (!cena) throw new Error(`Cena ${sol.cenaId} não encontrada`);

    // Buscar projeto (tenantId)
    const [projeto] = await db
      .select({ tenantId: archProjetosTable.tenantId })
      .from(archProjetosTable)
      .where(eq(archProjetosTable.id, cena.projetoId))
      .limit(1);

    if (!projeto) throw new Error(`Projeto não encontrado para cena ${sol.cenaId}`);

    // Buscar versão original (versao=1) — base do prompt
    const [versaoOriginal] = await db
      .select({ prompt: archRenderVersoesTable.prompt })
      .from(archRenderVersoesTable)
      .where(
        and(
          eq(archRenderVersoesTable.cenaId, sol.cenaId),
          eq(archRenderVersoesTable.versao, 1),
        ),
      )
      .limit(1);

    // 2. sceneData original da cena
    const sceneDataOriginal = (cena.sceneData ?? {}) as Record<string, unknown>;

    // 3. Novo sceneData — mesclar original preservando todos os campos
    const newSceneData: Record<string, unknown> = { ...sceneDataOriginal };

    // 3a. Adicionar itensAdicionados ao array produtos[]
    const itens = sol.itensAdicionados as ItemAdicionado[] | null;
    if (itens && itens.length > 0) {
      const produtosOriginais: string[] = Array.isArray(newSceneData["produtos"])
        ? (newSceneData["produtos"] as string[])
        : [];
      const novosItens = itens.map((it) => `${it.tipo} cor:${it.cor} pos:${it.posicao}`);
      newSceneData["produtos"] = [...produtosOriginais, ...novosItens];
    }

    // 3b. Atualizar texturasAlteradas nas cores do ambiente
    const texturas = sol.texturasAlteradas as TexturaAlterada[] | null;
    if (texturas && texturas.length > 0) {
      const coresOriginais: Record<string, string> =
        typeof newSceneData["cores"] === "object" && newSceneData["cores"] !== null
          ? { ...(newSceneData["cores"] as Record<string, string>) }
          : {};

      for (const tex of texturas) {
        // parede | piso | teto → sceneData.cores.<superficie>
        coresOriginais[tex.superficie] = tex.cor;
      }
      newSceneData["cores"] = coresOriginais;
    }

    // 4. Montar prompt enriquecido
    const sceneEstilo = String(sceneDataOriginal["estilo"] ?? "moderno");
    const sceneProdutos = Array.isArray(sceneDataOriginal["produtos"])
      ? (sceneDataOriginal["produtos"] as string[]).join(", ")
      : "";

    const basePrompt =
      versaoOriginal?.prompt ??
      `Photorealistic interior design render, ${sceneEstilo} style` +
        (sceneProdutos ? `, featuring: ${sceneProdutos}` : "");

    const itensDesc =
      itens && itens.length > 0
        ? itens.map((it) => `${it.tipo} at the ${it.posicao} in color ${it.cor}`).join(", ")
        : "";

    const texturasDesc =
      texturas && texturas.length > 0
        ? texturas
            .map((t) => `${t.superficie}: ${t.material} ${t.cor}`)
            .join(", ")
        : "";

    let prompt = basePrompt;
    if (itensDesc)    prompt += `. Additionally include: ${itensDesc}`;
    if (texturasDesc) prompt += `. Wall/Floor/Ceiling — ${texturasDesc}`;
    prompt += ". Keep all other elements identical to the original composition";

    // 5. Chamar gpt-image-1 (1536x1024 landscape, quality high)
    // Nota: dall-e-3 não existe nesta conta — usar gpt-image-1 que retorna b64_json
    // gpt-image-1 suporta quality: low|medium|high|auto (não 'hd')
    // gpt-image-1 suporta size: 1024x1024|1536x1024|1024x1536|auto
    const openai = await getOpenAIForTenant(projeto.tenantId);
    const imgResponse = await (openai.images.generate as Function)({
      model:   "gpt-image-1",
      prompt,
      n:       1,
      size:    "1536x1024",
      quality: "high",
    });

    const b64 = (imgResponse.data[0] as Record<string, unknown>)["b64_json"] as string | undefined;
    if (!b64) throw new Error("gpt-image-1 não retornou b64_json");

    // 6. Salvar no object storage — nunca sobrescrever versão existente
    const ts = Date.now();
    const buf = Buffer.from(b64, "base64");
    const storage = new ObjectStorageService();
    const objectPath = await storage.savePrivateBuffer(
      buf,
      "image/png",
      `render-${sol.cenaId}-v${ts}.png`,
    );
    const servePath = objectPath.replace(/^\/objects\//, "");
    const imageUrl  = `/api/storage/objects/${servePath}`;

    // 7. Próxima versão = última + 1
    const [ultimaVersao] = await db
      .select({ versao: archRenderVersoesTable.versao })
      .from(archRenderVersoesTable)
      .where(eq(archRenderVersoesTable.cenaId, sol.cenaId))
      .orderBy(desc(archRenderVersoesTable.versao))
      .limit(1);

    const proximaVersao = (ultimaVersao?.versao ?? 0) + 1;

    const [novaVersao] = await db
      .insert(archRenderVersoesTable)
      .values({
        cenaId:    sol.cenaId,
        versao:    proximaVersao,
        imageUrl,
        prompt,
        sceneData: newSceneData,
        origem:    "solicitacao",
      })
      .returning({ id: archRenderVersoesTable.id });

    if (!novaVersao) throw new Error("Falha ao inserir em arch_render_versoes");

    // 8. Marcar solicitação como concluída
    await db
      .update(archRenderSolicitacoesTable)
      .set({
        status:         "concluido",
        versaoGeradaId: novaVersao.id,
        processadoEm:   new Date(),
      })
      .where(eq(archRenderSolicitacoesTable.id, solicitacaoId));

    logger.info(
      { solicitacaoId, versao: proximaVersao, cenaId: sol.cenaId },
      "arch:solicitacao:concluida",
    );
  } catch (err) {
    // 9. Erro — não afetar versões anteriores
    logger.error({ err, solicitacaoId }, "arch:processarSolicitacao:erro");
    await db
      .update(archRenderSolicitacoesTable)
      .set({ status: "erro", processadoEm: new Date() })
      .where(eq(archRenderSolicitacoesTable.id, solicitacaoId))
      .catch(() => undefined);
  }
}

// ─── pollPendingRenders (chamado pelo scheduler) ──────────────────────────────

export async function pollPendingRenders(log: typeof logger): Promise<void> {
  // Busca renders aguardando ou renderizando que tenham um blenderJobId
  const pendentes = await db
    .select({ id: archRendersTable.id })
    .from(archRendersTable)
    .where(
      or(
        eq(archRendersTable.status, "aguardando"),
        eq(archRendersTable.status, "renderizando"),
      ),
    );

  const comJobId = pendentes.filter(
    (r): r is typeof r & { id: string } => Boolean(r.id),
  );

  if (comJobId.length === 0) return;

  log.info({ count: comJobId.length }, "blenderService/poll: verificando renders pendentes");

  await Promise.allSettled(
    comJobId.map((r) =>
      checkRenderStatus(r.id).catch((err) => {
        log.warn({ err, renderId: r.id }, "blenderService/poll: erro ao verificar render");
      }),
    ),
  );
}

