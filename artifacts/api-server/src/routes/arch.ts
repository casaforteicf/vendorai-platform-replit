import { Router, type Request, type IRouter } from "express";
import { and, eq, ilike, sql, desc, sum, ne, gte, lte, inArray, or } from "drizzle-orm";
import multer from "multer";
import sharp from "sharp";
import {
  db,
  archProjetosTable,
  archAmbientesTable,
  archOrcamentoItensTable,
  archCenasTable,
  archRendersTable,
  archCatalogoTable,
  produtosCatalogoTable,
  categoriasProdutoTable,
  archMaterialsTable,
  archMaterialImagesTable,
  archMaterialTenantAccessTable,
  archCatalogProductMaterialsTable,
  archMarketplaceItemsTable,
  archMarketplacePedidosTable,
  archRenderVersoesTable,
  archRenderSolicitacoesTable,
  archSuggestionsTable,
  renderSurfacesTable,
  renderSurfaceMaterialsTable,
  notificationsTable,
  tenantsTable,
  tenantNavModulesTable,
  obrasTable,
  obraEtapasTable,
  obraEtapaDependenciasTable,
  insertArchProjetoSchema,
  updateArchProjetoSchema,
  insertArchAmbienteSchema,
  updateArchAmbienteSchema,
  insertArchOrcamentoItemSchema,
  updateArchOrcamentoItemSchema,
  insertArchCatalogoSchema,
  updateArchCatalogoSchema,
  insertArchMaterialSchema,
  updateArchMaterialSchema,
  insertArchCatalogProductMaterialSchema,
  insertArchCenaSchema,
  updateArchCenaSchema,
  insertArchRenderSolicitacaoSchema,
  insertRenderSurfaceSchema,
  updateRenderSurfaceSchema,
  insertRenderSurfaceMaterialSchema,
  arqObjectsTable,
  arqMaterialsTable,
  arqAieSnapshotsTable,
  archPromptVariationsTable,
  insertArchPromptVariationSchema,
  updateArchPromptVariationSchema,
  arqdorWorkspaceProjectsTable,
  archSpecificationsTable,
  archSpecItemsTable,
  updateArchSpecItemSchema,
  updateArchSpecificationSchema,
  archPartnersTable,
  archSolicitacoesTable,
  insertArchPartnerSchema,
  updateArchPartnerSchema,
  archKnowledgeEntriesTable,
  archKnowledgeTagsTable,
  archOfficeTemplatesTable,
  archAiRendersTable,
  archConceptProjectsTable,
  leadsTable,
  dealsTable,
  usersTable,
  insertArchConceptProjectSchema,
  updateArchConceptProjectSchema,
} from "@workspace/db";
import { z } from "zod/v4";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { authenticate } from "../middlewares/auth.js";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage.js";
import { captureGeneratedMedia } from "../services/media-library.js";
import { iniciarRender, processarSolicitacao } from "../services/blenderService.js";
import { toFile } from "openai";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { callGoogleVertexImage, callReplicateFlux, callOpenAI } from "../lib/ai-gateway.js";
import { arqOrchestrator } from "../lib/arqdor/orchestrator/index.js";
import { automationLogsTable } from "@workspace/db";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { pickNextVendedor } from "../lib/round-robin.js";
import { createSpecificationParticipation } from "../services/commission-engine.js";
import { ensureStandardConstructionCatalog } from "../lib/ensure-standard-construction-catalog.js";
import { ensureArqdorStarterLibrary } from "../lib/arqdor/starter-library.js";
import { searchPolyHavenModels, resolvePolyHavenModel } from "../lib/arqdor/polyhaven.js";
import { contentTypeForModelAsset, downloadSketchfabGltfArchive, extractZipArchive, getSketchfabDownload, getSketchfabModel, searchSketchfabModels } from "../lib/arqdor/sketchfab.js";
import { getValidSketchfabAccessToken } from "../services/sketchfab-connection.js";
import { saveSketchfabAsset } from "../services/sketchfab-storage.js";
import { buildArchitecturalStrategyRepertoire } from "../lib/arqdor-architecture-strategies.js";
import { buildArchitecturalProjectStrategy } from "../lib/arqdor-project-strategy.js";
import { evaluateProjectMasterAcceptance } from "../lib/arqdor-project-master-validation.js";
import { buildConceptDxf, conceptDxfFilename } from "../lib/arqdor-concept-dxf.js";
import { parseAsciiDxf } from "../lib/arqdor-dxf-import.js";
import { parseIfcMetadata } from "../lib/arqdor-ifc-metadata.js";
import { buildConceptIfc, conceptIfcFilename } from "../lib/arqdor-concept-ifc.js";
import { parseIfcEditableGeometry } from "../lib/arqdor-ifc-editable.js";
import { fitReferenceImageToLot } from "../lib/arqdor-reference-calibration.js";
import { traceReferencePlanImage } from "../lib/arqdor-reference-ai-trace.js";
import { analyzeReferencePhoto } from "../lib/arqdor-reference-photo-analysis.js";
import { analyzeRealEnvironmentImage, interventionPromptContext, type RealEnvironmentAction, type RealEnvironmentAnalysis, type RealEnvironmentKind, type RealEnvironmentUseMode } from "../lib/arqdor-real-environment.js";

function sanitizeAIError(err: any): { status: number; message: string } {
  const raw: string = err?.message ?? String(err ?? "");
  const rawLow = raw.toLowerCase();
  const httpStatus: number = err?.status ?? err?.statusCode ?? 500;

  if (
    rawLow.includes("billing hard limit") ||
    rawLow.includes("you exceeded your current quota") ||
    rawLow.includes("insufficient_quota") ||
    rawLow.includes("exceeded your current quota")
  ) {
    return { status: 402, message: "Limite de uso de IA atingido. Entre em contato com o suporte para recarregar os créditos." };
  }
  if (rawLow.includes("rate limit") || rawLow.includes("too many requests") || httpStatus === 429) {
    return { status: 429, message: "Muitas requisições simultâneas. Aguarde alguns segundos e tente novamente." };
  }
  if (rawLow.includes("content policy") || rawLow.includes("safety system")) {
    return { status: 400, message: "A imagem ou prompt foi bloqueado pela política de conteúdo. Tente com uma imagem diferente." };
  }
  const safeStatus = httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500;
  return { status: safeStatus, message: raw || "Erro ao processar com IA." };
}

async function createArchitectJsonCompletion(input: {
  tenantId: string;
  system: string;
  user: string;
  maxTokens?: number;
}) {
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: input.maxTokens ?? 7000,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    });
    return {
      raw: message.content.filter((item: any) => item.type === "text").map((item: any) => item.text).join(""),
      stopReason: (message as any).stop_reason ?? null,
      engine: "claude-sonnet-4-6",
    };
  } catch (anthropicError) {
    const openai = await getOpenAIForTenant(input.tenantId);
    const completion = await openai.chat.completions.create({
      model: process.env["ARQDOR_ARCHITECT_FALLBACK_MODEL"]?.trim() || "gpt-5.6-luna",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    });
    return {
      raw: completion.choices[0]?.message?.content ?? "{}",
      stopReason: null,
      engine: process.env["ARQDOR_ARCHITECT_FALLBACK_MODEL"]?.trim() || "gpt-5.6-luna",
      fallbackReason: anthropicError instanceof Error ? anthropicError.message.slice(0, 300) : "anthropic_unavailable",
    };
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router: IRouter = Router();

const referencePlanTraceFlights = new Map<
  string,
  Promise<Awaited<ReturnType<typeof traceReferencePlanImage>>>
>();

async function runReferencePlanTraceSingleFlight(
  key: string,
  work: () => Promise<Awaited<ReturnType<typeof traceReferencePlanImage>>>,
) {
  const active = referencePlanTraceFlights.get(key);
  if (active) return active;

  const promise = work();
  referencePlanTraceFlights.set(key, promise);
  try {
    return await promise;
  } finally {
    if (referencePlanTraceFlights.get(key) === promise) {
      referencePlanTraceFlights.delete(key);
    }
  }
}

const developConceptWithAiSchema = z.object({
  mode: z.enum(["assistido", "automatico", "preservacao_maxima"]).default("assistido"),
  preserveLayout: z.boolean().default(true),
  style: z.enum([
    "contemporaneo", "minimalista", "classico_contemporaneo", "tropical", "industrial", "rustico_contemporaneo",
  ]).optional(),
});

const facadeStudySchema = z.object({
  action: z.enum(["diagnose", "develop"]),
  intervention: z.enum(["leve", "moderada", "marcante"]).default("moderada"),
  facade: z.record(z.string(), z.unknown()).default({}),
  facadeDesign: z.object({
    surfaceMaterials: z.record(z.string(), z.string()).optional(),
    volumes: z.array(z.record(z.string(), z.unknown())).max(40).optional(),
    lighting: z.enum(["day", "sunset", "night"]).optional(),
    showLandscaping: z.boolean().optional(),
  }).optional(),
  geometryContract: z.object({
    version: z.literal("master_facade_v1"),
    frontSide: z.enum(["top", "bottom", "left", "right"]),
    roof: z.enum(["platibanda", "aparente", "misto"]),
    derivedFacade: z.record(z.string(), z.unknown()),
    walls: z.array(z.object({
      id: z.string(),
      floor: z.number().int().min(0).max(5),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      thickness: z.number().optional(),
    })).max(300),
    openings: z.array(z.object({
      id: z.string(),
      floor: z.number().int().min(0).max(5),
      type: z.enum(["door", "window"]),
      orientation: z.enum(["horizontal", "vertical"]),
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      sillHeight: z.number().min(0),
    })).max(200),
    roomFootprints: z.array(z.object({
      id: z.string(),
      kind: z.string(),
      floor: z.number().int().min(0).max(5),
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      depth: z.number().positive(),
    })).max(120),
  }).optional(),
});

const specialistHousePlanSchema = z.object({
  lotWidth: z.number().min(5).max(100),
  lotDepth: z.number().min(8).max(200),
  intervention: z.enum(["preservar", "otimizar", "valorizar", "assinatura"]).default("valorizar"),
  brief: z.object({
    bedrooms: z.number().int().min(1).max(8),
    suites: z.number().int().min(0).max(6),
    floors: z.number().int().min(1).max(3),
    garageSpaces: z.number().int().min(0).max(5),
    gourmet: z.boolean(),
    pool: z.boolean(),
    office: z.boolean(),
    integratedKitchen: z.boolean(),
    privateAwaySocial: z.boolean(),
    desiredAreaTotal: z.number().min(40).max(1200).optional(),
    roomProgram: z.array(z.object({
      id: z.string().min(1).max(120),
      kind: z.enum(["sala","cozinha","suite","quarto","banheiro","lavanderia","garagem","gourmet","piscina","outro"]),
      label: z.string().min(1).max(120),
      quantity: z.number().int().min(0).max(8),
      targetArea: z.number().min(2.4).max(120),
      preferredWidth: z.number().min(1.2).max(30).optional(),
      preferredDepth: z.number().min(1.2).max(30).optional(),
      floorPreference: z.enum(["terreo","superior","qualquer"]).optional(),
      required: z.boolean().optional(),
      notes: z.string().max(300).optional(),
    })).max(40).optional(),
    adjacencyRules: z.array(z.object({
      id: z.string().min(1).max(120),
      fromRequestId: z.string().min(1).max(120),
      toRequestId: z.string().min(1).max(120),
      relation: z.enum(["direct", "near", "away"]),
      required: z.boolean(),
    })).max(60).optional(),
  }),
  vision: z.object({
    lifestyle: z.enum(["familia", "receber", "tranquilidade", "praticidade", "misto"]),
    protagonist: z.enum(["social", "cozinha", "gourmet", "suite", "jardim"]),
    priorities: z.array(z.enum(["luz_natural", "privacidade", "integracao", "natureza", "armazenamento", "flexibilidade"])).max(6),
    budgetStrategy: z.enum(["otimizar", "equilibrar", "priorizar_experiencia"]),
    futureNeeds: z.string().max(500).default(""),
    mustHave: z.string().max(700).default(""),
    avoid: z.string().max(500).default(""),
    household: z.object({
      adults: z.number().int().min(0).max(8).default(2),
      children: z.number().int().min(0).max(8).default(0),
      elderly: z.number().int().min(0).max(8).default(0),
      pets: z.boolean().default(false),
    }).optional(),
    routine: z.object({
      homeOffice: z.enum(["never", "sometimes", "daily"]).default("never"),
      receivesGuests: z.enum(["rarely", "sometimes", "often"]).default("sometimes"),
      cooking: z.enum(["little", "daily", "enthusiast"]).default("daily"),
      laundry: z.enum(["basic", "intensive"]).default("basic"),
      accessibility: z.enum(["none", "future", "required"]).default("none"),
    }).optional(),
  }).optional(),
  rooms: z.array(z.object({
    id: z.string().min(1),
    kind: z.string().min(1),
    label: z.string().min(1),
    width: z.number().positive(),
    depth: z.number().positive(),
    floor: z.number().int().min(0).max(5),
    x: z.number().optional(),
    y: z.number().optional(),
    locked: z.boolean().optional(),
    targetArea: z.number().min(2.4).max(120).optional(),
    targetWidth: z.number().min(1.2).max(30).optional(),
    targetDepth: z.number().min(1.2).max(30).optional(),
    programNotes: z.string().max(300).optional(),
    required: z.boolean().optional(),
    programRequestId: z.string().max(120).optional(),
    floorFlexible: z.boolean().optional(),
  })).min(1).max(50),
});

type SpecialistPlanRoom = z.infer<typeof specialistHousePlanSchema>["rooms"][number] & {
  x: number;
  y: number;
};

type SpecialistPlanQuality = {
  score: number;
  status: "approved" | "rejected";
  issues: string[];
  strengths: string[];
};

const PLAN_EPS = 0.06;

function specialistLifestyleDirectives(input: z.infer<typeof specialistHousePlanSchema>) {
  const vision = input.vision;
  if (!vision) return [];
  const household = vision.household ?? { adults: 2, children: 0, elderly: 0, pets: false };
  const routine = vision.routine ?? {
    homeOffice: "never" as const,
    receivesGuests: "sometimes" as const,
    cooking: "daily" as const,
    laundry: "basic" as const,
    accessibility: "none" as const,
  };
  const directives: string[] = [];

  if (household.children > 0) {
    directives.push("Crianças na casa: reduzir conflitos de circulação, manter dormitórios infantis com acesso simples ao setor social e preservar supervisão sem sacrificar privacidade.");
  }
  if (household.elderly > 0 || routine.accessibility === "required") {
    directives.push("Acessibilidade é requisito: priorizar rotas sem degraus, circulação generosa, banheiro social acessível e evitar dependência exclusiva de escada para uso cotidiano.");
  } else if (routine.accessibility === "future") {
    directives.push("Preparar envelhecimento no lugar: prever adaptação futura simples, rota principal ampla e pelo menos um ambiente flexível no térreo quando possível.");
  }
  if (routine.homeOffice === "daily") {
    directives.push("Home office diário: escritório deve ter privacidade acústica e ficar afastado de gourmet, TV e circulação social intensa.");
  } else if (routine.homeOffice === "sometimes") {
    directives.push("Home office eventual: permitir ambiente flexível ou escritório compacto sem desperdiçar área.");
  }
  if (routine.receivesGuests === "often" || vision.lifestyle === "receber") {
    directives.push("Recebem com frequência: fortalecer sequência cozinha–jantar–estar–gourmet/lazer, com lavabo acessível sem invadir área íntima.");
  }
  if (routine.cooking === "enthusiast" || vision.protagonist === "cozinha") {
    directives.push("Cozinha protagonista: garantir bancada funcional, armazenamento, relação direta com jantar e boa conexão com gourmet sem conflito com lavanderia.");
  }
  if (routine.laundry === "intensive") {
    directives.push("Lavanderia de uso intenso: reservar área funcional real, armazenamento e acesso de serviço eficiente, preferencialmente próximo à garagem/saída de serviço.");
  }
  if (household.pets) {
    directives.push("Há pets: considerar acesso fácil ao exterior, área de apoio/limpeza e materiais/circulações compatíveis com uso cotidiano.");
  }
  if (vision.priorities.includes("privacidade") || vision.lifestyle === "tranquilidade") {
    directives.push("Privacidade é prioridade: proteger dormitórios e suíte das visadas da entrada e do ruído da área social.");
  }
  if (vision.priorities.includes("flexibilidade")) {
    directives.push("Flexibilidade é prioridade: ao menos um ambiente deve aceitar mudança de uso sem reforma estrutural relevante.");
  }
  if (vision.priorities.includes("armazenamento")) {
    directives.push("Armazenamento é prioridade: prever rouparia, despensa/apoio e armários sem comprometer circulação mínima.");
  }
  if (vision.priorities.includes("natureza") || vision.protagonist === "jardim") {
    directives.push("Relação com natureza é prioridade: orientar áreas sociais para jardim/lazer e criar continuidade interior–exterior.");
  }
  return directives;
}

function specialistOverlap(a: SpecialistPlanRoom, b: SpecialistPlanRoom) {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
  return overlapX > PLAN_EPS && overlapY > PLAN_EPS;
}

function specialistSharedEdge(a: SpecialistPlanRoom, b: SpecialistPlanRoom) {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
  const horizontal = Math.abs(a.y + a.depth - b.y) <= PLAN_EPS || Math.abs(b.y + b.depth - a.y) <= PLAN_EPS;
  const vertical = Math.abs(a.x + a.width - b.x) <= PLAN_EPS || Math.abs(b.x + b.width - a.x) <= PLAN_EPS;
  return Math.max(horizontal ? overlapX : 0, vertical ? overlapY : 0);
}

function specialistTouches(a: SpecialistPlanRoom, b: SpecialistPlanRoom, minShared = 0.65) {
  return specialistSharedEdge(a, b) >= minShared;
}

function specialistRoomGap(a: SpecialistPlanRoom, b: SpecialistPlanRoom) {
  if (a.floor !== b.floor) return Number.POSITIVE_INFINITY;
  const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.depth, b.y + b.depth));
  return Math.hypot(gapX, gapY);
}

function specialistAdjacencySatisfied(
  a: SpecialistPlanRoom,
  b: SpecialistPlanRoom,
  relation: "direct" | "near" | "away",
) {
  if (relation === "direct") return a.floor === b.floor && specialistTouches(a, b, 0.55);
  if (relation === "near") return a.floor === b.floor && specialistRoomGap(a, b) <= 2.5;
  return a.floor !== b.floor || specialistRoomGap(a, b) >= 3.0;
}

function specialistConnected(rooms: SpecialistPlanRoom[]) {
  if (rooms.length <= 1) return true;
  const visited = new Set<string>([rooms[0].id]);
  const queue = [rooms[0]];
  while (queue.length) {
    const room = queue.shift()!;
    for (const candidate of rooms) {
      if (visited.has(candidate.id) || !specialistTouches(room, candidate)) continue;
      visited.add(candidate.id);
      queue.push(candidate);
    }
  }
  return visited.size === rooms.length;
}

function evaluateSpecialistPlan(
  rooms: SpecialistPlanRoom[],
  input: z.infer<typeof specialistHousePlanSchema>,
): SpecialistPlanQuality {
  const issues: string[] = [];
  const strengths: string[] = [];
  let score = 100;

  for (let floor = 0; floor < input.brief.floors; floor += 1) {
    const floorRooms = rooms.filter((room) => room.floor === floor && room.kind !== "piscina");
    if (!floorRooms.length) {
      issues.push(`Pavimento ${floor + 1} sem ambientes.`);
      score -= 35;
      continue;
    }

    for (let i = 0; i < floorRooms.length; i += 1) {
      for (let j = i + 1; j < floorRooms.length; j += 1) {
        if (specialistOverlap(floorRooms[i], floorRooms[j])) {
          issues.push(`Sobreposição: ${floorRooms[i].label} × ${floorRooms[j].label}.`);
          score -= 35;
        }
      }
    }

    if (!specialistConnected(floorRooms)) {
      issues.push(`Pavimento ${floor + 1} está fragmentado: existem ambientes sem conexão física com a casa.`);
      score -= 35;
    } else {
      strengths.push(`Pavimento ${floor + 1} forma um conjunto contínuo.`);
    }

    const minX = Math.min(...floorRooms.map((room) => room.x));
    const minY = Math.min(...floorRooms.map((room) => room.y));
    const maxX = Math.max(...floorRooms.map((room) => room.x + room.width));
    const maxY = Math.max(...floorRooms.map((room) => room.y + room.depth));
    const bboxArea = Math.max(1, (maxX - minX) * (maxY - minY));
    const roomArea = floorRooms.reduce((sum, room) => sum + room.width * room.depth, 0);
    const compactness = roomArea / bboxArea;
    if (compactness < 0.52) {
      issues.push(`Pavimento ${floor + 1} tem vazios/resíduos excessivos na implantação.`);
      score -= 18;
    } else if (compactness >= 0.72) {
      strengths.push(`Implantação compacta e eficiente no pavimento ${floor + 1}.`);
    }
  }

  const suites = rooms.filter((room) => room.kind === "suite");
  const suiteBaths = rooms.filter((room) =>
    room.kind === "banheiro" && /su[ií]te|master/i.test(room.label)
  );
  for (let index = 0; index < suites.length; index += 1) {
    const suite = suites[index];
    const sameFloorBaths = suiteBaths.filter((bath) => bath.floor === suite.floor);
    const ownNamed = sameFloorBaths.filter((bath) => {
      const suiteNumber = suite.label.match(/\d+/)?.[0];
      const bathNumber = bath.label.match(/\d+/)?.[0];
      return suiteNumber ? bathNumber === suiteNumber : true;
    });
    const candidates = ownNamed.length ? ownNamed : sameFloorBaths;
    if (!candidates.some((bath) => specialistTouches(suite, bath, 0.55))) {
      issues.push(`${suite.label} não possui banheiro de suíte adjacente e diretamente conectável.`);
      score -= 28;
    } else {
      strengths.push(`${suite.label} possui banheiro próprio adjacente.`);
    }
  }

  const adjacencyRules = input.brief.adjacencyRules ?? [];
  for (const rule of adjacencyRules) {
    const sources = rooms.filter((room) => room.programRequestId === rule.fromRequestId);
    const targets = rooms.filter((room) => room.programRequestId === rule.toRequestId);
    if (!sources.length || !targets.length) {
      const message = `Relação entre ambientes não pôde ser verificada porque um dos grupos não existe na planta.`;
      issues.push(rule.required ? `Adjacência obrigatória: ${message}` : `Preferência de adjacência: ${message}`);
      score -= rule.required ? 22 : 6;
      continue;
    }

    let satisfied = false;
    if (rule.relation === "away") {
      satisfied = sources.every((source) =>
        targets.every((target) => specialistAdjacencySatisfied(source, target, "away"))
      );
    } else {
      satisfied = sources.every((source) =>
        targets.some((target) => specialistAdjacencySatisfied(source, target, rule.relation))
      );
    }

    const fromLabel = input.brief.roomProgram?.find((item) => item.id === rule.fromRequestId)?.label ?? sources[0]?.label ?? "Ambiente";
    const toLabel = input.brief.roomProgram?.find((item) => item.id === rule.toRequestId)?.label ?? targets[0]?.label ?? "Ambiente";
    const relationLabel = rule.relation === "direct"
      ? "conectado diretamente a"
      : rule.relation === "near"
        ? "próximo de"
        : "afastado de";

    if (!satisfied) {
      issues.push(
        `${rule.required ? "Adjacência obrigatória" : "Preferência de adjacência"}: ${fromLabel} deve ficar ${relationLabel} ${toLabel}.`,
      );
      score -= rule.required ? 22 : 7;
    } else {
      strengths.push(`${fromLabel} está ${relationLabel} ${toLabel}, conforme o briefing.`);
    }
  }

  const kitchen = rooms.find((room) => room.kind === "cozinha");
  const living = rooms.find((room) => room.kind === "sala");
  const gourmet = rooms.find((room) => room.kind === "gourmet");
  const laundry = rooms.find((room) => room.kind === "lavanderia");
  const garage = rooms.find((room) => room.kind === "garagem");

  if (kitchen && input.brief.integratedKitchen && living && !specialistTouches(kitchen, living)) {
    issues.push("Briefing pede sala/cozinha integradas, mas os dois ambientes não são adjacentes.");
    score -= 18;
  }
  if (kitchen && gourmet && input.brief.gourmet && !specialistTouches(kitchen, gourmet)) {
    issues.push("Cozinha e gourmet estão separados, apesar do programa de lazer.");
    score -= 10;
  }
  if (kitchen && laundry && !specialistTouches(kitchen, laundry)) {
    issues.push("Lavanderia está distante da cozinha/área de serviço.");
    score -= 8;
  }
  if (garage) {
    const ground = rooms.filter((room) => room.floor === garage.floor && room.kind !== "piscina" && room.id !== garage.id);
    const usefulGarageLink = ground.some((room) =>
      specialistTouches(garage, room) && !["suite", "quarto", "banheiro"].includes(room.kind)
    );
    if (!usefulGarageLink) {
      issues.push("Garagem não possui acesso coerente ao setor social/serviço.");
      score -= 12;
    }
  }

  const circulationArea = rooms
    .filter((room) => room.kind === "circulacao")
    .reduce((sum, room) => sum + room.width * room.depth, 0);
  const builtArea = rooms
    .filter((room) => room.kind !== "piscina")
    .reduce((sum, room) => sum + room.width * room.depth, 0);

  const ergonomicMinWidth: Record<string, number> = {
    sala: 3.0,
    cozinha: 2.4,
    suite: 3.0,
    quarto: 2.7,
    banheiro: 1.2,
    lavanderia: 1.5,
    garagem: 2.7,
    gourmet: 3.0,
    piscina: 2.0,
    outro: 2.2,
    circulacao: 0.9,
    escada: 1.0,
  };

  for (const room of rooms) {
    const targetArea = Number(room.targetArea);
    if (!Number.isFinite(targetArea) || targetArea <= 0 || room.kind === "circulacao" || room.kind === "escada") continue;
    const actualArea = room.width * room.depth;
    const ratio = actualArea / targetArea;
    const minDimension = Math.min(room.width, room.depth);
    const ergonomicMin = ergonomicMinWidth[room.kind] ?? 1.8;
    if (minDimension < ergonomicMin) {
      issues.push(`${room.label} tem dimensão útil muito estreita (${minDimension.toFixed(2)} m; referência mínima ${ergonomicMin.toFixed(2)} m).`);
      score -= room.required !== false ? 14 : 7;
    }
    const aspectRatio = Math.max(room.width, room.depth) / Math.max(0.1, minDimension);
    if (!["circulacao", "garagem", "piscina"].includes(room.kind) && aspectRatio > 3.2) {
      issues.push(`${room.label} ficou excessivamente alongado para uso confortável.`);
      score -= 7;
    }
    const targetWidth = Number(room.targetWidth);
    const targetDepth = Number(room.targetDepth);
    if (Number.isFinite(targetWidth) && Number.isFinite(targetDepth)) {
      const direct = Math.abs(room.width - targetWidth) / targetWidth + Math.abs(room.depth - targetDepth) / targetDepth;
      const rotated = Math.abs(room.width - targetDepth) / targetDepth + Math.abs(room.depth - targetWidth) / targetWidth;
      const dimensionDeviation = Math.min(direct, rotated);
      if (dimensionDeviation > 0.42) {
        issues.push(`${room.label} ficou distante das dimensões preferidas de ${targetWidth.toFixed(2)} × ${targetDepth.toFixed(2)} m.`);
        score -= room.required !== false ? 10 : 5;
      } else if (dimensionDeviation <= 0.2) {
        strengths.push(`${room.label} respeita as dimensões preferidas.`);
      }
    }
    if (room.required !== false && ratio < 0.72) {
      issues.push(`${room.label} ficou com ${actualArea.toFixed(1)} m², muito abaixo da meta de ${targetArea.toFixed(1)} m².`);
      score -= 18;
    } else if (ratio < 0.82) {
      issues.push(`${room.label} ficou abaixo da metragem pedida (${actualArea.toFixed(1)} m² vs ${targetArea.toFixed(1)} m²).`);
      score -= 8;
    } else if (ratio > 1.35) {
      issues.push(`${room.label} ficou muito acima da metragem pedida (${actualArea.toFixed(1)} m² vs ${targetArea.toFixed(1)} m²).`);
      score -= 6;
    } else if (ratio >= 0.9 && ratio <= 1.2) {
      strengths.push(`${room.label} respeita a metragem-alvo.`);
    }
  }

  const desiredAreaTotal = Number(input.brief.desiredAreaTotal);
  if (Number.isFinite(desiredAreaTotal) && desiredAreaTotal > 0) {
    const totalRatio = builtArea / desiredAreaTotal;
    if (totalRatio < 0.72 || totalRatio > 1.28) {
      issues.push(`Área resultante de ${builtArea.toFixed(0)} m² está distante da meta total de ${desiredAreaTotal.toFixed(0)} m².`);
      score -= 16;
    } else if (totalRatio < 0.82 || totalRatio > 1.18) {
      issues.push(`Área resultante de ${builtArea.toFixed(0)} m² ficou fora da faixa desejável da meta de ${desiredAreaTotal.toFixed(0)} m².`);
      score -= 8;
    } else {
      strengths.push(`Área global próxima da meta de ${desiredAreaTotal.toFixed(0)} m².`);
    }
  }

  if (builtArea > 0 && circulationArea / builtArea > 0.16) {
    issues.push("Área de circulação está acima de 16% da área construída.");
    score -= 10;
  }

  if (input.brief.privateAwaySocial) {
    const privateRooms = rooms.filter((room) => room.kind === "suite" || room.kind === "quarto");
    const noisyRooms = rooms.filter((room) => room.kind === "garagem" || room.kind === "gourmet");
    const badAdjacency = privateRooms.some((privateRoom) =>
      noisyRooms.some((noisy) => privateRoom.floor === noisy.floor && specialistTouches(privateRoom, noisy))
    );
    if (badAdjacency) {
      issues.push("Área íntima encosta diretamente em garagem/gourmet apesar da preferência por privacidade.");
      score -= 12;
    }
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    status: score >= 72 && !issues.some((issue) =>
      issue.startsWith("Sobreposição:") ||
      issue.includes("fragmentado") ||
      issue.includes("não possui banheiro de suíte") ||
      issue.includes("muito abaixo da meta") ||
      issue.startsWith("Adjacência obrigatória:")
    ) ? "approved" : "rejected",
    issues: [...new Set(issues)].slice(0, 12),
    strengths: [...new Set(strengths)].slice(0, 8),
  };
}

function sanitizeSpecialistPlan(
  plan: any,
  input: z.infer<typeof specialistHousePlanSchema>,
) {
  const patches = Array.isArray(plan?.roomPatches) ? plan.roomPatches : [];
  const patchIds = patches.map((patch: any) => String(patch?.id ?? "")).filter(Boolean);
  const duplicateIds = patchIds.filter((id: string, index: number) => patchIds.indexOf(id) !== index);
  const requiredIds = input.rooms.filter((room) => !room.locked).map((room) => room.id);
  if (duplicateIds.length || requiredIds.some((id) => !patchIds.includes(id))) return null;

  const rooms: SpecialistPlanRoom[] = input.rooms.map((room) => {
    const patch = patches.find((item: any) => item?.id === room.id);
    const width = Math.max(1.2, Math.min(input.lotWidth, Number(patch?.width ?? room.width)));
    const depth = Math.max(1.2, Math.min(input.lotDepth, Number(patch?.depth ?? room.depth)));
    const sourceX = typeof room.x === "number" && Number.isFinite(room.x) ? room.x : 0;
    const sourceY = typeof room.y === "number" && Number.isFinite(room.y) ? room.y : 0;
    const rawX = room.locked ? sourceX : Number(patch?.x ?? sourceX);
    const rawY = room.locked ? sourceY : Number(patch?.y ?? sourceY);
    const requestedFloor = Number(patch?.floor);
    const floor = room.floorFlexible && Number.isFinite(requestedFloor)
      ? Math.max(0, Math.min(input.brief.floors - 1, Math.round(requestedFloor)))
      : room.floor;
    const x = Math.max(0, Math.min(input.lotWidth - width, Number.isFinite(rawX) ? rawX : sourceX));
    const y = Math.max(0, Math.min(input.lotDepth - depth, Number.isFinite(rawY) ? rawY : sourceY));
    return {
      ...room,
      floor,
      width: Math.round(width * 100) / 100,
      depth: Math.round(depth * 100) / 100,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
    };
  });

  const quality = evaluateSpecialistPlan(rooms, input);
  if (quality.status !== "approved") return { rejected: true as const, rooms, quality };

  const suggestedArea = Math.round(
    rooms
      .filter((room) => room.kind !== "piscina")
      .reduce((sum, room) => sum + room.width * room.depth, 0),
  );

  const programItems = rooms
    .filter((room) => Number.isFinite(Number(room.targetArea)) && room.kind !== "circulacao" && room.kind !== "escada")
    .map((room) => {
      const targetArea = Number(room.targetArea);
      const actualArea = Math.round(room.width * room.depth * 10) / 10;
      const deviationPct = targetArea > 0 ? Math.round(((actualArea - targetArea) / targetArea) * 100) : 0;
      return {
        id: room.id,
        label: room.label,
        required: room.required !== false,
        targetArea,
        targetWidth: Number.isFinite(Number(room.targetWidth)) ? Number(room.targetWidth) : null,
        targetDepth: Number.isFinite(Number(room.targetDepth)) ? Number(room.targetDepth) : null,
        actualWidth: room.width,
        actualDepth: room.depth,
        actualArea,
        deviationPct,
        status: Math.abs(deviationPct) <= 15 ? "ok" : Math.abs(deviationPct) <= 25 ? "warning" : "outside_target",
      };
    });

  const adjacencyItems = (input.brief.adjacencyRules ?? []).map((rule) => {
    const sources = rooms.filter((room) => room.programRequestId === rule.fromRequestId);
    const targets = rooms.filter((room) => room.programRequestId === rule.toRequestId);
    const satisfied = rule.relation === "away"
      ? sources.length > 0 && targets.length > 0 && sources.every((source) =>
          targets.every((target) => specialistAdjacencySatisfied(source, target, "away"))
        )
      : sources.length > 0 && targets.length > 0 && sources.every((source) =>
          targets.some((target) => specialistAdjacencySatisfied(source, target, rule.relation))
        );
    return {
      id: rule.id,
      fromLabel: input.brief.roomProgram?.find((item) => item.id === rule.fromRequestId)?.label ?? "Ambiente",
      toLabel: input.brief.roomProgram?.find((item) => item.id === rule.toRequestId)?.label ?? "Ambiente",
      relation: rule.relation,
      required: rule.required,
      satisfied,
    };
  });

  return {
    rejected: false as const,
    rooms,
    suggestedArea,
    notes: Array.isArray(plan?.notes) ? plan.notes.map(String).slice(0, 8) : [],
    designRationale: String(plan?.designRationale ?? ""),
    architectureScore: quality.score,
    quality,
    programCompliance: {
      desiredAreaTotal: input.brief.desiredAreaTotal ?? null,
      actualAreaTotal: suggestedArea,
      rooms: programItems,
      outsideTargetCount: programItems.filter((item) => item.status === "outside_target").length,
      adjacency: adjacencyItems,
      adjacencySatisfiedCount: adjacencyItems.filter((item) => item.satisfied).length,
      adjacencyTotalCount: adjacencyItems.length,
    },
  };
}

function conceptGeometryHealth(concept: { rooms: unknown; configuration: unknown }) {
  const rooms = Array.isArray(concept.rooms) ? concept.rooms as Array<Record<string, unknown>> : [];
  const configuration = (concept.configuration ?? {}) as Record<string, unknown>;
  const customWalls = Array.isArray(configuration.customWalls)
    ? configuration.customWalls as Array<Record<string, unknown>>
    : [];
  const messages: string[] = [];
  let score = 100;

  if (!rooms.length) {
    score -= 45;
    messages.push("Nenhum ambiente foi encontrado no pré-projeto.");
  }
  const floors = Number(configuration.floors ?? 1);
  const roomFloors = new Set(rooms.map((room) => Number(room.floor ?? 0)));
  if (floors > 1 && roomFloors.size < 2) {
    score -= 20;
    messages.push("O projeto indica múltiplos pavimentos, mas a distribuição ainda não cobre todos os níveis.");
  }
  if (!customWalls.length) {
    score -= 8;
    messages.push("Sem paredes personalizadas persistidas; o envelope pode ser inferido a partir dos ambientes.");
  }
  const projectScope = String(configuration.projectScope ?? "house");
  const hasGarage = rooms.some((room) => String(room.kind ?? "").toLowerCase() === "garagem");
  if (projectScope === "house" && !hasGarage) {
    messages.push("Garagem não identificada. Não invente garagem, portão ou volume se o briefing não exigir.");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    status: score >= 85 ? "ok" as const : score >= 60 ? "warning" as const : "error" as const,
    messages,
  };
}

function normalizeAiLayoutSuggestion(
  ai: Record<string, unknown>,
  concept: { id: string; lot: unknown; rooms: unknown; configuration: unknown },
) {
  const lot = (concept.lot ?? {}) as Record<string, unknown>;
  const lotWidth = Math.max(5, Number(lot.width ?? 12));
  const lotDepth = Math.max(10, Number(lot.depth ?? 30));
  const configuration = (concept.configuration ?? {}) as Record<string, unknown>;
  const floors = Math.max(1, Math.min(3, Math.round(Number(configuration.floors ?? 1))));
  const currentRooms = Array.isArray(concept.rooms) ? concept.rooms as Array<Record<string, unknown>> : [];
  const roomById = new Map(currentRooms.map((room) => [String(room.id ?? ""), room]));
  const clamp = (value: unknown, min: number, max: number, fallback: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  };

  const rawLayout = ai.layoutSuggestion && typeof ai.layoutSuggestion === "object"
    ? ai.layoutSuggestion as Record<string, unknown>
    : {};

  const roomPatches = (Array.isArray(rawLayout.roomPatches) ? rawLayout.roomPatches : [])
    .slice(0, 40)
    .flatMap((raw, index) => {
      if (!raw || typeof raw !== "object") return [];
      const patch = raw as Record<string, unknown>;
      const id = String(patch.id ?? "");
      const source = roomById.get(id);
      if (!source || source.locked === true) return [];
      const currentWidth = Math.max(0.8, Number(source.width ?? 2.5));
      const currentDepth = Math.max(0.8, Number(source.depth ?? 2.5));
      const width = clamp(patch.width, 0.8, lotWidth, currentWidth);
      const depth = clamp(patch.depth, 0.8, lotDepth, currentDepth);
      const x = clamp(patch.x, 0, Math.max(0, lotWidth - width), Number(source.x ?? 0));
      const y = clamp(patch.y, 0, Math.max(0, lotDepth - depth), Number(source.y ?? 0));
      return [{
        id,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        width: Math.round(width * 100) / 100,
        depth: Math.round(depth * 100) / 100,
        reason: typeof patch.reason === "string" ? patch.reason.slice(0, 240) : `Ajuste IA ${index + 1}`,
      }];
    });

  const existingWalls = Array.isArray(configuration.customWalls)
    ? configuration.customWalls as Array<Record<string, unknown>>
    : [];
  const existingWallIds = new Set(existingWalls.map((wall) => String(wall.id ?? "")).filter(Boolean));
  const wallSuggestions = (Array.isArray(rawLayout.wallSuggestions) ? rawLayout.wallSuggestions : [])
    .slice(0, 24)
    .flatMap((raw, index) => {
      if (!raw || typeof raw !== "object") return [];
      const wall = raw as Record<string, unknown>;
      let x1 = clamp(wall.x1, 0, lotWidth, 0);
      let y1 = clamp(wall.y1, 0, lotDepth, 0);
      let x2 = clamp(wall.x2, 0, lotWidth, x1);
      let y2 = clamp(wall.y2, 0, lotDepth, y1);
      if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) y2 = y1;
      else x2 = x1;
      const length = Math.hypot(x2 - x1, y2 - y1);
      if (length < 0.4) return [];
      const id = `ai-wall-${concept.id.slice(0, 8)}-${index + 1}`;
      existingWallIds.add(id);
      return [{
        id,
        floor: Math.round(clamp(wall.floor, 0, floors - 1, 0)),
        x1: Math.round(x1 * 100) / 100,
        y1: Math.round(y1 * 100) / 100,
        x2: Math.round(x2 * 100) / 100,
        y2: Math.round(y2 * 100) / 100,
        thickness: clamp(wall.thickness, 0.08, 0.35, 0.14),
        reason: typeof wall.reason === "string" ? wall.reason.slice(0, 240) : "Parede sugerida pela IA",
      }];
    });

  const openingSuggestions = (Array.isArray(rawLayout.openingSuggestions) ? rawLayout.openingSuggestions : [])
    .slice(0, 30)
    .flatMap((raw, index) => {
      if (!raw || typeof raw !== "object") return [];
      const opening = raw as Record<string, unknown>;
      const wallId = String(opening.wallId ?? "");
      if (!existingWallIds.has(wallId)) return [];
      const type = opening.type === "door" ? "door" : opening.type === "window" ? "window" : null;
      if (!type) return [];
      return [{
        id: `ai-opening-${concept.id.slice(0, 8)}-${index + 1}`,
        wallId,
        floor: Math.round(clamp(opening.floor, 0, floors - 1, 0)),
        type,
        offset: clamp(opening.offset, 0.08, 0.92, 0.5),
        width: clamp(opening.width, 0.5, type === "door" ? 2.4 : 4.5, type === "door" ? 0.9 : 1.4),
        height: clamp(opening.height, 0.6, 3.2, type === "door" ? 2.1 : 1.2),
        sillHeight: type === "door" ? 0 : clamp(opening.sillHeight, 0.2, 2.0, 0.9),
        openingStyle: opening.openingStyle === "fixed" || opening.openingStyle === "tilt_turn" || opening.openingStyle === "hinged"
          ? opening.openingStyle
          : "sliding",
        swing: opening.swing === "right" ? "right" : "left",
        reason: typeof opening.reason === "string" ? opening.reason.slice(0, 240) : "Abertura sugerida pela IA",
      }];
    });

  return { roomPatches, wallSuggestions, openingSuggestions };
}

// Rotas públicas (sem autenticação) — registradas antes do middleware authenticate no index.ts
const archPublicRouter: IRouter = Router();

function tenantId(req: Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccessTenant(req: Request, tid: string) {
  return isSuperAdmin(req) || tenantId(req) === tid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Arqdor Concept — drafts persistidos por usuário
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/concept-projects/latest", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [row] = await db
    .select()
    .from(archConceptProjectsTable)
    .where(
      and(
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )
    .orderBy(desc(archConceptProjectsTable.updatedAt))
    .limit(1);

  return res.json(row ?? null);
});

// Lista dos pré-projetos do usuário — antes só existia /latest, então cada usuário
// tinha na prática um único pré-projeto (sempre reabria o último).
router.get("/arch/concept-projects", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const rows = await db
    .select({
      id: archConceptProjectsTable.id,
      title: archConceptProjectsTable.title,
      status: archConceptProjectsTable.status,
      archProjetoId: archConceptProjectsTable.archProjetoId,
      customerProfile: archConceptProjectsTable.customerProfile,
      conceptRender: archConceptProjectsTable.conceptRender,
      lot: archConceptProjectsTable.lot,
      currentStep: archConceptProjectsTable.currentStep,
      configuration: archConceptProjectsTable.configuration,
      rooms: archConceptProjectsTable.rooms,
      createdAt: archConceptProjectsTable.createdAt,
      updatedAt: archConceptProjectsTable.updatedAt,
    })
    .from(archConceptProjectsTable)
    .where(
      and(
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )
    .orderBy(desc(archConceptProjectsTable.updatedAt))
    .limit(200);

  return res.json(rows.map((row) => {
    const customer = (row.customerProfile ?? {}) as { name?: string };
    const render = (row.conceptRender ?? {}) as { resultImageUrl?: string; history?: Array<{ resultImageUrl?: string }> };
    const history = Array.isArray(render.history) ? render.history : [];
    const configuration = (row.configuration ?? {}) as {
      projectScope?: "house" | "room";
      terrainDefined?: boolean;
      desiredArea?: number;
      floors?: number;
    };
    const rooms = Array.isArray(row.rooms) ? row.rooms : [];
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      sentToProfessional: Boolean(row.archProjetoId),
      customerName: typeof customer.name === "string" && customer.name.trim() ? customer.name.trim() : null,
      thumbnailUrl: render.resultImageUrl ?? history[history.length - 1]?.resultImageUrl ?? null,
      lot: row.lot,
      floors: typeof configuration.floors === "number" ? configuration.floors : null,
      roomCount: rooms.length,
      currentStep: row.currentStep,
      projectScope: configuration.projectScope ?? null,
      terrainDefined: Boolean(configuration.terrainDefined),
      desiredArea: typeof configuration.desiredArea === "number" ? configuration.desiredArea : null,
      floors: typeof configuration.floors === "number" ? configuration.floors : null,
      roomCount: rooms.length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }));
});

// Excluir rascunho. Pré-projeto já enviado ao profissional fica protegido, porque o
// Projeto Arqdor e o lead no CRM apontam pra ele.
router.delete("/arch/concept-projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [row] = await db
    .select({ id: archConceptProjectsTable.id, archProjetoId: archConceptProjectsTable.archProjetoId })
    .from(archConceptProjectsTable)
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )
    .limit(1);

  if (!row) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  if (row.archProjetoId) {
    return res.status(409).json({ error: "Este pré-projeto já foi enviado ao profissional e não pode ser excluído." });
  }

  await db
    .delete(archConceptProjectsTable)
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    );

  return res.json({ ok: true });
});

router.get("/arch/concept-projects/:id/export/ifc", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db
    .select()
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  try {
    const config = (concept.configuration ?? {}) as Record<string, unknown>;
    const ifc = buildConceptIfc({
      title: concept.title,
      floors: Number(config.floors ?? 1),
      rooms: Array.isArray(concept.rooms) ? concept.rooms as any[] : [],
      customWalls: Array.isArray(config.customWalls) ? config.customWalls as any[] : [],
      customOpenings: Array.isArray(config.customOpenings) ? config.customOpenings as any[] : [],
      wallMaterials: config.wallMaterials && typeof config.wallMaterials === "object"
        ? config.wallMaterials as Record<string, string>
        : {},
    });

    res.setHeader("Content-Type", "application/x-step; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${conceptIfcFilename(concept.title)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(ifc);
  } catch (error) {
    return res.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível exportar IFC.",
    });
  }
});

router.get("/arch/concept-projects/:id/export/dxf", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db
    .select()
    .from(archConceptProjectsTable)
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  const config = (concept.configuration ?? {}) as Record<string, unknown>;
  const dxf = buildConceptDxf({
    title: concept.title,
    rooms: Array.isArray(concept.rooms) ? concept.rooms as any[] : [],
    customWalls: Array.isArray(config.customWalls) ? config.customWalls as any[] : [],
    customOpenings: Array.isArray(config.customOpenings) ? config.customOpenings as any[] : [],
  });

  res.setHeader("Content-Type", "application/dxf; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${conceptDxfFilename(concept.title)}"`);
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).send(dxf);
});

router.post("/arch/concept-projects/:id/source-file/:sourceId/extract-geometry", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  const sourceId = String(req.params.sourceId);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db
    .select({
      id: archConceptProjectsTable.id,
      lot: archConceptProjectsTable.lot,
      configuration: archConceptProjectsTable.configuration,
    })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  const config = (concept.configuration ?? {}) as Record<string, unknown>;
  const sourceFiles = Array.isArray(config.sourceFiles)
    ? config.sourceFiles.filter((item) => item && typeof item === "object") as Array<Record<string, any>>
    : [];
  const source = sourceFiles.find((item) => String(item.id) === sourceId);
  if (!source) return res.status(404).json({ error: "Arquivo-fonte não encontrado." });
  if (String(source.extension).toLowerCase() !== "ifc") {
    return res.status(400).json({ error: "Somente arquivos IFC podem ser convertidos para geometria editável por esta rota." });
  }
  if (typeof source.storagePath !== "string" || !source.storagePath.startsWith("/objects/")) {
    return res.status(422).json({ error: "O arquivo IFC não possui caminho de storage válido." });
  }

  try {
    const storage = new ObjectStorageService();
    const file = await storage.getObjectEntityFile(source.storagePath);
    const [buffer] = await file.download();
    const geometry = parseIfcEditableGeometry(buffer.toString("utf8"));

    const lot = (concept.lot ?? {}) as { width?: number; depth?: number };
    const lotWidth = Number(lot.width ?? 0);
    const lotDepth = Number(lot.depth ?? 0);
    const fitsLot = Number.isFinite(lotWidth)
      && Number.isFinite(lotDepth)
      && geometry.bounds.width <= lotWidth + 0.01
      && geometry.bounds.depth <= lotDepth + 0.01;

    return res.json({
      ...geometry,
      fitsLot,
      lot: { width: lotWidth, depth: lotDepth },
      maxFloor: geometry.walls.reduce((max, wall) => Math.max(max, wall.floor), 0),
    });
  } catch (error) {
    return res.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível converter o IFC para geometria editável.",
    });
  }
});

router.post("/arch/concept-projects/:id/source-file/:sourceId/parse-ifc", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  const sourceId = String(req.params.sourceId);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db
    .select({
      id: archConceptProjectsTable.id,
      configuration: archConceptProjectsTable.configuration,
    })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  const config = (concept.configuration ?? {}) as Record<string, unknown>;
  const sourceFiles = Array.isArray(config.sourceFiles)
    ? config.sourceFiles.filter((item) => item && typeof item === "object") as Array<Record<string, any>>
    : [];
  const source = sourceFiles.find((item) => String(item.id) === sourceId);
  if (!source) return res.status(404).json({ error: "Arquivo-fonte não encontrado." });
  if (String(source.extension).toLowerCase() !== "ifc") {
    return res.status(400).json({ error: "Somente arquivos IFC podem ser lidos por este parser." });
  }
  if (typeof source.storagePath !== "string" || !source.storagePath.startsWith("/objects/")) {
    return res.status(422).json({ error: "O arquivo IFC não possui caminho de storage válido." });
  }

  try {
    const storage = new ObjectStorageService();
    const file = await storage.getObjectEntityFile(source.storagePath);
    const [buffer] = await file.download();
    const metadata = parseIfcMetadata(buffer.toString("utf8"));
    const parsedAt = new Date().toISOString();
    const updatedSource = {
      ...source,
      parserStatus: "parsed_metadata",
      parsedAt,
      ifcMetadata: metadata,
    };
    const nextSources = sourceFiles.map((item) => String(item.id) === sourceId ? updatedSource : item);

    await db
      .update(archConceptProjectsTable)
      .set({
        configuration: {
          ...config,
          sourceFiles: nextSources,
        } as any,
        updatedAt: new Date(),
      })
      .where(and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ));

    return res.json(updatedSource);
  } catch (error) {
    return res.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível interpretar o IFC.",
    });
  }
});

router.post("/arch/concept-projects/:id/source-file", authenticate, upload.single("file"), async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });
  if (!req.file?.buffer?.length) return res.status(400).json({ error: "Selecione um arquivo BIM/CAD." });

  const originalName = req.file.originalname || "arquivo-projeto";
  const extension = originalName.split(".").pop()?.toLowerCase() ?? "";
  const allowedExtensions = new Set(["ifc", "dwg", "rvt", "skp", "glb", "gltf"]);
  if (!allowedExtensions.has(extension)) {
    return res.status(415).json({ error: "Formato não suportado neste upload. Use IFC, DWG, RVT, SKP, GLB ou GLTF." });
  }
  if (extension === "glb" && req.file.buffer.subarray(0, 4).toString("ascii") !== "glTF") {
    return res.status(415).json({ error: "Arquivo GLB inválido. O cabeçalho binário glTF não foi encontrado." });
  }

  const [concept] = await db
    .select({
      id: archConceptProjectsTable.id,
      status: archConceptProjectsTable.status,
      lot: archConceptProjectsTable.lot,
      configuration: archConceptProjectsTable.configuration,
    })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  if (concept.status === "submitted" && (concept.configuration as any)?.projectMaster) {
    return res.status(409).json({
      error: "O Projeto Mestre está congelado. Crie uma revisão antes de anexar nova fonte BIM/CAD.",
      code: "PROJECT_MASTER_FROZEN",
    });
  }

  try {
    const storage = new ObjectStorageService();
    const storagePath = await storage.savePrivateBuffer(
      req.file.buffer,
      req.file.mimetype || "application/octet-stream",
      originalName,
    );
    const url = `/api/storage/objects${storagePath.replace(/^\/objects/, "")}`;
    const kind = extension === "ifc" || extension === "rvt"
      ? "bim"
      : extension === "glb" || extension === "gltf"
        ? "model3d"
        : "cad";
    const sourceFile = {
      id: crypto.randomUUID(),
      storagePath,
      url,
      originalName,
      mimeType: req.file.mimetype || "application/octet-stream",
      extension,
      kind,
      uploadedAt: new Date().toISOString(),
      status: extension === "glb" || extension === "gltf" ? "converted" : "stored_only",
      parserStatus: extension === "ifc"
        ? "pending_ifc_parser"
        : extension === "glb" || extension === "gltf"
          ? "ready_model3d"
          : "conversion_required",
      ...(extension === "glb" || extension === "gltf"
        ? {
            convertedAt: new Date().toISOString(),
            conversionEngine: "direct-upload",
            model3d: {
              storagePath,
              url,
              format: extension,
            },
          }
        : {}),
    };

    const currentConfig = (concept.configuration ?? {}) as Record<string, unknown>;
    const currentSources = Array.isArray(currentConfig.sourceFiles)
      ? currentConfig.sourceFiles.filter((item) => item && typeof item === "object")
      : [];

    await db
      .update(archConceptProjectsTable)
      .set({
        configuration: {
          ...currentConfig,
          sourceFiles: [...currentSources, sourceFile],
        } as any,
        updatedAt: new Date(),
      })
      .where(and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ));

    return res.status(201).json(sourceFile);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Não foi possível salvar o arquivo BIM/CAD.",
    });
  }
});

router.post("/arch/concept-projects/:id/reference-plan/trace", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db
    .select({
      id: archConceptProjectsTable.id,
      lot: archConceptProjectsTable.lot,
      configuration: archConceptProjectsTable.configuration,
    })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  const config = (concept.configuration ?? {}) as Record<string, unknown>;
  const referencePlan = config.referencePlan && typeof config.referencePlan === "object"
    ? config.referencePlan as Record<string, unknown>
    : null;
  if (!referencePlan || referencePlan.kind !== "image") {
    return res.status(422).json({ error: "Anexe uma imagem PNG/JPG/WebP como planta de referência antes de usar a leitura por IA." });
  }
  const storagePath = typeof referencePlan.storagePath === "string" ? referencePlan.storagePath : "";
  if (!storagePath.startsWith("/objects/")) {
    return res.status(422).json({ error: "A planta de referência não possui arquivo persistido válido." });
  }

  const photoAnalysis = referencePlan.photoAnalysis && typeof referencePlan.photoAnalysis === "object"
    ? referencePlan.photoAnalysis as Record<string, unknown>
    : null;
  const classifiedKind = String(photoAnalysis?.kind ?? "");
  const classifiedConfidence = Number(photoAnalysis?.confidence ?? 0);
  if (classifiedKind && classifiedKind !== "plan" && classifiedKind !== "unknown" && classifiedConfidence >= 0.55) {
    return res.status(422).json({
      error: "Esta imagem foi reconhecida como foto real, não como planta/croqui. Use a análise de cena do pré-projeto em vez de vetorizar como planta.",
      code: "REFERENCE_PHOTO_NOT_PLAN",
      photoAnalysis,
    });
  }

  try {
    const lot = (concept.lot ?? {}) as { width?: number; depth?: number };
    const bounds = {
      x: Number(referencePlan.offsetX ?? 0),
      y: Number(referencePlan.offsetY ?? 0),
      width: Number(referencePlan.widthMeters ?? lot.width ?? 0),
      depth: Number(referencePlan.depthMeters ?? lot.depth ?? 0),
    };
    if (![bounds.x, bounds.y, bounds.width, bounds.depth].every(Number.isFinite) || bounds.width <= 0 || bounds.depth <= 0) {
      return res.status(422).json({ error: "A planta de referência precisa de calibração válida antes da leitura por IA." });
    }

    const traceKey = [
      tid,
      id,
      storagePath,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.depth,
    ].join(":");
    const result = await runReferencePlanTraceSingleFlight(traceKey, async () => {
      const storage = new ObjectStorageService();
      const file = await storage.getObjectEntityFile(storagePath);
      const [buffer] = await file.download();
      return traceReferencePlanImage({
        tenantId: tid,
        buffer,
        mimeType: typeof referencePlan.mimeType === "string" ? referencePlan.mimeType : "image/jpeg",
        bounds,
      });
    });

    return res.json({
      ...result,
      bounds,
      canApply: result.walls.length > 0 && result.confidence >= 0.45,
    });
  } catch (error) {
    const safe = sanitizeAIError(error);
    return res.status(safe.status).json({ error: safe.message });
  }
});

router.post("/arch/concept-projects/:id/real-environment/analyze", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const requestedKind = String(req.body?.kind ?? "auto") as RealEnvironmentKind;
  const useMode = String(req.body?.useMode ?? "existing") as RealEnvironmentUseMode;
  const validKinds = new Set(["auto","terreno","cozinha","banheiro","sala","quarto","fachada","area_externa","piscina","escritorio","outro"]);
  const validModes = new Set(["existing","reference","modify"]);
  if (!validKinds.has(requestedKind) || !validModes.has(useMode)) {
    return res.status(400).json({ error: "Tipo de ambiente ou finalidade inválidos." });
  }

  const [concept] = await db.select({ configuration: archConceptProjectsTable.configuration })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);
  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  const config = (concept.configuration ?? {}) as Record<string, unknown>;
  const referencePlan = config.referencePlan && typeof config.referencePlan === "object"
    ? config.referencePlan as Record<string, unknown>
    : null;
  if (!referencePlan || referencePlan.kind !== "image") {
    return res.status(422).json({ error: "Envie uma foto antes de analisar o ambiente real." });
  }
  const storagePath = typeof referencePlan.storagePath === "string" ? referencePlan.storagePath : "";
  if (!storagePath.startsWith("/objects/")) {
    return res.status(422).json({ error: "A imagem não possui arquivo persistido válido." });
  }

  try {
    const storage = new ObjectStorageService();
    const file = await storage.getObjectEntityFile(storagePath);
    const [buffer] = await file.download();
    const analysis = await analyzeRealEnvironmentImage({
      tenantId: tid,
      buffer,
      mimeType: typeof referencePlan.mimeType === "string" ? referencePlan.mimeType : "image/jpeg",
      requestedKind,
      useMode,
    });
    const realEnvironment = { ...analysis, sourceImageUrl: referencePlan.url };
    await db.update(archConceptProjectsTable)
      .set({ configuration: { ...config, realEnvironment } as any, updatedAt: new Date() })
      .where(and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ));
    return res.json(realEnvironment);
  } catch (error) {
    const safe = sanitizeAIError(error);
    return res.status(safe.status).json({ error: safe.message });
  }
});

router.delete("/arch/concept-projects/:id/real-environment", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db.select({ configuration: archConceptProjectsTable.configuration })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);
  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  const config = { ...((concept.configuration ?? {}) as Record<string, unknown>) };
  delete config.realEnvironment;
  await db.update(archConceptProjectsTable)
    .set({ configuration: config as any, updatedAt: new Date() })
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ));
  return res.status(204).end();
});

router.patch("/arch/concept-projects/:id/real-environment/elements/:elementId", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  const elementId = String(req.params.elementId);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const action = String(req.body?.action ?? "") as RealEnvironmentAction;
  if (!new Set(["preserve","remove","replace","relocate","review"]).has(action)) {
    return res.status(400).json({ error: "Ação inválida." });
  }

  const [concept] = await db.select({ configuration: archConceptProjectsTable.configuration })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);
  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  const config = (concept.configuration ?? {}) as Record<string, unknown>;
  const env = (config.realEnvironment && typeof config.realEnvironment === "object"
    ? config.realEnvironment
    : null) as RealEnvironmentAnalysis | null;
  if (!env) return res.status(404).json({ error: "Ambiente real ainda não foi analisado." });
  if (!env.elements.some((item) => item.id === elementId)) {
    return res.status(404).json({ error: "Elemento não encontrado." });
  }

  const next = {
    ...env,
    elements: env.elements.map((item) => item.id === elementId ? { ...item, action, source: "user" as const } : item),
  };
  await db.update(archConceptProjectsTable)
    .set({ configuration: { ...config, realEnvironment: next } as any, updatedAt: new Date() })
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ));
  return res.json(next);
});

router.post("/arch/concept-projects/:id/reference-plan", authenticate, upload.single("file"), async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });
  if (!req.file?.buffer?.length) return res.status(400).json({ error: "Selecione uma imagem ou PDF da planta." });

  const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
  if (!allowedTypes.has(req.file.mimetype)) {
    return res.status(415).json({ error: "Formato não suportado. Use PNG, JPG, WebP ou PDF." });
  }

  const [concept] = await db
    .select({
      id: archConceptProjectsTable.id,
      status: archConceptProjectsTable.status,
      configuration: archConceptProjectsTable.configuration,
    })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  if (concept.status === "submitted" && (concept.configuration as any)?.projectMaster) {
    return res.status(409).json({
      error: "O Projeto Mestre está congelado. Crie uma revisão antes de trocar a planta de referência.",
      code: "PROJECT_MASTER_FROZEN",
    });
  }

  try {
    const storage = new ObjectStorageService();
    const storagePath = await storage.savePrivateBuffer(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname || "planta-referencia",
    );
    const url = `/api/storage/objects${storagePath.replace(/^\/objects/, "")}`;
    const kind = req.file.mimetype === "application/pdf" ? "pdf" : "image";
    const lot = (concept.lot ?? {}) as { width?: number; depth?: number };
    const lotWidth = Math.max(0.1, Number(lot.width ?? 12));
    const lotDepth = Math.max(0.1, Number(lot.depth ?? 30));

    let nativeWidth: number | null = null;
    let nativeHeight: number | null = null;
    let widthMeters = lotWidth;
    let depthMeters = lotDepth;
    let offsetX = 0;
    let offsetY = 0;
    let photoAnalysis: Awaited<ReturnType<typeof analyzeReferencePhoto>> | null = null;

    if (kind === "image") {
      const metadata = await sharp(req.file.buffer).metadata();
      nativeWidth = Number(metadata.width ?? 0) || null;
      nativeHeight = Number(metadata.height ?? 0) || null;
      if (nativeWidth && nativeHeight) {
        const fitted = fitReferenceImageToLot(nativeWidth, nativeHeight, lotWidth, lotDepth);
        widthMeters = fitted.widthMeters;
        depthMeters = fitted.depthMeters;
        offsetX = fitted.offsetX;
        offsetY = fitted.offsetY;
      }
      try {
        photoAnalysis = await analyzeReferencePhoto({
          tenantId: tid,
          buffer: req.file.buffer,
        });
      } catch {
        photoAnalysis = {
          kind: "unknown",
          confidence: 0,
          summary: "Imagem recebida. A classificação automática não ficou disponível; revise o tipo de referência antes de converter.",
          perspective: "unknown",
          needsScaleAnchor: true,
          detectedElements: [],
          preserveElements: [],
          removableElements: [],
          projectHints: [],
          sourceModel: "unavailable",
        };
      }
    }

    const referencePlan = {
      storagePath,
      url,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname || "planta-referencia",
      uploadedAt: new Date().toISOString(),
      kind,
      opacity: 0.35,
      fitMode: "calibrated",
      nativeWidth,
      nativeHeight,
      widthMeters,
      depthMeters,
      offsetX,
      offsetY,
      calibrationSource: kind === "image" ? "image_aspect_fit" : "lot",
      photoAnalysis: photoAnalysis ?? undefined,
    };

    const currentConfig = (concept.configuration ?? {}) as Record<string, unknown>;
    await db
      .update(archConceptProjectsTable)
      .set({
        configuration: {
          ...currentConfig,
          referencePlan,
        } as any,
        updatedAt: new Date(),
      })
      .where(and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ));

    return res.status(201).json(referencePlan);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Não foi possível salvar a planta de referência.",
    });
  }
});

router.post("/arch/concept-projects/:id/import/dxf", authenticate, upload.single("file"), async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });
  if (!req.file?.buffer?.length) return res.status(400).json({ error: "Selecione um arquivo DXF ASCII." });

  const [concept] = await db
    .select({ id: archConceptProjectsTable.id, lot: archConceptProjectsTable.lot })
    .from(archConceptProjectsTable)
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  try {
    const parsed = parseAsciiDxf(req.file.buffer.toString("utf8"));
    const lot = (concept.lot ?? {}) as { width?: number; depth?: number };
    const lotWidth = Number(lot.width ?? 0);
    const lotDepth = Number(lot.depth ?? 0);
    const fitsLot = Number.isFinite(lotWidth)
      && Number.isFinite(lotDepth)
      && parsed.bounds.width <= lotWidth + 0.01
      && parsed.bounds.depth <= lotDepth + 0.01;

    return res.json({
      ...parsed,
      fitsLot,
      lot: { width: lotWidth, depth: lotDepth },
      maxFloor: parsed.walls.reduce((max, wall) => Math.max(max, wall.floor), 0),
    });
  } catch (error) {
    return res.status(422).json({
      error: error instanceof Error ? error.message : "Não foi possível interpretar o DXF.",
    });
  }
});

router.get("/arch/concept-projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [row] = await db
    .select()
    .from(archConceptProjectsTable)
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )
    .limit(1);

  if (!row) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  return res.json(row);
});

router.post("/arch/concept-projects", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  // status e vínculo com o projeto só mudam pelo envio ao profissional, nunca pelo cliente.
  const { status: _ignoredStatus, archProjetoId: _ignoredProject, ...body } = (req.body ?? {}) as Record<string, unknown>;
  const parsed = insertArchConceptProjectSchema.safeParse({
    ...body,
    tenantId: tid,
    ownerUserId: userId,
  });

  if (!parsed.success) {
    return res.status(400).json({ error: "Dados do pré-projeto inválidos.", details: parsed.error.flatten() });
  }

  const creationKey =
    typeof (parsed.data.configuration as any)?.creationKey === "string"
      ? String((parsed.data.configuration as any).creationKey).trim()
      : "";

  if (creationKey) {
    const [existing] = await db
      .select()
      .from(archConceptProjectsTable)
      .where(and(
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
        sql`${archConceptProjectsTable.configuration}->>'creationKey' = ${creationKey}`,
      ))
      .limit(1);
    if (existing) return res.status(200).json(existing);
  }

  try {
    const [created] = await db
      .insert(archConceptProjectsTable)
      .values(parsed.data)
      .returning();
    return res.status(201).json(created);
  } catch (error) {
    // Corrida entre autosave/cliques/abas: o índice único garante um único rascunho.
    if (creationKey && (error as { code?: string })?.code === "23505") {
      const [existing] = await db
        .select()
        .from(archConceptProjectsTable)
        .where(and(
          eq(archConceptProjectsTable.tenantId, tid),
          eq(archConceptProjectsTable.ownerUserId, userId),
          sql`${archConceptProjectsTable.configuration}->>'creationKey' = ${creationKey}`,
        ))
        .limit(1);
      if (existing) return res.status(200).json(existing);
    }
    throw error;
  }
});

router.patch("/arch/concept-projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [currentConcept] = await db
    .select({ status: archConceptProjectsTable.status, configuration: archConceptProjectsTable.configuration })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!currentConcept) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  if (currentConcept.status === "submitted" && (currentConcept.configuration as any)?.projectMaster) {
    return res.status(409).json({
      error: "Este Projeto Mestre está congelado. Crie uma nova revisão do pré-projeto para alterar a geometria aprovada.",
      code: "PROJECT_MASTER_FROZEN",
    });
  }

  const parsed = updateArchConceptProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados do pré-projeto inválidos.", details: parsed.error.flatten() });
  }

  const { status: _status, archProjetoId: _archProjetoId, ...safeUpdates } = parsed.data as typeof parsed.data & {
    status?: unknown;
    archProjetoId?: unknown;
  };

  // O editor salva a configuração inteira a cada alteração e não conhece o link público do tour.
  // Sem isto, o primeiro salvamento depois de compartilhar apagava o token e o link parava de abrir.
  if (safeUpdates.configuration && typeof safeUpdates.configuration === "object") {
    const [current] = await db
      .select({ configuration: archConceptProjectsTable.configuration })
      .from(archConceptProjectsTable)
      .where(and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ))
      .limit(1);
    const currentConfig = (current?.configuration ?? {}) as Record<string, unknown>;
    const incoming = { ...(safeUpdates.configuration as Record<string, unknown>) };
    delete incoming.publicTourToken;
    delete incoming.publicTourEnabled;
    delete incoming.publicTourUpdatedAt;

    // Alguns dados são gravados por rotas especializadas (upload de planta, BIM/CAD e link público).
    // Um autosave do editor pode carregar um snapshot anterior e chegar depois do upload.
    // Nunca deixe esse autosave apagar dados server-owned que ele não enviou explicitamente.
    for (const key of ["publicTourToken", "publicTourEnabled", "publicTourUpdatedAt", "referencePlan"]) {
      if (!(key in incoming) && key in currentConfig) incoming[key] = currentConfig[key];
    }

    // sourceFiles é enviado pelo editor, mas pode estar defasado durante um upload em paralelo.
    // Mantemos o conjunto mais recente do servidor quando o cliente envia vazio/ausente e já há fontes salvas.
    const currentSources = Array.isArray(currentConfig.sourceFiles) ? currentConfig.sourceFiles : [];
    const incomingSources = Array.isArray(incoming.sourceFiles) ? incoming.sourceFiles : [];
    if (currentSources.length > 0 && incomingSources.length === 0) {
      incoming.sourceFiles = currentSources;
    }

    (safeUpdates as Record<string, unknown>).configuration = incoming;
  }

  const [updated] = await db
    .update(archConceptProjectsTable)
    .set({ ...safeUpdates, updatedAt: new Date() })
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )

  if (!updated) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  return res.json(updated);
});

router.post("/arch/concept-plan-specialist", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const parsed = specialistHousePlanSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Briefing arquitetônico inválido.", details: parsed.error.flatten() });
  }

  const input = parsed.data;
  const programErrors: string[] = [];
  const programWarnings: string[] = [];
  const roomProgram = input.brief.roomProgram ?? [];

  if (roomProgram.length) {
    const netRequestedArea = roomProgram
      .filter((item) => item.kind !== "piscina")
      .reduce((sum, item) => sum + item.quantity * item.targetArea, 0);
    const desiredArea = Number(input.brief.desiredAreaTotal);

    if (Number.isFinite(desiredArea) && netRequestedArea > desiredArea * 1.02) {
      programErrors.push(
        `Os ambientes solicitados somam ${Math.round(netRequestedArea)} m² úteis, acima da área total desejada de ${Math.round(desiredArea)} m².`,
      );
    } else if (Number.isFinite(desiredArea) && netRequestedArea * 1.14 > desiredArea * 1.12) {
      programWarnings.push(
        `O programa pode ultrapassar a meta de ${Math.round(desiredArea)} m² depois de paredes e circulação.`,
      );
    }

    const requestedSuites = roomProgram
      .filter((item) => item.kind === "suite" && item.required !== false)
      .reduce((sum, item) => sum + item.quantity, 0);
    const requestedSuiteBaths = roomProgram
      .filter((item) => item.kind === "banheiro" && /su[ií]te|master/i.test(item.label))
      .reduce((sum, item) => sum + item.quantity, 0);
    if (requestedSuites > requestedSuiteBaths) {
      programErrors.push(
        `O programa possui ${requestedSuites} suíte(s), mas apenas ${requestedSuiteBaths} banheiro(s) de suíte.`,
      );
    }

    for (const request of roomProgram) {
      const expanded = input.rooms.filter((room) => room.programRequestId === request.id);
      if (expanded.length !== request.quantity) {
        programErrors.push(
          `${request.label}: foram preparados ${expanded.length} ambiente(s), mas o briefing pede ${request.quantity}.`,
        );
      }
    }

    const requestIds = new Set(roomProgram.map((item) => item.id));
    const relationByPair = new Map<string, Set<string>>();
    for (const rule of input.brief.adjacencyRules ?? []) {
      if (!requestIds.has(rule.fromRequestId) || !requestIds.has(rule.toRequestId)) {
        programErrors.push("Existe uma relação entre ambientes que referencia um ambiente inexistente.");
        continue;
      }
      if (rule.fromRequestId === rule.toRequestId) {
        programErrors.push("Uma relação entre ambientes não pode usar o mesmo ambiente nos dois lados.");
        continue;
      }
      const pair = [rule.fromRequestId, rule.toRequestId].sort().join("::");
      const relations = relationByPair.get(pair) ?? new Set<string>();
      relations.add(rule.relation);
      relationByPair.set(pair, relations);
    }
    for (const relations of relationByPair.values()) {
      if (relations.has("away") && (relations.has("near") || relations.has("direct"))) {
        programErrors.push("O mesmo par de ambientes não pode estar configurado como próximo/conectado e afastado ao mesmo tempo.");
      }
    }
  }

  if (programErrors.length) {
    return res.status(422).json({
      error: "O programa de necessidades precisa ser ajustado antes de desenvolver a planta.",
      programValidation: {
        status: "blocked",
        errors: [...new Set(programErrors)],
        warnings: [...new Set(programWarnings)],
      },
    });
  }

  const program = input.rooms.map((room) => ({
    id: room.id,
    kind: room.kind,
    label: room.label,
    width: room.width,
    depth: room.depth,
    floor: room.floor,
    x: typeof room.x === "number" && Number.isFinite(room.x) ? room.x : 0,
    y: typeof room.y === "number" && Number.isFinite(room.y) ? room.y : 0,
    locked: Boolean(room.locked),
    targetArea: room.targetArea,
    targetWidth: room.targetWidth,
    targetDepth: room.targetDepth,
    programNotes: room.programNotes,
    required: room.required !== false,
    programRequestId: room.programRequestId,
    floorFlexible: Boolean(room.floorFlexible),
  }));

  const interventionGuidance: Record<typeof input.intervention, string> = {
    preservar: "Preserve ao máximo a organização atual. Corrija apenas incoerências funcionais, circulação, adjacências e dimensões problemáticas.",
    otimizar: "Mantenha o partido reconhecível, mas melhore circulação, ergonomia, adjacências, iluminação natural e eficiência construtiva.",
    valorizar: "Evolua a arquitetura de forma perceptível: fortaleça o partido, eixos visuais, integração interior-exterior, setorização, luz natural e identidade, sem abandonar o briefing.",
    assinatura: "Busque uma solução autoral e marcante, com partido arquitetônico claro e experiência espacial memorável, mantendo programa, lote, funcionalidade e construtibilidade como restrições absolutas.",
  };

  const strategyRepertoire = buildArchitecturalStrategyRepertoire({
    intervention: input.intervention,
    vision: input.vision ?? null,
  });
  const architecturalStrategy = buildArchitecturalProjectStrategy({
    lotWidth: input.lotWidth,
    lotDepth: input.lotDepth,
    floors: input.brief.floors,
    intervention: input.intervention,
    vision: input.vision ?? null,
    brief: {
      gourmet: input.brief.gourmet,
      pool: input.brief.pool,
      office: input.brief.office,
      integratedKitchen: input.brief.integratedKitchen,
      privateAwaySocial: input.brief.privateAwaySocial,
      garageSpaces: input.brief.garageSpaces,
    },
  });

  const basePrompt = `Você é o ARQDOR ARCHITECT AI, arquiteto residencial sênior especializado em casas brasileiras.

OBJETIVO:
Desenvolver UM ÚNICO PROJETO PRINCIPAL e refiná-lo. Não gere três alternativas. Não trate o problema como distribuição de retângulos.

MODO DE INTERVENÇÃO: ${input.intervention}
${interventionGuidance[input.intervention]}

Antes de propor coordenadas, pense internamente nesta ordem:
1. intenção do cliente e rotina;
2. partido arquitetônico;
3. implantação no lote e orientação solar;
4. setorização social / íntima / serviço;
5. grafo de adjacências obrigatórias e proibidas;
6. circulação e acessos;
7. mobiliário e ergonomia implícitos;
8. relação interior / jardim / gourmet / piscina;
9. coerência volumétrica e futura fachada;
10. crítica arquitetônica do próprio projeto;
11. refinamento antes da resposta.

LOTE: ${input.lotWidth} m x ${input.lotDepth} m.
BRIEFING OBJETIVO: ${JSON.stringify(input.brief)}
ÁREA CONSTRUÍDA DESEJADA: ${input.brief.desiredAreaTotal ?? "não informada"} m².
PROGRAMA DE NECESSIDADES DECLARADO PELO CLIENTE: ${JSON.stringify(input.brief.roomProgram ?? [])}
GRAFO DE RELAÇÕES ENTRE AMBIENTES: ${JSON.stringify(input.brief.adjacencyRules ?? [])}
VISÃO / DNA DO CLIENTE: ${JSON.stringify(input.vision ?? {})}
DIRETRIZES ESPACIAIS DERIVADAS DA ROTINA: ${JSON.stringify(specialistLifestyleDirectives(input))}
ESTRATÉGIA ARQUITETÔNICA OBRIGATÓRIA DEFINIDA ANTES DO DESENHO: ${JSON.stringify(architecturalStrategy)}

A planta deve materializar esta estratégia. Você pode ajustar coordenadas e dimensões para resolver o projeto, mas NÃO deve trocar silenciosamente o partido, a setorização, a lógica de circulação ou os não negociáveis definidos acima.

PROGRAMA FIXO DE AMBIENTES:
${JSON.stringify(program)}

REGRAS FUNCIONAIS INEGOCIÁVEIS:
- use TODOS os IDs fornecidos exatamente uma vez;
- mantenha o pavimento original quando floorFlexible=false;
- quando floorFlexible=true, você pode escolher o pavimento 0..${input.brief.floors - 1} para melhorar setorização, circulação e privacidade;
- nenhum ambiente pode ficar solto ou sem conexão física coerente;
- cumpra o GRAFO DE RELAÇÕES: direct = contato de parede suficiente para ligação/porta; near = mesmo pavimento e distância curta; away = separação física/privacidade ou outro pavimento;
- regras de relação com required=true são INEGOCIÁVEIS; regras required=false são preferências que devem ser maximizadas sem quebrar requisitos obrigatórios;
- não sobreponha ambientes e não ultrapasse o lote;
- suíte deve ter banheiro próprio adjacente e diretamente conectável;
- numeração de suítes e banheiros correspondentes deve ser respeitada;
- cozinha integrada deve tocar sala; cozinha deve manter relação eficiente com serviço e gourmet quando existentes;
- garagem deve acessar setor social/serviço, nunca diretamente quarto/suíte;
- área íntima deve evitar contato direto com garagem/gourmet quando privacidade for prioridade;
- escadas devem ser funcionais e alinhadas entre pavimentos;
- reduza corredores residuais, recortes gratuitos e perímetro construtivo sem propósito;
- considere dimensões reais de mobiliário, portas e circulação;
- quando targetWidth/targetDepth existirem, trate-os como preferência geométrica forte; ajuste somente se necessário para funcionalidade;
- use programNotes para entender o uso real do ambiente (ex.: cama king, ilha, mesa, vista, armazenamento), sem inventar funções não pedidas;
- trate targetArea de cada ambiente como META DE ÁREA: pode variar moderadamente para viabilizar a planta, mas não ignore nem reduza drasticamente sem motivo;
- respeite a área construída total desejada como alvo global; se a soma do programa tornar esse alvo impossível, priorize ambientes marcados required e registre a compensação no designRationale/notes;
- não invente closet, lavabo, despensa, varanda ou outro cômodo que não esteja no programa, salvo circulação técnica indispensável;
- áreas molhadas devem ser racionalizadas quando possível;
- preserve ambientes locked;
- a planta deve poder originar uma fachada coerente: aberturas, volumes e cobertura não podem depender de invenções posteriores.

REPERTÓRIO DE ESTRATÉGIAS ARQUITETÔNICAS:
${strategyRepertoire}

Use o repertório para pensar, não para copiar. Escolha poucas estratégias compatíveis e explique implicitamente sua aplicação no designRationale/architectureDNA.

CRITÉRIOS DE QUALIDADE:
- funcionalidade;
- circulação;
- privacidade;
- iluminação natural;
- integração interior-exterior;
- eficiência construtiva;
- força do partido arquitetônico;
- identidade não genérica;
- coerência futura entre planta, fachada e cobertura.

Responda SOMENTE JSON válido:
{
  "solution": {
    "id": "primary",
    "title": "Projeto principal",
    "description": "síntese curta da solução",
    "designRationale": "partido arquitetônico e decisões principais",
    "clientFitSummary": "como o projeto traduz a rotina e prioridades do cliente",
    "architectureStrategy": {
      "party": "partido aplicado",
      "zoningSummary": "como social, íntimo e serviço foram organizados",
      "circulationSummary": "como a circulação materializa a estratégia",
      "siteResponse": "como implantação, exterior e luz influenciaram a solução"
    },
    "architectureDNA": {
      "concept": "conceito central",
      "spatialStrategy": "estratégia espacial",
      "volumeStrategy": "direção volumétrica",
      "roofStrategy": "direção de cobertura",
      "materialIntent": "intenção material sem inventar produto específico"
    },
    "experienceStrategy": ["decisão espacial 1", "decisão espacial 2"],
    "daylightStrategy": ["decisão de iluminação natural 1"],
    "facadeDirection": ["regra de composição da fachada 1"],
    "selfCritique": ["problema identificado e corrigido 1"],
    "roomPatches": [
      { "id": "ID_EXISTENTE", "floor": 0, "x": 0, "y": 0, "width": 3.2, "depth": 3.0 }
    ],
    "notes": ["decisão técnica 1", "decisão técnica 2"]
  }
}

NÃO explique fora do JSON.
NÃO entregue alternativas.
NÃO aceite a primeira solução mental: critique e refine antes de responder.`;

  try {
    const rejectedFeedback: string[] = [];
    const evolutionHistory: Array<{
      pass: number;
      score: number;
      status: "approved" | "rejected";
      issues: string[];
      strengths: string[];
      basedOnPass: number | null;
    }> = [];
    let bestApproved: any = null;
    let evolutionarySeed: { pass: number; score: number; rooms: SpecialistPlanRoom[] } | null = null;

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const seedContext = evolutionarySeed
        ? `\n\nBASE GEOMÉTRICA DA MELHOR ITERAÇÃO ATÉ AGORA (PASSE ${evolutionarySeed.pass}, SCORE ${evolutionarySeed.score}/100):\n${JSON.stringify(evolutionarySeed.rooms.map((room) => ({
            id: room.id,
            floor: room.floor,
            x: room.x,
            y: room.y,
            width: room.width,
            depth: room.depth,
          })))}\nEVOLUA ESTA GEOMETRIA. Preserve o que funciona e altere somente o necessário para corrigir os problemas. NÃO recomece do zero e NÃO troque o partido arquitetônico.`
        : "";
      const retryContext = rejectedFeedback.length
        ? `\n\nCRÍTICA / VALIDAÇÃO DA ITERAÇÃO ANTERIOR — CORRIJA ESTES PONTOS SOBRE A BASE ACIMA:\n- ${rejectedFeedback.slice(-16).join("\n- ")}`
        : "";

      const evolutionaryInstruction = attempt > 1
        ? "\n\nREGRA EVOLUTIVA: trate esta rodada como uma revisão do mesmo projeto. Compare mentalmente com a base, mantenha relações, setores e ambientes já corretos e faça mudanças localizadas."
        : "";

      const architectCompletion = await createArchitectJsonCompletion({
        tenantId: tid,
        maxTokens: 7000,
        system: [
          "Você é o Arqdor Architect AI, arquiteto residencial sênior.",
          "Seu trabalho é desenvolver e refinar um único projeto principal.",
          "Faça internamente: intenção → partido → implantação → adjacências → circulação → luz → volumetria → crítica → refinamento.",
          "Priorize arquitetura funcional e interessante, nunca estética desconectada da planta.",
          "Responda somente JSON válido e compacto.",
        ].join(" "),
        user: basePrompt + seedContext + retryContext + evolutionaryInstruction,
      });

      const raw = architectCompletion.raw;

      if (architectCompletion.stopReason === "max_tokens") {
        rejectedFeedback.push("A resposta foi truncada; mantenha o JSON mais compacto.");
        continue;
      }

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        rejectedFeedback.push("A resposta não continha JSON válido.");
        continue;
      }

      let decoded: any;
      try {
        decoded = JSON.parse(jsonMatch[0]);
      } catch {
        rejectedFeedback.push("O JSON retornado estava inválido.");
        continue;
      }

      const plan = decoded?.solution;
      if (!plan || String(plan.id ?? "primary") !== "primary") {
        rejectedFeedback.push("A resposta não trouxe o projeto principal no formato esperado.");
        continue;
      }

      const sanitized = sanitizeSpecialistPlan({ ...plan, id: "primary" }, input);
      if (!sanitized) {
        rejectedFeedback.push("Programa incompleto: faltam ambientes, há IDs duplicados ou o programa não foi respeitado.");
        continue;
      }

      const candidateScore = Number(sanitized.quality?.score ?? 0);
      evolutionHistory.push({
        pass: attempt,
        score: candidateScore,
        status: sanitized.rejected ? "rejected" : "approved",
        issues: [...(sanitized.quality?.issues ?? [])].slice(0, 8),
        strengths: [...(sanitized.quality?.strengths ?? [])].slice(0, 6),
        basedOnPass: evolutionarySeed?.pass ?? null,
      });

      if (!evolutionarySeed || candidateScore > evolutionarySeed.score) {
        evolutionarySeed = {
          pass: attempt,
          score: candidateScore,
          rooms: sanitized.rooms,
        };
      }

      if (sanitized.rejected) {
        rejectedFeedback.push(...sanitized.quality.issues);
        continue;
      }

      const candidate = {
        id: "primary",
        title: String(plan.title ?? "Projeto principal"),
        description: String(plan.description ?? "Projeto principal refinado pela IA arquiteta."),
        clientFitSummary: String(plan.clientFitSummary ?? "").slice(0, 900),
        architectureStrategy: {
          ...architecturalStrategy,
          applied: plan.architectureStrategy && typeof plan.architectureStrategy === "object"
            ? plan.architectureStrategy
            : {},
        },
        architectureDNA: plan.architectureDNA && typeof plan.architectureDNA === "object" ? plan.architectureDNA : {},
        experienceStrategy: Array.isArray(plan.experienceStrategy) ? plan.experienceStrategy.map(String).slice(0, 8) : [],
        daylightStrategy: Array.isArray(plan.daylightStrategy) ? plan.daylightStrategy.map(String).slice(0, 8) : [],
        facadeDirection: Array.isArray(plan.facadeDirection) ? plan.facadeDirection.map(String).slice(0, 8) : [],
        selfCritique: Array.isArray(plan.selfCritique) ? plan.selfCritique.map(String).slice(0, 8) : [],
        intervention: input.intervention,
        refinementPass: attempt,
        evolution: {
          mode: "progressive_same_project",
          basedOnPass: evolutionHistory.find((entry) => entry.pass === attempt)?.basedOnPass ?? null,
          history: evolutionHistory,
        },
        ...sanitized,
      };

      if (!bestApproved || Number(candidate.architectureScore ?? 0) > Number(bestApproved.architectureScore ?? 0)) {
        bestApproved = candidate;
      }

      if (Number(candidate.architectureScore ?? 0) >= 82) break;

      rejectedFeedback.push(
        `Pontuação arquitetônica ${candidate.architectureScore}/100: refine circulação, adjacências, compactação e coerência do partido sem recomeçar do zero.`,
        ...(candidate.quality?.issues ?? []),
        ...(candidate.selfCritique ?? []).map((item: string) => `Autocrítica: ${item}`),
      );
    }

    if (!bestApproved) {
      return res.status(422).json({
        error: "A IA arquiteta não conseguiu aprovar o projeto principal após os ciclos automáticos de crítica e refinamento.",
        validationIssues: [...new Set(rejectedFeedback)].slice(-12),
      });
    }

    const finalArchitectureScore = Number(bestApproved.architectureScore ?? 0);
    if (finalArchitectureScore < 82) {
      return res.status(422).json({
        error: `A solução atingiu ${finalArchitectureScore}/100 e ainda não alcançou o padrão arquitetônico mínimo de 82/100.`,
        code: "ARQDOR_ARCHITECTURE_QUALITY_GATE",
        architectureScore: finalArchitectureScore,
        targetScore: 82,
        validationIssues: [
          ...(bestApproved.quality?.issues ?? []),
          ...(bestApproved.selfCritique ?? []).map((item: string) => `Autocrítica: ${item}`),
        ].slice(0, 12),
        evolutionHistory,
      });
    }

    return res.json({
      solution: bestApproved,
      alternatives: [bestApproved],
      architectAgent: {
        model: "provider-fallback-enabled",
        reasoning: "intent-party-adjacency-daylight-volume-critique-refine-v2",
        validation: "functional-adjacency-v2",
        targetScore: 82,
        intervention: input.intervention,
        refinementPasses: bestApproved.refinementPass,
        strategy: architecturalStrategy,
        evolutionMode: "progressive_same_project",
        evolutionHistory,
      },
      programCompliance: bestApproved.programCompliance ?? null,
      programValidation: {
        status: programWarnings.length ? "warning" : "ok",
        errors: [],
        warnings: [...new Set(programWarnings)],
      },
    });
  } catch (error) {
    const safe = sanitizeAIError(error);
    return res.status(safe.status).json({ error: safe.message });
  }
});

router.post("/arch/concept-projects/:id/facade-study", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const parsed = facadeStudySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Parâmetros do estudo de fachada inválidos.", details: parsed.error.flatten() });
  }

  const [concept] = await db
    .select()
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  if (concept.status === "submitted" && (concept.configuration as any)?.projectMaster && parsed.data.action === "develop") {
    return res.status(409).json({
      error: "O Projeto Mestre está congelado. Crie uma revisão antes de alterar a fachada.",
      code: "PROJECT_MASTER_FROZEN",
    });
  }

  const config = (concept.configuration ?? {}) as Record<string, unknown>;
  const rooms = Array.isArray(concept.rooms) ? concept.rooms : [];
  const openingOverrides = concept.openingOverrides ?? {};
  const currentFacade = parsed.data.facade ?? {};
  const currentDesign = parsed.data.facadeDesign ?? {};
  const action = parsed.data.action;
  const intervention = parsed.data.intervention;
  const projectBrief = (config.projectBrief ?? null) as Record<string, any> | null;
  const geometryContract = parsed.data.geometryContract ?? null;
  if (action === "develop" && !geometryContract) {
    return res.status(422).json({
      error: "A fachada só pode ser desenvolvida a partir da geometria canônica do Projeto Mestre. Reabra o editor e tente novamente.",
    });
  }
  const facadeIntervention = intervention === "marcante" ? "assinatura" : intervention === "moderada" ? "valorizar" : "preservar";
  const facadeRepertoire = buildArchitecturalStrategyRepertoire({
    intervention: facadeIntervention,
    vision: projectBrief?.vision ?? null,
  });

  const prompt = `Você é o Arqdor Facade Architect AI, arquiteto especialista em composição de fachadas residenciais brasileiras.

Sua tarefa NÃO é renderizar e NÃO é inventar outra casa.
Você deve trabalhar SOBRE O PROJETO ATUAL.

AÇÃO: ${action}
NÍVEL DE INTERVENÇÃO: ${intervention}

BRIEFING MESTRE / DNA DO CLIENTE:
${JSON.stringify(config.projectBrief ?? null)}

LOTE:
${JSON.stringify(concept.lot)}

AMBIENTES / GEOMETRIA DO PROJETO:
${JSON.stringify(rooms)}

ABERTURAS E AJUSTES EXISTENTES:
${JSON.stringify(openingOverrides)}

FACHADA ATUAL:
${JSON.stringify(currentFacade)}

DESIGN DE FACHADA ATUAL:
${JSON.stringify(currentDesign)}

CONTRATO GEOMÉTRICO CANÔNICO DA FACHADA / PROJETO MESTRE:
${JSON.stringify(geometryContract)}

REGRAS INEGOCIÁVEIS:
- o CONTRATO GEOMÉTRICO CANÔNICO é a fonte de verdade quando presente;
- preserve exatamente número de pavimentos, frente oficial, perímetro, largura dos pavimentos, posição da garagem, paredes, aberturas e cobertura descritos no contrato;
- não espelhe, rotacione, alargue, estreite, aumente ou reduza a edificação para melhorar estética;
- preserve a casa existente: número de pavimentos, implantação, posição geral da garagem, estrutura espacial e geometria principal;
- não mova ambientes internos para "melhorar" estética;
- não remova portas/janelas existentes;
- se recomendar ajuste de abertura, trate como recomendação e explique o motivo, nunca como alteração silenciosa;
- a solução deve nascer do DNA do cliente e da arquitetura atual;
- "leve" = materiais, cores, paisagismo e detalhes;
- "moderada" = pode propor painel, ripado, moldura, jardineira, marquise leve e pergolado APENAS como camadas não estruturais sobre a geometria existente;
- "marcante" = composição material mais autoral, porém sem transformar o projeto em outra casa nem criar novo volume estrutural;
- a IA automática NÃO pode criar box, wall, garage, balcony, gate ou portal que altere silhueta/perímetro. Esses elementos só podem existir se já estiverem no projeto/editor ou mediante edição explícita do usuário;
- não altere o tipo de cobertura automaticamente; mudanças de cobertura devem ser recomendação separada para aprovação;
- cobertura deve continuar tecnicamente compatível com a volumetria;
- evite excesso de elementos decorativos e fachadas genéricas;
- priorize hierarquia de entrada, proporção, ritmo, cheios/vazios, materialidade, proteção solar e coerência com a planta;
- não empilhe elementos "contemporâneos" sem função. Portal, ripado, pergolado, moldura e volume deslocado só entram quando reforçam uma decisão espacial, climática ou de hierarquia.

REPERTÓRIO PARA A FACHADA — estratégias, não templates:
${facadeRepertoire}

DIREÇÃO JÁ DEFINIDA NO DNA DO PROJETO:
${JSON.stringify(projectBrief?.architectureDNA ?? null)}
${JSON.stringify(projectBrief?.facadeDirection ?? null)}

A fachada deve dar continuidade ao DNA acima sempre que ele existir.

Se ACTION=diagnose, foque no diagnóstico e deixe as sugestões estruturadas.
Se ACTION=develop, entregue também uma proposta aplicável ao editor.

Retorne SOMENTE JSON válido:
{
  "diagnosis": {
    "score": 0,
    "summary": "...",
    "strengths": ["..."],
    "issues": ["..."],
    "opportunities": ["..."]
  },
  "concept": {
    "title": "...",
    "architecturalDirection": "...",
    "entryStrategy": "...",
    "roofStrategy": "...",
    "materialStrategy": "...",
    "landscapeStrategy": "...",
    "whyItFitsClient": "..."
  },
  "facadeSuggestion": {
    "style": "contemporaneo|minimalista|classico_contemporaneo|tropical|industrial|rustico_contemporaneo",
    "roof": "platibanda|aparente|misto",
    "primaryMaterial": "pintura|madeira|pedra|concreto",
    "accentMaterial": "nenhum|madeira|pedra|concreto",
    "facadeTone": "claro|medio|escuro",
    "frameTone": "preto|branco|bronze",
    "landscaping": "leve|medio|intenso"
  },
  "designSuggestion": {
    "surfaceMaterials": {
      "main": "paint-offwhite|paint-greige|concrete-light|concrete-dark|wood-natural|wood-dark|stone-sand|stone-graphite|brick-light|metal-black",
      "accent": "...",
      "garage": "...",
      "entrance": "...",
      "paving": "...",
      "frames": "..."
    },
    "volumes": [
      {
        "kind": "box|portal|canopy|panel|slats|pergola|planter|frame|garage|balcony|wall|gate",
        "label": "...",
        "x": 0,
        "y": 0,
        "width": 20,
        "height": 30,
        "depth": 0.5,
        "materialId": "paint-offwhite"
      }
    ]
  },
  "openingRecommendations": [
    { "type": "window|door", "recommendation": "...", "reason": "...", "requiresClientApproval": true }
  ],
  "warnings": ["..."]
}`;

  try {
    const architectCompletion = await createArchitectJsonCompletion({
      tenantId: tid,
      maxTokens: 3200,
      system: "Você é um arquiteto de fachadas. Responda somente JSON válido, sem markdown.",
      user: prompt,
    });
    const raw = architectCompletion.raw;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (architectCompletion.stopReason === "max_tokens") {
      return res.status(422).json({ error: "O estudo de fachada ficou longo demais e veio incompleto. Tente novamente." });
    }
    if (!jsonMatch) return res.status(422).json({ error: "A IA não retornou um estudo de fachada válido." });

    // Resposta cortada ou JSON inválido vira aviso claro (422), não erro 500.
    let ai: Record<string, any>;
    try {
      ai = JSON.parse(jsonMatch[0]) as Record<string, any>;
    } catch {
      return res.status(422).json({ error: "A IA devolveu um estudo de fachada incompleto. Tente novamente." });
    }
    const allowedKinds = new Set(["canopy","panel","slats","pergola","planter","frame"]);
    const allowedMaterials = new Set(["paint-offwhite","paint-greige","concrete-light","concrete-dark","wood-natural","wood-dark","stone-sand","stone-graphite","brick-light","metal-black"]);

    const rawVolumes = Array.isArray(ai.designSuggestion?.volumes) ? ai.designSuggestion.volumes : [];
    const volumes = rawVolumes.slice(0, 12).flatMap((volume: any, index: number) => {
      if (!allowedKinds.has(String(volume?.kind)) || !allowedMaterials.has(String(volume?.materialId))) return [];
      const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, parsed));
      };
      return [{
        id: `ai-facade-${id.slice(0, 8)}-${index + 1}`,
        kind: String(volume.kind),
        label: String(volume.label ?? "Elemento de fachada").slice(0, 80),
        x: clampNumber(volume.x, 0, 96, 36),
        y: clampNumber(volume.y, 0, 96, 28),
        width: clampNumber(volume.width, 4, 100, 20),
        height: clampNumber(volume.height, 4, 100, 30),
        depth: clampNumber(volume.depth, 0, 3, 0.5),
        materialId: String(volume.materialId),
        opacity: 1,
      }];
    });

    const surfaceMaterials = ai.designSuggestion?.surfaceMaterials && typeof ai.designSuggestion.surfaceMaterials === "object"
      ? Object.fromEntries(
          Object.entries(ai.designSuggestion.surfaceMaterials)
            .filter(([, value]) => allowedMaterials.has(String(value)))
            .map(([key, value]) => [key, String(value)])
        )
      : {};

    const facadeSuggestion = action === "develop" && ai.facadeSuggestion && typeof ai.facadeSuggestion === "object"
      ? {
          ...ai.facadeSuggestion,
          roof: geometryContract?.roof ?? String(currentFacade.roof ?? "platibanda"),
        }
      : null;

    return res.json({
      mode: action,
      intervention,
      diagnosis: ai.diagnosis ?? null,
      concept: ai.concept ?? null,
      facadeSuggestion,
      designSuggestion: action === "develop" ? { surfaceMaterials, volumes } : null,
      openingRecommendations: Array.isArray(ai.openingRecommendations) ? ai.openingRecommendations.slice(0, 8) : [],
      warnings: Array.isArray(ai.warnings) ? ai.warnings.slice(0, 10) : [],
      geometryLocked: Boolean(geometryContract),
      geometryContractVersion: geometryContract?.version ?? null,
      geometryContract: geometryContract ? {
        version: geometryContract.version,
        frontSide: geometryContract.frontSide,
        roof: geometryContract.roof,
        wallCount: geometryContract.walls.length,
        openingCount: geometryContract.openings.length,
        roomFootprintCount: geometryContract.roomFootprints.length,
        derivedFacade: geometryContract.derivedFacade,
      } : null,
    });
  } catch (error) {
    const safe = sanitizeAIError(error);
    return res.status(safe.status).json({ error: safe.message });
  }
});

router.post("/arch/concept-projects/:id/develop-with-ai", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const parsed = developConceptWithAiSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "Parâmetros de desenvolvimento inválidos.",
      details: parsed.error.flatten(),
    });
  }

  const [concept] = await db
    .select()
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  const geometryHealth = conceptGeometryHealth(concept);
  const rooms = Array.isArray(concept.rooms) ? concept.rooms : [];
  const config = (concept.configuration ?? {}) as Record<string, unknown>;
  const facade = (concept.facadePreferences ?? {}) as Record<string, unknown>;
  const requestedStyle = parsed.data.style ?? String(facade.style ?? "contemporaneo");
  const projectBrief = (config.projectBrief ?? null) as Record<string, any> | null;
  const developmentRepertoire = buildArchitecturalStrategyRepertoire({
    intervention: parsed.data.mode === "preservacao_maxima" ? "preservar" : parsed.data.mode === "automatico" ? "valorizar" : "otimizar",
    vision: projectBrief?.vision ?? null,
  });

  const projectScope = config.projectScope === "room" ? "room" : "house";
  const terrainDefined = config.terrainDefined === true;
  const customWalls = Array.isArray(config.customWalls) ? config.customWalls : [];
  const customOpenings = Array.isArray(config.customOpenings) ? config.customOpenings : [];

  // ARQ-PLANTA-001: IA não pode inventar uma planta a partir de um projeto vazio.
  // O ponto de partida deve ser um programa/briefing aprovado ou geometria real já existente.
  if (!projectBrief && rooms.length === 0 && customWalls.length === 0 && customOpenings.length === 0) {
    return res.status(409).json({
      error: "Defina o briefing/programa de necessidades antes de desenvolver a planta com IA.",
      code: "ARCH_BRIEF_REQUIRED",
    });
  }

  const scopeDirective = projectScope === "room"
    ? `ESCOPO: UM AMBIENTE / INTERIORES.
- Trabalhe somente no espaço interior solicitado.
- Não exigir terreno, implantação, garagem, fachada, paisagismo ou volumetria externa.
- Priorize circulação, ergonomia, mobiliário, aberturas, iluminação, pontos técnicos e materiais.
- Não transforme o ambiente em uma casa completa.`
    : `ESCOPO: CASA COMPLETA.
- Terreno real definido: ${terrainDefined ? "sim" : "não"}.
- Se o terreno não estiver definido, trate as dimensões do workspace apenas como limites técnicos de edição; não faça conclusões de implantação, recuos ou orientação do lote.
- Não invente garagem, piscina, pavimentos ou elementos externos ausentes do briefing.`;

  const prompt = `Você é o Copiloto de Desenvolvimento Arquitetônico do Arqdor.
Analise o projeto brasileiro abaixo e proponha SOMENTE ajustes compatíveis com a geometria existente.
NUNCA invente outro projeto, nunca troque o número de pavimentos e nunca crie aberturas sem justificativa.

${scopeDirective}

Modo: ${parsed.data.mode}
Preservar layout: ${parsed.data.preserveLayout ? "sim" : "não"}
Estilo desejado: ${requestedStyle}
${terrainDefined ? `Terreno real: ${JSON.stringify(concept.lot)}` : `Workspace técnico: ${JSON.stringify(config.workspaceBounds ?? concept.lot)}`}
Configuração: ${JSON.stringify(config)}
BRIEFING MESTRE / DNA DO PROJETO: ${JSON.stringify(config.projectBrief ?? null)}
Ambientes: ${JSON.stringify(rooms)}

O BRIEFING MESTRE é a intenção principal do cliente e deve continuar orientando qualquer desenvolvimento posterior.
O usuário pode editar medidas, paredes, portas, janelas, implantação, fachada, materiais e telhado; essas edições refinam o projeto, mas não devem apagar silenciosamente desejos, prioridades, restrições e necessidades futuras registradas no briefing.
Se uma alteração entrar em conflito com o briefing, preserve a alteração explícita do usuário e sinalize o conflito em geometryWarnings/notes em vez de reinterpretar o projeto inteiro.
Preferências atuais de fachada: ${JSON.stringify(facade)}
Saúde geométrica preliminar: ${JSON.stringify(geometryHealth)}

Retorne APENAS JSON válido:
{
  "layoutSuggestion": {
    "roomPatches": [
      { "id": "ID_DE_UM_AMBIENTE_EXISTENTE", "x": 1.0, "y": 2.0, "width": 4.0, "depth": 3.5, "reason": "motivo" }
    ],
    "wallSuggestions": [
      { "floor": 0, "x1": 1.0, "y1": 1.0, "x2": 5.0, "y2": 1.0, "thickness": 0.14, "reason": "motivo" }
    ],
    "openingSuggestions": [
      { "wallId": "ID_DE_PAREDE_EXISTENTE_OU_SUGERIDA", "floor": 0, "type": "window", "offset": 0.5, "width": 1.6, "height": 1.2, "sillHeight": 0.9, "openingStyle": "sliding", "reason": "motivo" }
    ]
  },
  "facadeSuggestion": {
    "style": "contemporaneo|minimalista|classico_contemporaneo|tropical|industrial|rustico_contemporaneo",
    "roof": "platibanda|aparente|misto",
    "primaryMaterial": "pintura|madeira|pedra|concreto",
    "accentMaterial": "nenhum|madeira|pedra|concreto",
    "facadeTone": "claro|medio|escuro",
    "frameTone": "preto|branco|bronze",
    "landscaping": "leve|medio|intenso"
  },
  "notes": ["..."],
  "geometryWarnings": ["..."]
}

REGRAS DE GEOMETRIA:
- roomPatches só pode usar IDs de ambientes existentes.
- Não alterar ambientes locked.
- Não mudar o pavimento de um ambiente.
- Manter tudo dentro do lote.
- wallSuggestions devem ser ortogonais e só devem existir quando realmente melhorarem o fechamento/circulação.
- openingSuggestions só devem apontar para uma parede existente ou sugerida.
- Preserve escada e circulação salvo erro claro de projeto.
${projectScope === "house" ? "- Preserve garagem apenas quando ela existir ou estiver explicitamente exigida pelo briefing." : "- Em ambiente, não criar garagem, fachada, terreno ou elementos externos."}

REPERTÓRIO DE APOIO:
${developmentRepertoire}

DNA ARQUITETÔNICO JÁ DEFINIDO:
${JSON.stringify(projectBrief?.architectureDNA ?? null)}
${JSON.stringify(projectBrief?.experienceStrategy ?? null)}
${JSON.stringify(projectBrief?.daylightStrategy ?? null)}
${JSON.stringify(projectBrief?.facadeDirection ?? null)}

Não substitua esse DNA por uma solução aleatória. Evolua o mesmo projeto e sinalize conflitos.`;

  try {
    const architectCompletion = await createArchitectJsonCompletion({
      tenantId: tid,
      maxTokens: 1500,
      system: "Responda somente com JSON válido, sem markdown e sem texto fora do JSON.",
      user: prompt,
    });
    const raw = architectCompletion.raw;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(422).json({ error: "IA não retornou JSON válido." });
    const ai = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const layoutSuggestion = normalizeAiLayoutSuggestion(ai, {
      id: concept.id,
      lot: concept.lot,
      rooms: concept.rooms,
      configuration: concept.configuration,
    });

    return res.json({
      geometryHealth,
      layoutSuggestion,
      facadeSuggestion: projectScope === "room" ? null : ai.facadeSuggestion ?? null,
      notes: Array.isArray(ai.notes) ? ai.notes : [],
      geometryWarnings: Array.isArray(ai.geometryWarnings) ? ai.geometryWarnings : [],
    });
  } catch (error) {
    const safe = sanitizeAIError(error);
    return res.status(safe.status).json({ error: safe.message });
  }
});

router.post("/arch/concept-projects/:id/share-tour", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db
    .select()
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  const currentConfig = (concept.configuration ?? {}) as Record<string, unknown>;
  const existingToken = typeof currentConfig.publicTourToken === "string"
    && /^[a-zA-Z0-9-]{20,80}$/.test(currentConfig.publicTourToken)
      ? currentConfig.publicTourToken
      : null;
  const token = existingToken ?? crypto.randomUUID().replace(/-/g, "");

  const nextConfig = {
    ...currentConfig,
    publicTourToken: token,
    publicTourEnabled: true,
    publicTourUpdatedAt: new Date().toISOString(),
  };

  await db
    .update(archConceptProjectsTable)
    .set({ configuration: nextConfig as any, updatedAt: new Date() })
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ));

  return res.json({
    token,
    path: `/tour/arqdor/${token}`,
    enabled: true,
  });
});

router.post("/arch/concept-projects/:id/share-tour/disable", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db
    .select({ configuration: archConceptProjectsTable.configuration })
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  await db
    .update(archConceptProjectsTable)
    .set({
      configuration: {
        ...((concept.configuration ?? {}) as Record<string, unknown>),
        publicTourEnabled: false,
        publicTourUpdatedAt: new Date().toISOString(),
      } as any,
      updatedAt: new Date(),
    })
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ));

  return res.json({ enabled: false });
});

// Público, somente leitura. Não retorna cliente, orçamento, tenant, lead, deal ou proprietário.
archPublicRouter.get("/arch/public-tour/:token", async (req, res) => {
  const token = String(req.params.token ?? "");
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(token)) {
    return res.status(404).json({ error: "Tour não encontrado." });
  }

  const [concept] = await db
    .select({
      id: archConceptProjectsTable.id,
      title: archConceptProjectsTable.title,
      lot: archConceptProjectsTable.lot,
      configuration: archConceptProjectsTable.configuration,
      rooms: archConceptProjectsTable.rooms,
      openingOverrides: archConceptProjectsTable.openingOverrides,
      facadePreferences: archConceptProjectsTable.facadePreferences,
      conceptRender: archConceptProjectsTable.conceptRender,
      primaryImageUrl: sql<string | null>`(SELECT result_image_url FROM arch_ai_renders
        WHERE tenant_id = ${archConceptProjectsTable.tenantId}
          AND concept_project_id = ${archConceptProjectsTable.id}
          AND is_primary = true AND status = 'concluido' LIMIT 1)`,
      updatedAt: archConceptProjectsTable.updatedAt,
    })
    .from(archConceptProjectsTable)
    .where(and(
      sql`${archConceptProjectsTable.configuration}->>'publicTourToken' = ${token}`,
      sql`coalesce((${archConceptProjectsTable.configuration}->>'publicTourEnabled')::boolean, false) = true`,
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Tour não encontrado ou compartilhamento desativado." });

  const configuration = (concept.configuration ?? {}) as Record<string, unknown>;
  const {
    publicTourToken: _token,
    publicTourEnabled: _enabled,
    publicTourUpdatedAt: _updated,
    ...safeConfiguration
  } = configuration;

  // O título pode trazer o nome do cliente ("Pré-projeto — Ana"); o tour é público.
  const publicTitle = typeof concept.title === "string" && /^pré-projeto\s*[—-]/i.test(concept.title) ? "Pré-projeto" : concept.title;

  return res.json({
    id: concept.id,
    title: publicTitle,
    lot: concept.lot,
    configuration: safeConfiguration,
    rooms: concept.rooms,
    openingOverrides: concept.openingOverrides,
    facadePreferences: concept.facadePreferences,
    coverImageUrl: concept.primaryImageUrl ?? (() => {
      const render = (concept.conceptRender ?? {}) as Record<string, unknown>;
      const direct = typeof render.resultImageUrl === "string" ? render.resultImageUrl : "";
      if (direct) return direct;
      const history = Array.isArray(render.history) ? render.history : [];
      for (let index = history.length - 1; index >= 0; index -= 1) {
        const item = history[index] as Record<string, unknown>;
        if (typeof item?.resultImageUrl === "string" && item.resultImageUrl) return item.resultImageUrl;
      }
      return null;
    })(),
    updatedAt: concept.updatedAt,
  });
});

router.post("/arch/concept-projects/:id/promote", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`arqdor-concept-promote:${tid}:${id}`}))`);

  const [concept] = await tx
    .select()
    .from(archConceptProjectsTable)
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    )
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });

  const config = (concept.configuration ?? {}) as any;
  const isRevision = Boolean(config.revisionOfConceptId);
  let linkedProject: any = null;

  if (concept.archProjetoId) {
    const [existingProject] = await tx
      .select()
      .from(archProjetosTable)
      .where(
        and(
          eq(archProjetosTable.id, concept.archProjetoId),
          eq(archProjetosTable.tenantId, tid),
        ),
      )
      .limit(1);

    if (existingProject && (!isRevision || config.projectMaster)) {
      return res.json({
        ok: true,
        alreadyPromoted: true,
        project: existingProject,
        leadId: existingProject.leadId,
        dealId: existingProject.dealId,
        projectMaster: ((concept.configuration ?? {}) as any).projectMaster ?? null,
      });
    }
    if (existingProject) linkedProject = existingProject;
  }
  const lot = (concept.lot ?? {}) as { width?: number; depth?: number };
  const sitePlacement = (config.sitePlacement ?? {}) as any;
  const masterAcceptance = evaluateProjectMasterAcceptance({
    rooms: Array.isArray(concept.rooms) ? concept.rooms : [],
    lotWidth: Math.max(1, Number(lot.width ?? 0)),
    lotDepth: Math.max(1, Number(lot.depth ?? 0)),
    floors: Math.max(1, Number(config.floors ?? 1)),
    site: {
      frontSide: sitePlacement.frontSide,
      setbackFront: sitePlacement.setbackFront,
    },
  });
  if (masterAcceptance.status === "blocked") {
    return res.status(422).json({
      error: "O pré-projeto ainda possui inconsistências arquitetônicas bloqueantes e não pode ser congelado como Projeto Mestre.",
      code: "PROJECT_MASTER_NOT_READY",
      acceptance: masterAcceptance,
    });
  }
  const facade = (concept.facadePreferences ?? {}) as Record<string, string>;
  const customer = (concept.customerProfile ?? {}) as {
    instagram?: string;
    name?: string;
    phone?: string;
    email?: string;
    budgetRange?: string;
    timeframe?: string;
    notes?: string;
  };
  const rooms = Array.isArray(concept.rooms) ? concept.rooms : [];
  const roomSummary = rooms
    .map((room: any) => {
      const area = Number(room.width ?? 0) * Number(room.depth ?? 0);
      return `${room.label ?? room.kind ?? "Ambiente"} (${area.toFixed(1)} m²)`;
    })
    .join(", ");

  let leadId: string | null = linkedProject?.leadId ?? null;
  let dealId: string | null = linkedProject?.dealId ?? null;

  const hasCustomerName = Boolean(customer.name?.trim());
  const hasCustomerContact = Boolean(customer.phone?.trim() || customer.email?.trim());
  if (!hasCustomerName || !hasCustomerContact) {
    return res.status(400).json({
      error: "Informe nome e pelo menos um contato (telefone ou e-mail) antes de enviar ao profissional.",
    });
  }

  // Bootstrap idempotente: o primeiro Pré-Projeto já garante insumos e
  // composições padrão do tenant. Preços continuam sendo responsabilidade da
  // Tabela Mestre; aqui criamos apenas estrutura, coeficientes e vínculos.
  await ensureStandardConstructionCatalog(tid);

  if (customer.name?.trim()) {
    if (customer.email?.trim()) {
      const [byEmail] = await tx
        .select()
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.tenantId, tid),
            eq(leadsTable.email, customer.email.trim()),
          ),
        )
        .limit(1);
      if (byEmail) leadId = byEmail.id;
    }

    if (!leadId) {
      const match = await findLeadByDedup(
        tid,
        customer.phone?.trim() || null,
        null,
        customer.name.trim(),
      );
      if (match.found) leadId = match.lead.id;
    }

    if (!leadId) {
      const assignedTo = await pickNextVendedor(tid, {});
      const [lead] = await tx
        .insert(leadsTable)
        .values({
          tenantId: tid,
          nome: customer.name.trim(),
          telefone: storePhone(customer.phone?.trim() || null),
          email: customer.email?.trim() || null,
          instagramHandle: customer.instagram?.trim().replace(/^@+/, "") || null,
          source: "arqdor_concept",
          objetivo: "Projeto residencial",
          orcamento: customer.budgetRange?.trim() || null,
          urgencia: customer.timeframe?.trim() || null,
          notasNutricao: customer.notes?.trim() || null,
          assignedTo,
          metadata: {
            arqdorConceptId: concept.id,
            desiredArea: config.desiredArea ?? null,
            floors: config.floors ?? null,
            facadeStyle: facade.style ?? null,
          },
        })
        .returning();
      leadId = lead?.id ?? null;
    }

    if (leadId) {
      const [existingDeal] = await tx
        .select()
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tid), eq(dealsTable.leadId, leadId)))
        .orderBy(desc(dealsTable.updatedAt))
        .limit(1);

      if (existingDeal) {
        dealId = existingDeal.id;
      } else {
        const [lead] = await tx
          .select({ assignedTo: leadsTable.assignedTo })
          .from(leadsTable)
          .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tid)))
          .limit(1);

        const [deal] = await tx
          .insert(dealsTable)
          .values({
            tenantId: tid,
            leadId,
            titulo: `Projeto residencial — ${customer.name.trim()}`,
            etapa: "em_aquecimento",
            assignedTo: lead?.assignedTo ?? null,
          })
          .returning();
        dealId = deal?.id ?? null;
      }
    }
  }

  const description = [
    "Pré-projeto originado no Arqdor Concept.",
    `Terreno: ${lot.width ?? "—"} × ${lot.depth ?? "—"} m.`,
    `Pavimentos: ${config.floors ?? "—"}.`,
    `Área desejada: ${config.desiredArea ?? "—"} m².`,
    roomSummary ? `Ambientes: ${roomSummary}.` : null,
    facade.style ? `Estilo: ${facade.style}.` : null,
    facade.roof ? `Cobertura: ${facade.roof}.` : null,
    facade.primaryMaterial ? `Material principal: ${facade.primaryMaterial}.` : null,
    facade.accentMaterial ? `Destaque: ${facade.accentMaterial}.` : null,
    customer.budgetRange ? `Faixa de investimento informada: ${customer.budgetRange}.` : null,
    customer.timeframe ? `Prazo desejado: ${customer.timeframe}.` : null,
    customer.notes ? `Observações do cliente: ${customer.notes}.` : null,
  ].filter(Boolean).join("\n");

  let project: any = linkedProject;
  if (project) {
    const [updatedProject] = await tx
      .update(archProjetosTable)
      .set({
        leadId,
        dealId,
        clienteNome: customer.name?.trim() || null,
        clienteEmail: customer.email?.trim() || null,
        clienteTelefone: customer.phone?.trim() || null,
        titulo: concept.title || project.titulo,
        descricao: description,
        areaM2: config.desiredArea != null ? String(config.desiredArea) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(archProjetosTable.id, project.id), eq(archProjetosTable.tenantId, tid)))
      .returning();
    project = updatedProject ?? project;
  } else {
    const [createdProject] = await tx
      .insert(archProjetosTable)
      .values({
        tenantId: tid,
        leadId,
        dealId,
        clienteNome: customer.name?.trim() || null,
        clienteEmail: customer.email?.trim() || null,
        clienteTelefone: customer.phone?.trim() || null,
        titulo: concept.title || "Projeto originado do Arqdor Concept",
        descricao: description,
        status: "briefing",
        pipelineStage: "briefing",
        tipoObra: "Residencial",
        areaM2: config.desiredArea != null ? String(config.desiredArea) : null,
        portalToken: crypto.randomUUID(),
        portalAtivo: false,
      })
      .returning();
    project = createdProject;
  }

  // O Concept passa a alimentar a mesma Obra/Orçamento/Cronograma usada pelo
  // restante do Vendor.ai. Os preços ficam zerados nesta fase: o pré-projeto
  // fornece quantitativos preliminares, enquanto tabela de preços/composições
  // continua sendo a fonte canônica de custo.
  const desiredArea = Math.max(1, Number(config.desiredArea ?? 1));
  const floors = Math.max(1, Number(config.floors ?? 1));
  const conceptConfiguration = (concept.configuration ?? {}) as any;
  const customWalls = Array.isArray(conceptConfiguration.customWalls) ? conceptConfiguration.customWalls : [];
  const customOpenings = Array.isArray(conceptConfiguration.customOpenings) ? conceptConfiguration.customOpenings : [];
  const conceptObjects = Array.isArray(conceptConfiguration.objects) ? conceptConfiguration.objects : [];
  const technicalKinds = new Set([
    "outlet", "switch", "light_point", "water_point", "drain_point", "shower_point", "faucet_point",
  ]);
  const technicalObjects = conceptObjects.filter((object: any) => technicalKinds.has(String(object?.kind ?? "")));
  const technicalCounts = technicalObjects.reduce((acc: Record<string, number>, object: any) => {
    const kind = String(object?.kind ?? "");
    acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {});
  const indoorRooms = rooms.filter((room: any) => String(room.kind ?? "").toLowerCase() !== "piscina");
  const hasPool = rooms.some((room: any) => String(room.kind ?? "").toLowerCase() === "piscina");
  const hasGarage = rooms.some((room: any) => String(room.kind ?? "").toLowerCase() === "garagem");
  const WALL_HEIGHT_M = 2.8;

  const roomArea = (room: any) => Math.max(0, Number(room.width ?? 0)) * Math.max(0, Number(room.depth ?? 0));
  const measuredFloorArea = indoorRooms.reduce((sum: number, room: any) => sum + roomArea(room), 0);
  const effectiveArea = measuredFloorArea > 0 ? measuredFloorArea : desiredArea;
  const areaByFloor = new Map<number, number>();
  for (const room of indoorRooms) {
    const floor = Math.max(0, Number(room.floor ?? 0));
    areaByFloor.set(floor, (areaByFloor.get(floor) ?? 0) + roomArea(room));
  }
  const groundFloorArea = Math.max(1, areaByFloor.get(0) ?? effectiveArea / floors);
  const topFloorArea = Math.max(1, areaByFloor.get(Math.max(0, floors - 1)) ?? effectiveArea / floors);
  const roofFactor = facade.roof === "aparente" ? 1.15 : facade.roof === "misto" ? 1.1 : 1.04;
  const roofArea = topFloorArea * roofFactor;

  const coordKey = (value: unknown) => Math.round(Number(value ?? 0) * 100);
  const edgeKey = (x1: unknown, y1: unknown, x2: unknown, y2: unknown, floor: unknown) => {
    const a = [coordKey(x1), coordKey(y1)];
    const b = [coordKey(x2), coordKey(y2)];
    const ordered = a[0]! < b[0]! || (a[0] === b[0] && a[1]! <= b[1]!) ? [a, b] : [b, a];
    return `${Number(floor ?? 0)}:${ordered[0]![0]}:${ordered[0]![1]}:${ordered[1]![0]}:${ordered[1]![1]}`;
  };
  const segmentLength = (x1: unknown, y1: unknown, x2: unknown, y2: unknown) =>
    Math.hypot(Number(x2 ?? 0) - Number(x1 ?? 0), Number(y2 ?? 0) - Number(y1 ?? 0));

  const wallMap = new Map<string, { length: number; owners: number }>();
  for (const room of indoorRooms) {
    const x = Number(room.x ?? 0);
    const y = Number(room.y ?? 0);
    const width = Math.max(0, Number(room.width ?? 0));
    const depth = Math.max(0, Number(room.depth ?? 0));
    const floor = Number(room.floor ?? 0);
    const edges = [
      [x, y, x + width, y],
      [x + width, y, x + width, y + depth],
      [x, y + depth, x + width, y + depth],
      [x, y, x, y + depth],
    ];
    for (const [x1, y1, x2, y2] of edges) {
      const key = edgeKey(x1, y1, x2, y2, floor);
      const current = wallMap.get(key);
      if (current) current.owners += 1;
      else wallMap.set(key, { length: segmentLength(x1, y1, x2, y2), owners: 1 });
    }
  }

  let exteriorWallLength = 0;
  let internalWallLength = 0;
  for (const wall of wallMap.values()) {
    if (wall.owners > 1) internalWallLength += wall.length;
    else exteriorWallLength += wall.length;
  }
  for (const wall of customWalls) {
    const key = edgeKey(wall.x1, wall.y1, wall.x2, wall.y2, wall.floor ?? 0);
    if (!wallMap.has(key)) internalWallLength += segmentLength(wall.x1, wall.y1, wall.x2, wall.y2);
  }
  const totalWallLength = exteriorWallLength + internalWallLength;

  const overlap = (a1: number, a2: number, b1: number, b2: number) =>
    Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  const nearly = (a: number, b: number) => Math.abs(a - b) <= 0.05;
  let derivedDoors = 0;
  for (let i = 0; i < indoorRooms.length; i++) {
    const a: any = indoorRooms[i];
    for (let j = i + 1; j < indoorRooms.length; j++) {
      const b: any = indoorRooms[j];
      if (Number(a.floor ?? 0) !== Number(b.floor ?? 0)) continue;
      const ax = Number(a.x ?? 0), ay = Number(a.y ?? 0), aw = Number(a.width ?? 0), ad = Number(a.depth ?? 0);
      const bx = Number(b.x ?? 0), by = Number(b.y ?? 0), bw = Number(b.width ?? 0), bd = Number(b.depth ?? 0);
      const verticalTouch =
        (nearly(ax + aw, bx) || nearly(bx + bw, ax)) &&
        overlap(ay, ay + ad, by, by + bd) >= 0.8;
      const horizontalTouch =
        (nearly(ay + ad, by) || nearly(by + bd, ay)) &&
        overlap(ax, ax + aw, bx, bx + bw) >= 0.8;
      if (verticalTouch || horizontalTouch) derivedDoors += 1;
    }
  }
  const windowKinds = new Set(["sala", "cozinha", "suite", "quarto", "gourmet", "outro"]);
  const derivedWindows = indoorRooms.filter((room: any) => windowKinds.has(String(room.kind ?? "").toLowerCase())).length;
  const customDoorCount = customOpenings.filter((opening: any) => opening?.type === "door").length;
  const customWindowCount = customOpenings.filter((opening: any) => opening?.type === "window").length;
  const linkedCustomOpenings = customOpenings.filter((opening: any) =>
    (opening?.type === "door" || opening?.type === "window")
    && typeof opening?.catalogProductId === "string"
    && opening.catalogProductId.trim().length > 0
  );
  const linkedDoorCount = linkedCustomOpenings.filter((opening: any) => opening.type === "door").length;
  const linkedWindowCount = linkedCustomOpenings.filter((opening: any) => opening.type === "window").length;
  const unlinkedDoorCount = customDoorCount > 0 ? Math.max(0, customDoorCount - linkedDoorCount) : derivedDoors;
  const unlinkedWindowCount = customWindowCount > 0 ? Math.max(0, customWindowCount - linkedWindowCount) : derivedWindows;
  const doorCount = customDoorCount > 0 ? customDoorCount : derivedDoors;
  const windowCount = customWindowCount > 0 ? customWindowCount : derivedWindows;
  const openingCount = Math.max(1, doorCount + windowCount);

  const linkedOpeningProductIds = [...new Set(
    linkedCustomOpenings.map((opening: any) => String(opening.catalogProductId))
  )];
  const linkedOpeningCatalogRows = linkedOpeningProductIds.length
    ? await tx
        .select({
          id: produtosCatalogoTable.id,
          nome: produtosCatalogoTable.nome,
          fornecedor: produtosCatalogoTable.fornecedor,
          marca: produtosCatalogoTable.marca,
          precoBase: produtosCatalogoTable.precoBase,
          unidade: produtosCatalogoTable.unidade,
          ativo: produtosCatalogoTable.ativo,
        })
        .from(produtosCatalogoTable)
        .where(and(
          eq(produtosCatalogoTable.tenantId, tid),
          inArray(produtosCatalogoTable.id, linkedOpeningProductIds),
        ))
    : [];
  const linkedOpeningCatalogById = new Map(linkedOpeningCatalogRows.map((row) => [row.id, row]));
  const linkedOpeningGroups = new Map<string, {
    catalogProductId: string;
    type: "door" | "window";
    quantity: number;
    width: number;
    height: number;
    manufacturer: string | null;
    profile: string | null;
    glass: string | null;
  }>();
  for (const opening of linkedCustomOpenings) {
    const catalogProductId = String(opening.catalogProductId);
    const key = catalogProductId;
    const existing = linkedOpeningGroups.get(key);
    if (existing) {
      existing.quantity += 1;
      continue;
    }
    linkedOpeningGroups.set(key, {
      catalogProductId,
      type: opening.type === "door" ? "door" : "window",
      quantity: 1,
      width: Math.max(0.4, Number(opening.width ?? (opening.type === "door" ? 0.9 : 1.2))),
      height: Math.max(0.4, Number(opening.height ?? (opening.type === "door" ? 2.1 : 1.2))),
      manufacturer: typeof opening.manufacturer === "string" && opening.manufacturer.trim() ? opening.manufacturer.trim() : null,
      profile: typeof opening.frameProfile === "string" && opening.frameProfile.trim() ? opening.frameProfile.trim() : null,
      glass: typeof opening.glassType === "string" && opening.glassType.trim() ? opening.glassType.trim() : null,
    });
  }

  const customOpeningArea = customOpenings.reduce((sum: number, opening: any) => {
    const width = Math.max(0.4, Number(opening?.width ?? (opening?.type === "door" ? 0.9 : 1.2)));
    const height = Math.max(0.4, Number(opening?.height ?? (opening?.type === "door" ? 2.1 : 1.2)));
    return sum + width * height;
  }, 0);
  const defaultOpeningArea =
    (customDoorCount > 0 ? 0 : derivedDoors * 0.9 * 2.1)
    + (customWindowCount > 0 ? 0 : derivedWindows * 1.2 * 1.2);
  const openingArea = customOpeningArea + defaultOpeningArea;
  const exteriorWallAreaGross = exteriorWallLength * WALL_HEIGHT_M;
  const internalWallFaceArea = internalWallLength * WALL_HEIGHT_M * 2;
  const exteriorWallAreaNet = Math.max(0, exteriorWallAreaGross - openingArea);
  const paintArea = internalWallFaceArea + exteriorWallAreaNet;

  const wetKinds = new Set(["banheiro", "cozinha", "lavanderia"]);
  const wetFloorArea = indoorRooms
    .filter((room: any) => wetKinds.has(String(room.kind ?? "").toLowerCase()))
    .reduce((sum: number, room: any) => sum + roomArea(room), 0);

  const floorMaterialAreas = new Map<string, number>();
  for (const room of indoorRooms) {
    const material = String(room.floorMaterialId ?? "").trim();
    if (!material) continue;
    floorMaterialAreas.set(material, (floorMaterialAreas.get(material) ?? 0) + roomArea(room));
  }

  type ConceptQuantityItem = {
    stage: string;
    item: string;
    unit: string;
    quantity: number;
    basis: "geometry" | "concept";
    compositionCode?: string;
    catalogProductId?: string;
    manufacturer?: string;
  };
  const quantityItems: ConceptQuantityItem[] = [
    { stage: "Projeto", item: "Desenvolvimento e compatibilização do projeto", unit: "un", quantity: 1, basis: "concept" },
    { stage: "Serviços preliminares", item: "Implantação e preparação do canteiro", unit: "m²", quantity: groundFloorArea, basis: "geometry" },
    { stage: "Fundação", item: "Fundação — área de implantação medida", unit: "m²", quantity: groundFloorArea, basis: "geometry" },
    { stage: "Estrutura e vedações", item: "Paredes — comprimento total medido", unit: "m", quantity: totalWallLength, basis: "geometry" },
    { stage: "Estrutura e vedações", item: "Paredes externas — área bruta", unit: "m²", quantity: exteriorWallAreaGross, basis: "geometry" },
    { stage: "Cobertura", item: `Cobertura — ${facade.roof ?? "conforme projeto"}`, unit: "m²", quantity: roofArea, basis: "geometry" },
    ...(unlinkedDoorCount > 0 ? [{ stage: "Esquadrias", item: "Portas sem produto especificado", unit: "un", quantity: unlinkedDoorCount, basis: "geometry" as const }] : []),
    ...(unlinkedWindowCount > 0 ? [{ stage: "Esquadrias", item: "Janelas sem produto especificado", unit: "un", quantity: unlinkedWindowCount, basis: "geometry" as const }] : []),
    ...[...linkedOpeningGroups.values()].map((group) => {
      const product = linkedOpeningCatalogById.get(group.catalogProductId);
      const manufacturer = product?.fornecedor ?? product?.marca ?? group.manufacturer;
      const kindLabel = group.type === "door" ? "Porta" : "Janela";
      const dimensions = `${group.width.toFixed(2)} × ${group.height.toFixed(2)} m`;
      return {
        stage: "Esquadrias",
        item: [kindLabel, product?.nome ?? group.catalogProductId, manufacturer, dimensions].filter(Boolean).join(" · "),
        unit: product?.unidade || "un",
        quantity: group.quantity,
        basis: "geometry" as const,
      };
    }),
    ...(technicalCounts.outlet ? [{ stage: "Instalações elétricas e hidráulicas", item: "Tomadas lançadas na planta", unit: "un", quantity: technicalCounts.outlet, basis: "geometry" as const, compositionCode: "ARQ-ELE-002" }] : []),
    ...(technicalCounts.switch ? [{ stage: "Instalações elétricas e hidráulicas", item: "Interruptores lançados na planta", unit: "un", quantity: technicalCounts.switch, basis: "geometry" as const, compositionCode: "ARQ-ELE-004" }] : []),
    ...(technicalCounts.light_point ? [{ stage: "Instalações elétricas e hidráulicas", item: "Pontos de luz / plafon lançados na planta", unit: "un", quantity: technicalCounts.light_point, basis: "geometry" as const, compositionCode: "ARQ-ELE-001" }] : []),
    ...(technicalCounts.water_point ? [{ stage: "Instalações elétricas e hidráulicas", item: "Pontos de água lançados na planta", unit: "un", quantity: technicalCounts.water_point, basis: "geometry" as const, compositionCode: "ARQ-HID-001" }] : []),
    ...(technicalCounts.drain_point ? [{ stage: "Instalações elétricas e hidráulicas", item: "Pontos de esgoto lançados na planta", unit: "un", quantity: technicalCounts.drain_point, basis: "geometry" as const, compositionCode: "ARQ-HID-003" }] : []),
    ...(technicalCounts.shower_point ? [{ stage: "Instalações elétricas e hidráulicas", item: "Pontos de chuveiro lançados na planta", unit: "un", quantity: technicalCounts.shower_point, basis: "geometry" as const, compositionCode: "ARQ-HID-004" }] : []),
    ...(technicalCounts.faucet_point ? [{ stage: "Instalações elétricas e hidráulicas", item: "Pontos de torneira lançados na planta", unit: "un", quantity: technicalCounts.faucet_point, basis: "geometry" as const, compositionCode: "ARQ-HID-005" }] : []),
    { stage: "Revestimentos", item: "Revestimento de piso — área interna medida", unit: "m²", quantity: effectiveArea, basis: "geometry", compositionCode: "ARQ-REV-001" },
    ...(wetFloorArea > 0 ? [{ stage: "Revestimentos", item: "Áreas molhadas — piso medido", unit: "m²", quantity: wetFloorArea, basis: "geometry" as const }] : []),
    { stage: "Forros", item: "Forro — área interna medida", unit: "m²", quantity: effectiveArea, basis: "geometry", compositionCode: "ARQ-FOR-004" },
    { stage: "Pintura", item: "Paredes — área líquida preliminar para pintura", unit: "m²", quantity: paintArea, basis: "geometry", compositionCode: "ARQ-FOR-002" },
    { stage: "Fachada e externos", item: `Fachada ${facade.style ?? "conforme conceito"} — área externa líquida`, unit: "m²", quantity: exteriorWallAreaNet, basis: "geometry", compositionCode: "ARQ-FOR-003" },
    ...(hasGarage ? [{ stage: "Garagem, calçadas e acessos", item: "Garagem — área desenhada", unit: "m²", quantity: rooms.filter((room: any) => String(room.kind ?? "").toLowerCase() === "garagem").reduce((sum: number, room: any) => sum + roomArea(room), 0), basis: "geometry" as const }] : []),
    ...(hasPool ? [{ stage: "Piscina e área externa", item: "Piscina — área desenhada", unit: "m²", quantity: rooms.filter((room: any) => String(room.kind ?? "").toLowerCase() === "piscina").reduce((sum: number, room: any) => sum + roomArea(room), 0), basis: "geometry" as const }] : []),
  ];

  for (const [materialId, area] of floorMaterialAreas) {
    quantityItems.push({
      stage: "Revestimentos",
      item: `Piso especificado — ${materialId}`,
      unit: "m²",
      quantity: area,
      basis: "geometry",
    });
  }

  const configuredCatalogObjects = (Array.isArray(conceptConfiguration.objects) ? conceptConfiguration.objects : [])
    .filter((object: any) => object && typeof object === "object" && typeof object.catalogProductId === "string")
    .map((object: any) => {
      const selections = object.materialSelections && typeof object.materialSelections === "object"
        ? Object.entries(object.materialSelections as Record<string, any>).map(([surface, selection]) => ({
            surface,
            materialId: String(selection?.materialId ?? ""),
            materialName: String(selection?.materialName ?? ""),
            grupo: typeof selection?.grupo === "string" ? selection.grupo : null,
            priceDelta: Number(selection?.priceDelta ?? 0) || 0,
          }))
        : [];
      const basePrice = Number(object.price ?? 0) || 0;
      const configuredPrice = Number(object.configuredPrice ?? basePrice) || basePrice;
      return {
        id: String(object.id ?? ""),
        kind: String(object.kind ?? ""),
        catalogProductId: String(object.catalogProductId),
        label: String(object.label ?? "Produto do projeto"),
        supplier: typeof object.supplier === "string" ? object.supplier : null,
        basePrice,
        configuredPrice,
        selections,
      };
    });

  const configuredCatalogObjectGroups = new Map<string, {
    kind: string;
    catalogProductId: string;
    label: string;
    supplier: string | null;
    configuredPrice: number;
    selections: Array<{ surface: string; materialId: string; materialName: string; grupo: string | null; priceDelta: number }>;
    quantity: number;
  }>();
  for (const product of configuredCatalogObjects) {
    const selectionKey = JSON.stringify(
      [...product.selections]
        .sort((a, b) => a.surface.localeCompare(b.surface))
        .map((selection) => [selection.surface, selection.materialId, selection.grupo, selection.priceDelta]),
    );
    const key = `${product.catalogProductId}::${product.configuredPrice}::${selectionKey}`;
    const existing = configuredCatalogObjectGroups.get(key);
    if (existing) {
      existing.quantity += 1;
      continue;
    }
    configuredCatalogObjectGroups.set(key, {
      kind: product.kind,
      catalogProductId: product.catalogProductId,
      label: product.label,
      supplier: product.supplier,
      configuredPrice: product.configuredPrice,
      selections: product.selections,
      quantity: 1,
    });
  }

  const objectStage = (kind: string) => {
    if (kind === "appliance") return "Eletrodomésticos";
    if (kind === "sanitary") return "Louças e metais";
    if (kind === "lamp" || kind === "light_point") return "Iluminação";
    if (kind === "outdoor") return "Área externa";
    return "Mobiliário e decoração";
  };

  for (const group of configuredCatalogObjectGroups.values()) {
    quantityItems.push({
      stage: objectStage(group.kind),
      item: [group.label, group.supplier].filter(Boolean).join(" · "),
      unit: "un",
      quantity: group.quantity,
      basis: "geometry",
      catalogProductId: group.catalogProductId,
      manufacturer: group.supplier ?? undefined,
    });
  }

  let obra: any = null;
  let obraId = String(project?.obraId ?? "");
  let createdNewObra = false;

  if (obraId) {
    const [existingObra] = await tx
      .select()
      .from(obrasTable)
      .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, tid)))
      .limit(1);
    obra = existingObra ?? null;
  }

  if (!obra) {
    obraId = crypto.randomUUID();
    const [createdObra] = await tx
      .insert(obrasTable)
      .values({
        id: obraId,
        tenantId: tid,
        nome: project.titulo,
        descricao: `[ARQDOR:${project.id}] Obra criada automaticamente a partir do pré-projeto ${concept.id}.`,
        clienteNome: customer.name?.trim() || null,
        clienteContato: customer.phone?.trim() || customer.email?.trim() || null,
        status: "planejamento",
        orcamentoTotal: "0",
        custoRealizado: "0",
      })
      .returning();
    obra = createdObra;
    createdNewObra = true;
  }

  if (createdNewObra) {
  const executionStages = [
    { nome: "Projeto", days: 10 },
    { nome: "Serviços preliminares", days: 5 },
    { nome: "Fundação", days: Math.max(7, Math.ceil(groundFloorArea / 18)) },
    { nome: "Estrutura e vedações", days: Math.max(12, Math.ceil(totalWallLength / 10)) },
    { nome: "Cobertura", days: Math.max(5, Math.ceil(roofArea / 25)) },
    { nome: "Esquadrias", days: Math.max(4, Math.ceil(openingCount / 3)) },
    { nome: "Instalações elétricas e hidráulicas", days: Math.max(8, Math.ceil(effectiveArea / 20)) },
    { nome: "Revestimentos", days: Math.max(8, Math.ceil(effectiveArea / 18)) },
    { nome: "Forros", days: Math.max(4, Math.ceil(effectiveArea / 30)) },
    { nome: "Pintura", days: Math.max(6, Math.ceil(paintArea / 65)) },
    { nome: "Pisos", days: Math.max(6, Math.ceil(effectiveArea / 25)) },
    { nome: "Louças, metais e acabamentos", days: 5 },
    ...(hasGarage ? [{ nome: "Garagem, calçadas e acessos", days: 5 }] : []),
    ...(hasPool ? [{ nome: "Piscina e área externa", days: 10 }] : []),
    { nome: "Fachada e externos", days: Math.max(5, Math.ceil(exteriorWallAreaNet / 40)) },
    { nome: "Limpeza, testes e entrega", days: 4 },
  ];

  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const toIso = (date: Date) => date.toISOString().slice(0, 10);
  const addDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  };

  const scheduleRows: any[] = [];
  let cursor = today;
  for (let index = 0; index < executionStages.length; index++) {
    const stage = executionStages[index]!;
    const start = cursor;
    const end = addDays(start, Math.max(1, stage.days) - 1);
    const [row] = await tx
      .insert(obraEtapasTable)
      .values({
        obraId,
        nome: stage.nome,
        descricao: "Etapa preliminar gerada automaticamente pelo Arqdor Concept.",
        ordem: index + 1,
        dataInicioPrevista: toIso(start),
        dataFimPrevista: toIso(end),
        status: "pendente",
        percentualExecutado: "0",
        custoPrevisto: "0",
        pesoFisico: String(100 / executionStages.length),
        marco: false,
      })
      .returning();
    scheduleRows.push(row);
    cursor = addDays(end, 1);
  }

  for (let index = 1; index < scheduleRows.length; index++) {
    await tx.insert(obraEtapaDependenciasTable).values({
      tenantId: tid,
      obraId,
      etapaId: scheduleRows[index]!.id,
      dependeDeEtapaId: scheduleRows[index - 1]!.id,
      tipo: "FS",
      defasagemDias: 0,
    });
  }
  }

  const preBudgetId = crypto.randomUUID();
  const budgetVersion = Math.max(1, Number(config.revisionNumber ?? 1));
  await tx.execute(sql`
    INSERT INTO arch_budgets (
      id, tenant_id, project_id, title, client_name, status, version,
      subtotal_material, subtotal_labor, subtotal, discount_type,
      discount_value, discount_total, grand_total, notes, created_at, updated_at
    ) VALUES (
      ${preBudgetId}, ${tid}, ${project.id}, ${`Orçamento preliminar — Arqdor Concept v${budgetVersion}`},
      ${customer.name?.trim() || null}, 'draft', ${budgetVersion},
      0, 0, 0, 'fixed', 0, 0, 0,
      'Quantitativos preliminares gerados automaticamente do pré-projeto. Preços devem ser resolvidos pelas composições/tabela de preços.',
      now(), now()
    )
  `);

  for (let index = 0; index < quantityItems.length; index++) {
    const item = quantityItems[index]!;
    const itemId = crypto.randomUUID();
    const quantity = Number(Math.max(0, item.quantity).toFixed(4));
    await tx.execute(sql`
      INSERT INTO arch_budget_items (
        id, tenant_id, budget_id, project_id, item, description, type,
        quantity, unit, material_value, labor_value, unit_total,
        total_material, total_labor, total, composition_code,
        visible_to_client, sort_order, created_at, updated_at
      ) VALUES (
        ${itemId}, ${tid}, ${preBudgetId}, ${project.id},
        ${item.item},
        ${`Etapa: ${item.stage}. Quantitativo ${item.basis === "geometry" ? "medido da geometria salva no Concept" : "originado da configuração do Concept"}.`},
        'service', ${quantity}, ${item.unit},
        0, 0, 0, 0, 0, 0, ${item.compositionCode ?? null},
        true, ${index + 1}, now(), now()
      )
    `);
  }

  const configuredCatalogBudgetGroups = [...configuredCatalogObjectGroups.values()];
  for (let index = 0; index < configuredCatalogBudgetGroups.length; index++) {
    const product = configuredCatalogBudgetGroups[index]!;
    const itemId = crypto.randomUUID();
    const selectionsText = product.selections.length
      ? product.selections.map((selection) =>
          `${selection.grupo || selection.surface}: ${selection.materialName || selection.materialId}`
        ).join("; ")
      : "Acabamento padrão do produto";
    const description = [
      product.supplier ? `Fornecedor: ${product.supplier}` : null,
      `Catálogo: ${product.catalogProductId}`,
      `Categoria de projeto: ${objectStage(product.kind)}`,
      `Acabamentos: ${selectionsText}`,
      `Quantidade aplicada no projeto: ${product.quantity}`,
    ].filter(Boolean).join(". ");
    const unitPrice = Math.max(0, Number(product.configuredPrice) || 0);
    const quantity = Math.max(1, product.quantity);
    const total = unitPrice * quantity;

    await tx.execute(sql`
      INSERT INTO arch_budget_items (
        id, tenant_id, budget_id, project_id, item, description, type,
        quantity, unit, material_value, labor_value, unit_total,
        total_material, total_labor, total, composition_code,
        visible_to_client, sort_order, created_at, updated_at
      ) VALUES (
        ${itemId}, ${tid}, ${preBudgetId}, ${project.id},
        ${product.label},
        ${description},
        'product', ${quantity}, 'un',
        ${unitPrice}, 0, ${unitPrice},
        ${total}, 0, ${total}, null,
        true, ${quantityItems.length + index + 1}, now(), now()
      )
    `);
  }

  const linkedOpeningBudgetGroups = [...linkedOpeningGroups.values()];
  for (let index = 0; index < linkedOpeningBudgetGroups.length; index++) {
    const group = linkedOpeningBudgetGroups[index]!;
    const catalog = linkedOpeningCatalogById.get(group.catalogProductId);
    const itemId = crypto.randomUUID();
    const unitPrice = Math.max(0, Number(catalog?.precoBase ?? 0) || 0);
    const quantity = Math.max(1, group.quantity);
    const total = unitPrice * quantity;
    const manufacturer = catalog?.fornecedor ?? catalog?.marca ?? group.manufacturer;
    const description = [
      `Catálogo: ${group.catalogProductId}`,
      manufacturer ? `Fabricante/fornecedor: ${manufacturer}` : null,
      `Dimensão aplicada: ${group.width.toFixed(2)} × ${group.height.toFixed(2)} m`,
      group.profile ? `Perfil: ${group.profile}` : null,
      group.type === "window" && group.glass ? `Vidro: ${group.glass}` : null,
      "Gerado automaticamente a partir da esquadria especificada no Arqdor.",
    ].filter(Boolean).join(". ");

    await tx.execute(sql`
      INSERT INTO arch_budget_items (
        id, tenant_id, budget_id, project_id, item, description, type,
        quantity, unit, material_value, labor_value, unit_total,
        total_material, total_labor, total, composition_code,
        visible_to_client, sort_order, created_at, updated_at
      ) VALUES (
        ${itemId}, ${tid}, ${preBudgetId}, ${project.id},
        ${catalog?.nome ?? (group.type === "door" ? "Porta especificada" : "Janela especificada")},
        ${description},
        'product', ${quantity}, ${catalog?.unidade || "un"},
        ${unitPrice}, 0, ${unitPrice},
        ${total}, 0, ${total}, null,
        true, ${quantityItems.length + configuredCatalogBudgetGroups.length + index + 1}, now(), now()
      )
    `);
  }

  await tx.execute(sql`
    WITH composition_costs AS (
      SELECT c.id, c.codigo,
        COALESCE(SUM(CASE WHEN i.tipo = 'mao_de_obra' THEN 0 ELSE ci.quantidade::numeric * COALESCE(i.preco_unitario::numeric, 0) END), 0) AS material_value,
        COALESCE(SUM(CASE WHEN i.tipo = 'mao_de_obra' THEN ci.quantidade::numeric * COALESCE(i.preco_unitario::numeric, 0) ELSE 0 END), 0) AS labor_value
      FROM composicoes c
      LEFT JOIN composicao_insumos ci ON ci.composicao_id = c.id
      LEFT JOIN insumos i ON i.id = ci.insumo_id
      WHERE c.tenant_id = ${tid} AND c.ativo = true
      GROUP BY c.id, c.codigo
    )
    UPDATE arch_budget_items abi
       SET composition_id = cc.id,
           material_value = cc.material_value,
           labor_value = cc.labor_value,
           unit_total = cc.material_value + cc.labor_value,
           total_material = abi.quantity::numeric * cc.material_value,
           total_labor = abi.quantity::numeric * cc.labor_value,
           total = abi.quantity::numeric * (cc.material_value + cc.labor_value),
           updated_at = now()
      FROM composition_costs cc
     WHERE abi.budget_id = ${preBudgetId}
       AND abi.tenant_id = ${tid}
       AND abi.composition_code IS NOT NULL
       AND lower(abi.composition_code) = lower(cc.codigo)
  `);

  await tx.execute(sql`
    UPDATE arch_budgets b
       SET subtotal_material = totals.material_total,
           subtotal_labor = totals.labor_total,
           subtotal = totals.material_total + totals.labor_total,
           grand_total = GREATEST(0, totals.material_total + totals.labor_total),
           updated_at = now()
      FROM (
        SELECT
          COALESCE(SUM(total_material::numeric), 0) AS material_total,
          COALESCE(SUM(total_labor::numeric), 0) AS labor_total
        FROM arch_budget_items
        WHERE budget_id = ${preBudgetId} AND deleted_at IS NULL
      ) totals
     WHERE b.id = ${preBudgetId}
  `);

  await tx
    .update(archProjetosTable)
    .set({ obraId, updatedAt: new Date() })
    .where(and(eq(archProjetosTable.id, project.id), eq(archProjetosTable.tenantId, tid)));

  (project as any).obraId = obra.id;

  const frozenAt = new Date().toISOString();
  const existingMaster = (conceptConfiguration.projectMaster ?? null) as { version?: number } | null;
  const projectMaster = {
    version: Math.max(1, Number(conceptConfiguration.revisionNumber ?? existingMaster?.version ?? 1)),
    frozenAt,
    sourceConceptId: concept.id,
    sourceUpdatedAt: concept.updatedAt instanceof Date ? concept.updatedAt.toISOString() : String(concept.updatedAt ?? frozenAt),
    geometryVersion: "master_facade_v1" as const,
    lot: concept.lot,
    floors,
    desiredArea,
    sitePlacement: conceptConfiguration.sitePlacement ?? undefined,
    rooms,
    customWalls,
    customOpenings,
    openingOverrides: concept.openingOverrides ?? {},
    facadePreferences: concept.facadePreferences,
    facadeDesign: (concept as any).facadeDesign ?? conceptConfiguration.facadeDesign ?? undefined,
    projectBrief: conceptConfiguration.projectBrief ?? null,
    objects: Array.isArray(conceptConfiguration.objects) ? conceptConfiguration.objects : [],
    configuredProducts: configuredCatalogObjects,
    spaceProfiles: Array.isArray(conceptConfiguration.spaceProfiles) ? conceptConfiguration.spaceProfiles : [],
    wallMaterials: conceptConfiguration.wallMaterials && typeof conceptConfiguration.wallMaterials === "object" ? conceptConfiguration.wallMaterials : {},
    acceptanceProof: {
      validatorVersion: masterAcceptance.validatorVersion,
      status: masterAcceptance.status,
      score: masterAcceptance.score,
      issues: masterAcceptance.issues,
      acceptedWarningIds: masterAcceptance.warnings.map((issue) => issue.id),
      evaluatedAt: frozenAt,
    },
    conceptRender: concept.conceptRender ?? {},
    quantities: quantityItems.map((item) => ({
      ...item,
      quantity: Number(Math.max(0, item.quantity).toFixed(4)),
    })),
    links: {
      archProjetoId: project.id,
      obraId: obra.id,
      budgetId: preBudgetId,
      leadId,
      dealId,
    },
  };

  await tx
    .update(archConceptProjectsTable)
    .set({
      archProjetoId: project.id,
      status: "submitted",
      configuration: {
        ...conceptConfiguration,
        projectMaster,
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(archConceptProjectsTable.id, id),
        eq(archConceptProjectsTable.tenantId, tid),
        eq(archConceptProjectsTable.ownerUserId, userId),
      ),
    );

  await tx
    .update(archAiRendersTable)
    .set({ projectId: project.id })
    .where(
      and(
        eq(archAiRendersTable.tenantId, tid),
        eq(archAiRendersTable.projectId, id),
      ),
    );

  return res.status(201).json({
    ok: true,
    alreadyPromoted: false,
    project,
    leadId,
    dealId,
    obraId: obra.id,
    budgetId: preBudgetId,
    projectMaster,
  });
  });
});

router.post("/arch/concept-projects/:id/revise", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const userId = req.user?.sub;
  const id = String(req.params.id);
  if (!tid || !userId) return res.status(401).json({ error: "Sessão inválida." });

  const [concept] = await db
    .select()
    .from(archConceptProjectsTable)
    .where(and(
      eq(archConceptProjectsTable.id, id),
      eq(archConceptProjectsTable.tenantId, tid),
      eq(archConceptProjectsTable.ownerUserId, userId),
    ))
    .limit(1);

  if (!concept) return res.status(404).json({ error: "Pré-projeto não encontrado." });
  const configuration = (concept.configuration ?? {}) as any;
  const master = configuration.projectMaster;
  if (concept.status !== "submitted" || !master) {
    return res.status(409).json({ error: "A revisão só pode ser criada a partir de um Projeto Mestre aprovado." });
  }

  const nextRevision = Math.max(2, Number(configuration.revisionNumber ?? master.version ?? 1) + 1);
  const nextConfiguration = {
    ...configuration,
    projectMaster: undefined,
    revisionOfConceptId: concept.id,
    revisionNumber: nextRevision,
    publicTourToken: undefined,
    publicTourEnabled: false,
    publicTourUpdatedAt: undefined,
    facadeDesign: master.facadeDesign ?? configuration.facadeDesign,
    objects: Array.isArray(master.objects) ? master.objects : (Array.isArray(configuration.objects) ? configuration.objects : []),
    spaceProfiles: Array.isArray(master.spaceProfiles) ? master.spaceProfiles : (Array.isArray(configuration.spaceProfiles) ? configuration.spaceProfiles : []),
    wallMaterials: master.wallMaterials ?? configuration.wallMaterials ?? {},
  };

  const [revision] = await db
    .insert(archConceptProjectsTable)
    .values({
      tenantId: tid,
      ownerUserId: userId,
      archProjetoId: master.links?.archProjetoId ?? concept.archProjetoId ?? null,
      title: `${String(concept.title ?? "Pré-projeto").replace(/\s+—\s+Revisão\s+\d+$/i, "")} — Revisão ${nextRevision}`,
      status: "draft",
      currentStep: Math.max(4, Number(concept.currentStep ?? 4)),
      lot: master.lot ?? concept.lot,
      configuration: nextConfiguration,
      rooms: Array.isArray(master.rooms) ? master.rooms : concept.rooms,
      openingOverrides: master.openingOverrides ?? concept.openingOverrides ?? {},
      customerProfile: concept.customerProfile ?? {},
      facadePreferences: master.facadePreferences ?? concept.facadePreferences,
      conceptRender: {},
      selectedVariant: concept.selectedVariant ?? 0,
    })
    .returning();

  return res.status(201).json({
    ok: true,
    revision,
    revisionOfConceptId: concept.id,
    revisionNumber: nextRevision,
  });
});
function getPortalBaseUrl(req: Request): string {
  // Mesmo achado do reset de senha: REPLIT_DOMAINS aponta pro backend
  // (Railway), não pro site (Vercel) -- link de portal do cliente
  // caía na mesma tela de erro. APP_URL é a variável correta.
  const appUrl = process.env["APP_URL"];
  if (appUrl) {
    return appUrl.replace(/\/$/, "");
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${Array.isArray(host) ? host[0] : host}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /arch/portal/:token — PUBLIC (no auth)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/portal/:token", async (req, res) => {
  const token = String(req.params.token);

  const [projeto] = await db
    .select()
    .from(archProjetosTable)
    .where(
      and(
        eq(archProjetosTable.portalToken, token),
        eq(archProjetosTable.portalAtivo, true),
      ),
    )
    .limit(1);

  if (!projeto) {
    return res.status(404).json({ error: "Portal não encontrado ou inativo." });
  }

  const [ambientes, orcamento, cenas, tenantRow, obraRow] = await Promise.all([
    db
      .select()
      .from(archAmbientesTable)
      .where(eq(archAmbientesTable.projetoId, projeto.id))
      .orderBy(archAmbientesTable.ordem),
    db
      .select()
      .from(archOrcamentoItensTable)
      .where(eq(archOrcamentoItensTable.projetoId, projeto.id)),
    db
      .select()
      .from(archCenasTable)
      .where(eq(archCenasTable.projetoId, projeto.id)),
    db
      .select({
        name:       tenantsTable.name,
        nomeEmpresa: tenantsTable.nomeEmpresa,
        logoUrl:    tenantsTable.logoUrl,
        site:       tenantsTable.site,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, projeto.tenantId))
      .limit(1),
    projeto.obraId
      ? db
          .select({
            id: obrasTable.id,
            nome: obrasTable.nome,
            status: obrasTable.status,
            dataInicio: obrasTable.dataInicio,
            dataFimPrevista: obrasTable.dataFimPrevista,
            orcamentoTotal: obrasTable.orcamentoTotal,
            custoRealizado: obrasTable.custoRealizado,
          })
          .from(obrasTable)
          .where(and(eq(obrasTable.id, projeto.obraId), eq(obrasTable.tenantId, projeto.tenantId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const obra = obraRow[0] ?? null;
  const etapas = obra
    ? await db
        .select({
          id: obraEtapasTable.id,
          nome: obraEtapasTable.nome,
          ordem: obraEtapasTable.ordem,
          status: obraEtapasTable.status,
          percentualExecutado: obraEtapasTable.percentualExecutado,
          dataInicioPrevista: obraEtapasTable.dataInicioPrevista,
          dataFimPrevista: obraEtapasTable.dataFimPrevista,
        })
        .from(obraEtapasTable)
        .where(eq(obraEtapasTable.obraId, obra.id))
        .orderBy(obraEtapasTable.ordem)
    : [];

  return res.json({
    projeto,
    ambientes,
    orcamento,
    cenas,
    tenant: tenantRow[0] ?? null,
    obra,
    etapas,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Protected routes below — all require authentication
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/arch/projetos
router.get("/arch/projetos", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { status, clienteNome } = req.query as Record<string, string | undefined>;

  const resolvedClientName = sql<string>`coalesce(nullif(trim(${leadsTable.nome}), ''), nullif(trim(${archProjetosTable.clienteNome}), ''))`;
  const conditions = [eq(archProjetosTable.tenantId, tid)];
  if (status) conditions.push(eq(archProjetosTable.status, status));
  if (clienteNome)
    conditions.push(ilike(resolvedClientName, `%${clienteNome}%`));

  const projetos = await db
    .select({
      id:              archProjetosTable.id,
      leadId:          archProjetosTable.leadId,
      titulo:          archProjetosTable.titulo,
      clienteNome:     resolvedClientName,
      clienteEmail:    sql<string>`coalesce(nullif(trim(${leadsTable.email}), ''), ${archProjetosTable.clienteEmail})`,
      clienteTelefone: sql<string>`coalesce(nullif(trim(${leadsTable.telefone}), ''), ${archProjetosTable.clienteTelefone})`,
      status:          archProjetosTable.status,
      tipoObra:        archProjetosTable.tipoObra,
      areaM2:          archProjetosTable.areaM2,
      orcamentoTotal:  archProjetosTable.orcamentoTotal,
      prazoEstimado:   archProjetosTable.prazoEstimado,
      portalAtivo:     archProjetosTable.portalAtivo,
      createdAt:       archProjetosTable.createdAt,
      updatedAt:       archProjetosTable.updatedAt,
      thumbnailUrl: sql<string | null>`(
        select arch_ai_renders.result_image_url from arch_ai_renders
        where arch_ai_renders.project_id = ${archProjetosTable.id}
          and arch_ai_renders.status = 'concluido'
          and arch_ai_renders.result_image_url is not null
        order by arch_ai_renders.created_at desc
        limit 1
      )`,
      totalAmbientes: sql<number>`(
        select count(*) from arch_ambientes
        where arch_ambientes.projeto_id = ${archProjetosTable.id}
      )`.mapWith(Number),
      totalRenders: sql<number>`(
        select count(*) from arch_ai_renders
        where arch_ai_renders.project_id = ${archProjetosTable.id}
          and arch_ai_renders.status = 'concluido'
      )`.mapWith(Number),
      totalRenderAmbientes: sql<number>`(
        select count(distinct arch_ai_renders.ambiente) from arch_ai_renders
        where arch_ai_renders.project_id = ${archProjetosTable.id}
          and arch_ai_renders.status = 'concluido'
      )`.mapWith(Number),
    })
    .from(archProjetosTable)
    .leftJoin(leadsTable, and(
      eq(leadsTable.id, archProjetosTable.leadId),
      eq(leadsTable.tenantId, archProjetosTable.tenantId),
    ))
    .where(and(...conditions))
    .orderBy(desc(archProjetosTable.createdAt));

  return res.json(projetos);
});

// POST /api/arch/projetos
router.post("/arch/projetos", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const parsed = insertArchProjetoSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [projeto] = await db
    .insert(archProjetosTable)
    .values({
      ...parsed.data,
      portalToken: crypto.randomUUID(),
      portalAtivo: false,
    } as any)
    .returning();

  return res.status(201).json(projeto);
});

// GET /api/arch/projetos/:id
router.get("/arch/projetos/:id", authenticate, async (req, res) => {
  const id = String((req.params.id as string));
  const tid = tenantId(req);

  const [projeto] = await db
    .select()
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const [ambientes, orcamento, cenas, renders] = await Promise.all([
    db
      .select()
      .from(archAmbientesTable)
      .where(eq(archAmbientesTable.projetoId, id))
      .orderBy(archAmbientesTable.ordem),
    db
      .select()
      .from(archOrcamentoItensTable)
      .where(eq(archOrcamentoItensTable.projetoId, id)),
    db
      .select()
      .from(archCenasTable)
      .where(eq(archCenasTable.projetoId, id)),
    db
      .select({
        id: archAiRendersTable.id,
        parentRenderId: archAiRendersTable.parentRenderId,
        ambiente: archAiRendersTable.ambiente,
        mode: archAiRendersTable.mode,
        status: archAiRendersTable.status,
        versionTag: archAiRendersTable.versionTag,
        originalImageUrl: archAiRendersTable.originalImageUrl,
        resultImageUrl: archAiRendersTable.resultImageUrl,
        approvedBy: archAiRendersTable.approvedBy,
        approvedAt: archAiRendersTable.approvedAt,
        createdAt: archAiRendersTable.createdAt,
        concluidoEm: archAiRendersTable.concluidoEm,
      })
      .from(archAiRendersTable)
      .where(and(
        eq(archAiRendersTable.projectId, id),
        eq(archAiRendersTable.tenantId, projeto.tenantId),
      ))
      .orderBy(desc(archAiRendersTable.createdAt)),
  ]);

  return res.json({ projeto, ambientes, orcamento, cenas, renders });
});

// PATCH /api/arch/projetos/:id
router.patch("/arch/projetos/:id", authenticate, async (req, res) => {
  const id = String((req.params.id as string));

  const [existing] = await db
    .select({ tenantId: archProjetosTable.tenantId, leadId: archProjetosTable.leadId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, existing.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchProjetoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const incomingDealId = (parsed.data as any).dealId as string | null | undefined;
  if (incomingDealId) {
    const [targetDeal] = await db
      .select({ id: dealsTable.id, tenantId: dealsTable.tenantId, leadId: dealsTable.leadId })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, incomingDealId), eq(dealsTable.tenantId, existing.tenantId)))
      .limit(1);

    if (!targetDeal) {
      return res.status(400).json({ error: "Negócio inválido para este tenant." });
    }

    const resolvedLeadId = ((parsed.data as any).leadId as string | null | undefined) ?? existing.leadId;
    if (resolvedLeadId && targetDeal.leadId && resolvedLeadId !== targetDeal.leadId) {
      return res.status(409).json({ error: "O negócio pertence a outro cliente." });
    }
  }

  const [updated] = await db
    .update(archProjetosTable)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(archProjetosTable.id, id))
    .returning();

  return res.json(updated);
});

// GET /api/arch/projetos/:id/negocios — negócios da pipeline do mesmo cliente
router.get("/arch/projetos/:id/negocios", authenticate, async (req, res) => {
  const id = String(req.params.id);

  const [projeto] = await db
    .select({
      id: archProjetosTable.id,
      tenantId: archProjetosTable.tenantId,
      leadId: archProjetosTable.leadId,
      dealId: archProjetosTable.dealId,
    })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const dealSelection = {
    id: dealsTable.id,
    titulo: dealsTable.titulo,
    valor: dealsTable.valor,
    etapa: dealsTable.etapa,
    leadId: dealsTable.leadId,
    assignedTo: dealsTable.assignedTo,
    responsavelNome: usersTable.name,
    createdAt: dealsTable.createdAt,
  };

  const currentRows = projeto.dealId
    ? await db
        .select(dealSelection)
        .from(dealsTable)
        .leftJoin(usersTable, and(
          eq(usersTable.id, dealsTable.assignedTo),
          eq(usersTable.tenantId, dealsTable.tenantId),
        ))
        .where(and(
          eq(dealsTable.id, projeto.dealId),
          eq(dealsTable.tenantId, projeto.tenantId),
        ))
        .limit(1)
    : [];

  const candidateRows = projeto.leadId
    ? await db
        .select(dealSelection)
        .from(dealsTable)
        .leftJoin(usersTable, and(
          eq(usersTable.id, dealsTable.assignedTo),
          eq(usersTable.tenantId, dealsTable.tenantId),
        ))
        .where(and(
          eq(dealsTable.tenantId, projeto.tenantId),
          eq(dealsTable.leadId, projeto.leadId),
        ))
        .orderBy(desc(dealsTable.updatedAt))
    : [];

  const serialize = (deal: any) => ({
    ...deal,
    active: !["perdido", "entregue"].includes(String(deal.etapa ?? "")),
  });

  return res.json({
    current: currentRows[0] ? serialize(currentRows[0]) : null,
    candidates: candidateRows.map(serialize),
  });
});

// POST /api/arch/projetos/:id/negocio — vincula negócio existente ou cria um na pipeline
router.post("/arch/projetos/:id/negocio", authenticate, async (req, res) => {
  const id = String(req.params.id);
  const body = (req.body ?? {}) as { dealId?: string; create?: boolean };

  const [projeto] = await db
    .select()
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  let deal: any = null;

  if (body.create) {
    if (!projeto.leadId) {
      return res.status(409).json({ error: "Vincule primeiro este projeto a um cliente do CRM." });
    }

    const [created] = await db
      .insert(dealsTable)
      .values({
        tenantId: projeto.tenantId,
        leadId: projeto.leadId,
        titulo: projeto.titulo || projeto.clienteNome || "Novo negócio",
        valor: projeto.orcamentoTotal && Number(projeto.orcamentoTotal) > 0 ? projeto.orcamentoTotal : null,
        etapa: "novo",
      })
      .returning();

    deal = created;
  } else {
    const dealId = String(body.dealId ?? "").trim();
    if (!dealId) return res.status(400).json({ error: "Informe o negócio a vincular." });

    const [existingDeal] = await db
      .select()
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, projeto.tenantId)))
      .limit(1);

    if (!existingDeal) return res.status(404).json({ error: "Negócio não encontrado neste tenant." });

    if (projeto.leadId && existingDeal.leadId && projeto.leadId !== existingDeal.leadId) {
      return res.status(409).json({ error: "O negócio selecionado pertence a outro cliente." });
    }

    deal = existingDeal;
  }

  const nextLeadId = projeto.leadId ?? deal.leadId ?? null;
  if (!nextLeadId) {
    return res.status(409).json({ error: "O negócio precisa estar ligado a um cliente do CRM." });
  }

  const [updatedProject] = await db
    .update(archProjetosTable)
    .set({
      dealId: deal.id,
      leadId: nextLeadId,
      updatedAt: new Date(),
    })
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, projeto.tenantId)))
    .returning();

  const [responsavel] = deal.assignedTo
    ? await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(and(eq(usersTable.id, deal.assignedTo), eq(usersTable.tenantId, projeto.tenantId)))
        .limit(1)
    : [];

  return res.status(body.create ? 201 : 200).json({
    projeto: updatedProject,
    deal: {
      id: deal.id,
      titulo: deal.titulo,
      valor: deal.valor,
      etapa: deal.etapa,
      leadId: deal.leadId,
      assignedTo: deal.assignedTo,
      responsavelNome: responsavel?.name ?? null,
      active: !["perdido", "entregue"].includes(String(deal.etapa ?? "")),
    },
  });
});

// DELETE /api/arch/projetos/:id — soft delete (status = cancelado)
router.delete("/arch/projetos/:id", authenticate, async (req, res) => {
  const id = String((req.params.id as string));

  const [existing] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, existing.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const [updated] = await db
    .update(archProjetosTable)
    .set({ status: "cancelado", updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id))
    .returning();

  return res.json(updated);
});

// POST /api/arch/projetos/:id/portal/ativar
router.post("/arch/projetos/:id/portal/ativar", authenticate, async (req, res) => {
  const id = String((req.params.id as string));

  const [existing] = await db
    .select({ tenantId: archProjetosTable.tenantId, portalToken: archProjetosTable.portalToken })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, existing.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  await db
    .update(archProjetosTable)
    .set({ portalAtivo: true, updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id));

  const baseUrl = getPortalBaseUrl(req);
  return res.json({ portalUrl: `${baseUrl}/arch/portal/${existing.portalToken}` });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ambientes
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/arch/projetos/:id/ambientes
router.post("/arch/projetos/:id/ambientes", authenticate, async (req, res) => {
  const projetoId = String((req.params.id as string));

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = insertArchAmbienteSchema.safeParse({ ...req.body, projetoId });
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [ambiente] = await db
    .insert(archAmbientesTable)
    .values(parsed.data as any)
    .returning();

  return res.status(201).json(ambiente);
});

// PATCH /api/arch/projetos/:id/ambientes/:ambId
router.patch("/arch/projetos/:id/ambientes/:ambId", authenticate, async (req, res) => {
  const projetoId = String((req.params.id as string));
  const ambId = String(req.params.ambId);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchAmbienteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [updated] = await db
    .update(archAmbientesTable)
    .set(parsed.data as any)
    .where(
      and(
        eq(archAmbientesTable.id, ambId),
        eq(archAmbientesTable.projetoId, projetoId),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Ambiente não encontrado." });
  return res.json(updated);
});

// DELETE /api/arch/projetos/:id/ambientes/:ambId
router.delete("/arch/projetos/:id/ambientes/:ambId", authenticate, async (req, res) => {
  const projetoId = String((req.params.id as string));
  const ambId = String(req.params.ambId);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  await db
    .delete(archAmbientesTable)
    .where(
      and(
        eq(archAmbientesTable.id, ambId),
        eq(archAmbientesTable.projetoId, projetoId),
      ),
    );

  return res.status(204).send();
});

// ─────────────────────────────────────────────────────────────────────────────
// Cenas
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/arch/projetos/:id/cenas
router.get("/arch/projetos/:id/cenas", authenticate, async (req, res) => {
  const projetoId = String((req.params.id as string));

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const cenas = await db
    .select()
    .from(archCenasTable)
    .where(eq(archCenasTable.projetoId, projetoId))
    .orderBy(desc(archCenasTable.createdAt));

  return res.json(cenas);
});

// POST /api/arch/projetos/:id/cenas
router.post("/arch/projetos/:id/cenas", authenticate, async (req, res) => {
  const projetoId = String((req.params.id as string));

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = insertArchCenaSchema.safeParse({ ...req.body, projetoId });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [cena] = await db.insert(archCenasTable).values(parsed.data).returning();
  return res.status(201).json(cena);
});

// PATCH /api/arch/cenas/:cenaId
router.patch("/arch/cenas/:cenaId", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const [cena] = await db
    .select({ projetoId: archCenasTable.projetoId })
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return res.status(404).json({ error: "Cena não encontrada." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchCenaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [updated] = await db
    .update(archCenasTable)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(archCenasTable.id, cenaId))
    .returning();

  return res.json(updated);
});

// POST /api/arch/cenas/:cenaId/renderizar
router.post("/arch/cenas/:cenaId/renderizar", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const [cena] = await db
    .select({ projetoId: archCenasTable.projetoId, status: archCenasTable.status })
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return res.status(404).json({ error: "Cena não encontrada." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  if (cena.status === "renderizando") {
    return res.status(409).json({ error: "Render já em andamento." });
  }

  const result = await iniciarRender(cenaId);
  return res.status(202).json(result);
});

// GET /api/arch/renders/gallery — renders recentes do tenant para o seletor de imagens da proposta
router.get("/arch/renders/gallery", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const limit = Math.min(Number(req.query.limit) || 40, 80);
  const projetoId = typeof req.query.projetoId === "string" && req.query.projetoId.trim()
    ? req.query.projetoId.trim()
    : null;

  const conditions = [eq(archProjetosTable.tenantId, tid)];
  if (projetoId) conditions.push(eq(archCenasTable.projetoId, projetoId));

  const rows = await db
    .select({
      id:        archRenderVersoesTable.id,
      imageUrl:  archRenderVersoesTable.imageUrl,
      versao:    archRenderVersoesTable.versao,
      origem:    archRenderVersoesTable.origem,
      createdAt: archRenderVersoesTable.createdAt,
      cenaId:    archRenderVersoesTable.cenaId,
      cenaNome:  archCenasTable.nome,
      projetoId: archCenasTable.projetoId,
    })
    .from(archRenderVersoesTable)
    .innerJoin(archCenasTable, eq(archCenasTable.id, archRenderVersoesTable.cenaId))
    .innerJoin(archProjetosTable, eq(archProjetosTable.id, archCenasTable.projetoId))
    .where(and(...conditions))
    .orderBy(desc(archRenderVersoesTable.createdAt))
    .limit(limit);

  return res.json(rows);
});

// GET /api/arch/cenas/:cenaId/render-status
router.get("/arch/cenas/:cenaId/render-status", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const [cena] = await db
    .select({ projetoId: archCenasTable.projetoId, status: archCenasTable.status, renderUrl: archCenasTable.renderUrl })
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return res.status(404).json({ error: "Cena não encontrada." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  // Último render
  const [ultimoRender] = await db
    .select()
    .from(archRendersTable)
    .where(eq(archRendersTable.cenaId, cenaId))
    .orderBy(desc(archRendersTable.createdAt))
    .limit(1);

  return res.json({
    status:      cena.status,
    renderUrl:   cena.renderUrl,
    render:      ultimoRender ?? null,
  });
});

// DELETE /api/arch/cenas/:cenaId
router.delete("/arch/cenas/:cenaId", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const [cena] = await db
    .select({ projetoId: archCenasTable.projetoId })
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return res.status(404).json({ error: "Cena não encontrada." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  // Renders são removidos por CASCADE (FK cena_id → arch_cenas)
  await db.delete(archCenasTable).where(eq(archCenasTable.id, cenaId));

  return res.status(204).send();
});

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arch/sketchfab/search?q=sofa
router.get("/arch/sketchfab/search", authenticate, async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ items: [], poweredBy: "Sketchfab" });
    const limit = Number(req.query.limit ?? 24);
    const items = await searchSketchfabModels(q, limit);
    return res.json({ items, poweredBy: "Sketchfab" });
  } catch (error) {
    console.error("[arqdor/sketchfab/search]", error);
    return res.status(502).json({ error: "Não foi possível consultar o Sketchfab agora." });
  }
});

router.post("/arch/sketchfab/import", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const uid = z.string().trim().min(1).max(80).safeParse(req.body?.uid);
  if (!uid.success) return res.status(400).json({ error: "uid_invalid" });

  try {
    const accessToken = await getValidSketchfabAccessToken(tid);
    const model = await getSketchfabModel(uid.data, accessToken);
    if (!model.isDownloadable) return res.status(422).json({ error: "model_not_downloadable" });

    const download = await getSketchfabDownload(uid.data, accessToken);
    const gltf = download.gltf;
    if (!gltf?.url) return res.status(422).json({ error: "gltf_not_available" });

    const archive = await downloadSketchfabGltfArchive(gltf.url, gltf.size);
    const files = extractZipArchive(archive);
    const scene = files.find((file) => /(^|\/)scene\.gltf$/i.test(file.path))
      ?? files.find((file) => /\.gltf$/i.test(file.path));
    if (!scene) return res.status(422).json({ error: "gltf_scene_missing" });

    const prefix = ["public", "arqdor", "sketchfab", tid, uid.data].join("/");
    let sceneUrl: string | null = null;
    for (const file of files) {
      const publicUrl = await saveSketchfabAsset(`${prefix}/${file.path}`, file.data, contentTypeForModelAsset(file.path));
      if (file.path === scene.path) sceneUrl = publicUrl;
    }
    if (!sceneUrl) throw new Error("scene_upload_failed");

    const [existing] = await db.select().from(produtosCatalogoTable)
      .where(and(
        eq(produtosCatalogoTable.tenantId, tid),
        sql`${produtosCatalogoTable.projectTechnicalConfig} ->> 'sketchfabUid' = ${uid.data}`,
      ))
      .limit(1);

    const values = {
      nome: model.name,
      descricao: model.description,
      fornecedor: model.authorName ?? "Sketchfab",
      marca: "Sketchfab",
      precoBase: existing?.precoBase ?? "0",
      unidade: existing?.unidade ?? "un",
      ativo: true,
      projectLibraryEnabled: true,
      imagemUrl: model.thumbnailUrl,
      imagens: model.thumbnailUrl ? [model.thumbnailUrl] : [],
      model3dUrl: sceneUrl,
      projectTechnicalConfig: {
        ...((existing?.projectTechnicalConfig ?? {}) as Record<string, unknown>),
        source: "sketchfab",
        sketchfabUid: model.uid,
        sketchfabViewerUrl: model.viewerUrl,
        modelSource: "Sketchfab",
        modelFormat: "gltf",
        modelLicense: model.licenseLabel,
        modelLicenseSlug: model.licenseSlug,
        modelAuthor: model.authorName,
        modelAuthorUid: model.authorUid,
        modelVertexCount: model.vertexCount,
        modelFaceCount: model.faceCount,
        importedAt: new Date().toISOString(),
        importedFileCount: files.length,
      },
      updatedAt: new Date(),
    };

    const [product] = existing
      ? await db.update(produtosCatalogoTable).set(values).where(eq(produtosCatalogoTable.id, existing.id)).returning()
      : await db.insert(produtosCatalogoTable).values({ tenantId: tid, ...values }).returning();

    return res.status(existing ? 200 : 201).json({ success: true, product });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sketchfab_import_failed";
    if (message === "sketchfab_not_connected" || message === "sketchfab_reconnect_required") {
      return res.status(409).json({ error: message });
    }
    if (message === "sketchfab_archive_too_large") {
      return res.status(413).json({ error: message, maxArchiveMb: 45 });
    }
    console.error("[arqdor/sketchfab/import]", error);
    return res.status(502).json({ error: "sketchfab_import_failed", detail: message.slice(0, 180) });
  }
});

// GET /api/arch/polyhaven/search?q=mesa
router.get("/arch/polyhaven/search", authenticate, async (req, res) => {
  try {
    const q = String(req.query.q ?? "furniture");
    const limit = Number(req.query.limit ?? 18);
    const items = await searchPolyHavenModels(q, limit);
    return res.json({ items, poweredBy: "Poly Haven", license: "CC0" });
  } catch (error) {
    console.error("[arqdor/polyhaven/search]", error);
    return res.status(502).json({ error: "Não foi possível consultar a biblioteca Poly Haven agora." });
  }
});

// GET /api/arch/polyhaven/assets/:slug
router.get("/arch/polyhaven/assets/:slug", authenticate, async (req, res) => {
  try {
    const asset = await resolvePolyHavenModel(String(req.params.slug));
    if (!asset.model3dUrl) {
      return res.status(404).json({ error: "Este asset não possui GLB compatível disponível." });
    }
    return res.json(asset);
  } catch (error) {
    console.error("[arqdor/polyhaven/asset]", error);
    return res.status(502).json({ error: "Não foi possível resolver o modelo 3D da Poly Haven." });
  }
});


// POST /api/arch/polyhaven/import
// Poly Haven é CC0; em produção persistimos o URL oficial estável no Produto Mestre.
// Isso evita abrir escrita anônima no Storage enquanto o service-role não está provisionado.
router.post("/arch/polyhaven/import", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const slug = z.string().trim().regex(/^[a-zA-Z0-9_-]+$/).safeParse(req.body?.slug);
  if (!slug.success) return res.status(400).json({ error: "slug_invalid" });

  try {
    const asset = await resolvePolyHavenModel(slug.data);
    if (!asset.model3dUrl) return res.status(404).json({ error: "glb_not_available" });

    const [existing] = await db.select().from(produtosCatalogoTable)
      .where(and(
        eq(produtosCatalogoTable.tenantId, tid),
        sql`${produtosCatalogoTable.projectTechnicalConfig} ->> 'polyHavenSlug' = ${slug.data}`,
      ))
      .limit(1);

    const values = {
      nome: asset.name,
      descricao: asset.description || null,
      fornecedor: "Poly Haven",
      marca: "Poly Haven",
      precoBase: existing?.precoBase ?? "0",
      unidade: existing?.unidade ?? "un",
      ativo: true,
      projectLibraryEnabled: true,
      imagemUrl: asset.thumbnailUrl,
      imagens: asset.thumbnailUrl ? [asset.thumbnailUrl] : [],
      model3dUrl: asset.model3dUrl,
      projectTechnicalConfig: {
        ...((existing?.projectTechnicalConfig ?? {}) as Record<string, unknown>),
        source: "polyhaven",
        polyHavenSlug: slug.data,
        modelSource: "Poly Haven",
        modelFormat: "glb",
        modelLicense: "CC0",
        attributionRequired: false,
        authors: asset.authors,
        tags: asset.tags,
        importedAt: new Date().toISOString(),
        externalAsset: true,
        originalModelUrl: asset.model3dUrl,
      },
      updatedAt: new Date(),
    };

    const [product] = existing
      ? await db.update(produtosCatalogoTable).set(values).where(eq(produtosCatalogoTable.id, existing.id)).returning()
      : await db.insert(produtosCatalogoTable).values({ tenantId: tid, ...values }).returning();

    return res.status(existing ? 200 : 201).json({
      success: true,
      product: { id: product?.id, nome: product?.nome, model3dUrl: product?.model3dUrl, imagemUrl: product?.imagemUrl },
      source: "Poly Haven",
      license: "CC0",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "polyhaven_import_failed";
    console.error("[arqdor/polyhaven/import]", error);
    return res.status(502).json({ error: "polyhaven_import_failed", detail: message.slice(0, 180) });
  }
});

// GET /api/arch/health
// Health operacional real do Arqdor. Não inventa uptime/latência:
// usa configuração disponível + telemetria dos renders persistidos do tenant.
router.get("/arch/health", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const now = Date.now();
  const since = new Date(now - 24 * 60 * 60 * 1000);

  try {
    const recent = await db
      .select({
        status: archAiRendersTable.status,
        createdAt: archAiRendersTable.createdAt,
        concluidoEm: archAiRendersTable.concluidoEm,
      })
      .from(archAiRendersTable)
      .where(and(
        eq(archAiRendersTable.tenantId, tid),
        gte(archAiRendersTable.createdAt, since),
      ))
      .orderBy(desc(archAiRendersTable.createdAt))
      .limit(200);

    const completed = recent.filter((item) => item.status === "concluido");
    const failed = recent.filter((item) => ["erro", "falhou", "failed"].includes(String(item.status).toLowerCase()));
    const finished = completed.length + failed.length;
    const successRate = finished > 0 ? (completed.length / finished) * 100 : null;
    const latencies = completed
      .map((item) => item.concluidoEm && item.createdAt ? new Date(item.concluidoEm).getTime() - new Date(item.createdAt).getTime() : 0)
      .filter((value) => value > 0);
    const avgLatencyMs = latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null;

    const providers = {
      openai: {
        configured: Boolean(process.env.OPENAI_API_KEY),
        requiredBy: ["fidelity-review", "analysis", "text"],
      },
      database: {
        configured: true,
        reachable: true,
      },
      storage: {
        configured: Boolean(process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || process.env.PRIVATE_OBJECT_DIR),
      },
    };

    const renderStatus =
      failed.length > 0 && completed.length === 0 ? "offline"
      : failed.length > 0 ? "warning"
      : completed.length > 0 ? "online"
      : providers.openai.configured ? "warning" : "offline";

    return res.json({
      measuredAt: new Date(now).toISOString(),
      windowHours: 24,
      providers,
      render: {
        status: renderStatus,
        total: recent.length,
        completed: completed.length,
        failed: failed.length,
        successRate,
        averageDurationMs: avgLatencyMs,
      },
    });
  } catch (error) {
    req.log?.error?.({ err: error }, "arch/health: falha");
    return res.status(503).json({
      measuredAt: new Date(now).toISOString(),
      windowHours: 24,
      error: "Não foi possível medir a saúde operacional do Arqdor.",
    });
  }
});

// GET /api/arch/catalogo
router.get("/arch/catalogo", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { categoria, fornecedor, busca, scope = "ecosystem", limit = "50", offset = "0" } =
    req.query as Record<string, string | undefined>;

  // Biblioteca de Projeto:
  // - "ecosystem" (padrão): catálogo próprio + catálogos ativos de todos os tenants com Arqdor habilitado.
  // - "tenant": somente catálogo do tenant atual.
  // Dados internos de custo não são retornados; o produto mestre continua pertencendo ao tenant de origem.
  const conditions = [
    eq(produtosCatalogoTable.ativo, true),
    eq(produtosCatalogoTable.projectLibraryEnabled, true),
  ];

  if (scope === "tenant") {
    conditions.push(eq(produtosCatalogoTable.tenantId, tid));
  } else {
    conditions.push(or(
      eq(produtosCatalogoTable.tenantId, tid),
      and(
        eq(tenantNavModulesTable.moduleKey, "arch"),
        eq(tenantNavModulesTable.isEnabled, true),
        eq(tenantsTable.status, "active"),
      ),
    )!);
  }

  if (fornecedor) conditions.push(ilike(produtosCatalogoTable.fornecedor, `%${fornecedor}%`));
  if (busca) conditions.push(ilike(produtosCatalogoTable.nome, `%${busca}%`));
  if (categoria) {
    conditions.push(or(
      eq(produtosCatalogoTable.categoriaId, categoria),
      ilike(categoriasProdutoTable.nome, `%${categoria}%`),
    )!);
  }

  const rows = await db
    .select({
      produto: produtosCatalogoTable,
      categoriaNome: categoriasProdutoTable.nome,
      sourceTenantName: tenantsTable.name,
      arqdorEnabled: tenantNavModulesTable.isEnabled,
    })
    .from(produtosCatalogoTable)
    .leftJoin(
      categoriasProdutoTable,
      and(
        eq(categoriasProdutoTable.id, produtosCatalogoTable.categoriaId),
        eq(categoriasProdutoTable.tenantId, produtosCatalogoTable.tenantId),
      ),
    )
    .leftJoin(tenantsTable, eq(tenantsTable.id, produtosCatalogoTable.tenantId))
    .leftJoin(
      tenantNavModulesTable,
      and(
        eq(tenantNavModulesTable.tenantId, produtosCatalogoTable.tenantId),
        eq(tenantNavModulesTable.moduleKey, "arch"),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      sql`case when ${produtosCatalogoTable.tenantId} = ${tid} then 0 else 1 end`,
      tenantsTable.name,
      produtosCatalogoTable.nome,
    )
    .limit(Math.min(500, Math.max(1, Number(limit) || 50)))
    .offset(Math.max(0, Number(offset) || 0));

  return res.json(rows.map(({ produto, categoriaNome, sourceTenantName }) => {
    const imagens = Array.from(new Set([
      produto.imagemUrl,
      ...((produto.imagens as string[] | null) ?? []),
    ].filter((value): value is string => Boolean(value))));
    const ownedByTenant = produto.tenantId === tid;

    return {
      id: produto.id,
      sourceProductId: produto.id,
      sourceTenantId: produto.tenantId,
      sourceTenantName: sourceTenantName ?? null,
      ownedByTenant,
      canEdit: ownedByTenant,
      nome: produto.nome,
      descricao: produto.descricao,
      sku: produto.sku,
      codigo: produto.sku,
      codigoBarras: produto.codigoBarras,
      dimensoes: produto.dimensoes,
      width: produto.dimensoes?.largura ?? null,
      height: produto.dimensoes?.altura ?? null,
      depth: produto.dimensoes?.profundidade ?? null,
      categoria: categoriaNome ?? produto.categoriaId,
      subcategoria: null,
      fornecedor: produto.fornecedor ?? produto.marca ?? sourceTenantName,
      precoBase: produto.precoArqdor ?? produto.precoBase,
      precoPromocional: produto.precoPromocional,
      promocaoAtivaAte: produto.promocaoAtivaAte,
      unidade: produto.unidade,
      imagens,
      textureUrl: produto.textureUrl,
      model3dUrl: produto.model3dUrl,
      especificacoes: {
        ...((produto.projectTechnicalConfig ?? {}) as Record<string, unknown>),
        ...(produto.model3dUrl ? { model3dUrl: produto.model3dUrl } : {}),
        ...(produto.textureUrl ? { textureUrl: produto.textureUrl } : {}),
        source: "produtos_catalogo",
        sourceProductId: produto.id,
        sourceTenantId: produto.tenantId,
        sourceTenantName: sourceTenantName ?? null,
        ecosystemCatalog: !ownedByTenant,
      },
      marketplaceAvailable: produto.vendeNoArqdor,
      ativo: produto.ativo,
      createdAt: produto.createdAt,
    };
  }));
});

// POST /api/arch/catalogo
router.post("/arch/catalogo", authenticate, async (_req, res) => {
  return res.status(409).json({
    error: "Cadastro duplicado desativado. Crie o produto no Catálogo Comercial; a Biblioteca de Projeto usa o mesmo produto mestre.",
    source: "produtos_catalogo",
  });
});

// POST /api/arch/catalogo/sync-source/:sourceProductId
// Garante que o produto do catálogo comercial tenha uma representação técnica
// única no Arqdor. O cadastro comercial continua sendo a fonte de nome/preço/imagens.
router.post("/arch/catalogo/sync-source/:sourceProductId", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const sourceProductId = String(req.params.sourceProductId);
  const [source] = await db.select()
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.id, sourceProductId),
      eq(produtosCatalogoTable.tenantId, tid),
    ))
    .limit(1);
  if (!source) return res.status(404).json({ error: "Produto mestre não encontrado." });

  return res.json({
    id: source.id,
    sourceProductId: source.id,
    nome: source.nome,
    descricao: source.descricao,
    width: source.dimensoes?.largura ?? null,
    height: source.dimensoes?.altura ?? null,
    depth: source.dimensoes?.profundidade ?? null,
    sku: source.sku,
    codigo: source.sku,
    codigoBarras: source.codigoBarras,
    dimensoes: source.dimensoes,
    width: source.dimensoes?.largura ?? null,
    height: source.dimensoes?.altura ?? null,
    depth: source.dimensoes?.profundidade ?? null,
    fornecedor: source.fornecedor ?? source.marca,
    precoBase: source.precoBase,
    unidade: source.unidade,
    imagens: Array.from(new Set([
      source.imagemUrl,
      ...((source.imagens as string[] | null) ?? []),
    ].filter((value): value is string => Boolean(value)))),
    model3dUrl: source.model3dUrl,
    textureUrl: source.textureUrl,
    especificacoes: {
      ...((source.projectTechnicalConfig ?? {}) as Record<string, unknown>),
      ...(source.model3dUrl ? { model3dUrl: source.model3dUrl } : {}),
      ...(source.textureUrl ? { textureUrl: source.textureUrl } : {}),
      source: "produtos_catalogo",
      sourceProductId: source.id,
    },
    ativo: source.ativo,
  });
});

// POST /api/arch/catalogo/:id/resolve-real-model
// Resolve um item 3D AUTO e persiste o resultado no catálogo do tenant.
router.post("/arch/catalogo/:id/resolve-real-model", authenticate, async (req, res) => {
  const id = String(req.params.id);
  const tid = tenantId(req);

  const [produto] = await db.select()
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.id, id),
      eq(produtosCatalogoTable.tenantId, tid),
      eq(produtosCatalogoTable.ativo, true),
    ))
    .limit(1);

  if (!produto) return res.status(404).json({ error: "Produto mestre não encontrado." });
  if (produto.model3dUrl) {
    return res.json({
      id: produto.id,
      model3dUrl: produto.model3dUrl,
      thumbnailUrl: produto.imagemUrl ?? (produto.imagens as string[] | null)?.[0] ?? null,
      polyHavenSlug: typeof produto.projectTechnicalConfig?.polyHavenSlug === "string"
        ? produto.projectTechnicalConfig.polyHavenSlug
        : null,
      cached: true,
    });
  }

  const specs = (produto.projectTechnicalConfig ?? {}) as Record<string, unknown>;
  const query = typeof specs.polyHavenQuery === "string" ? specs.polyHavenQuery.trim() : "";
  if (!query) return res.status(400).json({ error: "Este produto não possui estratégia automática de modelo 3D." });

  try {
    const candidates = await searchPolyHavenModels(query, 6);
    for (const candidate of candidates.slice(0, 4)) {
      try {
        const asset = await resolvePolyHavenModel(candidate.slug);
        if (!asset.model3dUrl) continue;

        const nextConfig = {
          ...specs,
          modelLabel: asset.name,
          modelLicense: "CC0",
          modelSource: "Poly Haven",
          polyHavenSlug: candidate.slug,
          lod: "real-remote",
          source: "arqdor-auto-polyhaven",
          autoResolvedFromQuery: query,
          autoResolvedAt: new Date().toISOString(),
        };
        const thumbnailUrl = asset.thumbnailUrl ?? candidate.thumbnailUrl ?? null;
        const nextImages = thumbnailUrl
          ? Array.from(new Set([
              thumbnailUrl,
              ...((produto.imagens as string[] | null) ?? []),
            ])).slice(0, 8)
          : (produto.imagens as string[] | null) ?? [];

        const [updated] = await db.update(produtosCatalogoTable)
          .set({
            model3dUrl: asset.model3dUrl,
            projectTechnicalConfig: nextConfig,
            imagens: nextImages,
            updatedAt: new Date(),
          })
          .where(and(
            eq(produtosCatalogoTable.id, id),
            eq(produtosCatalogoTable.tenantId, tid),
          ))
          .returning();

        return res.json({
          id: updated.id,
          model3dUrl: updated.model3dUrl,
          thumbnailUrl,
          polyHavenSlug: candidate.slug,
          modelLabel: asset.name,
          source: "Poly Haven",
          license: "CC0",
          cached: false,
        });
      } catch {
        // Tenta o próximo candidato sem quebrar o produto mestre.
      }
    }

    return res.status(404).json({ error: "Nenhum modelo 3D compatível foi encontrado para este produto." });
  } catch (error) {
    console.error("[arqdor/catalogo/resolve-real-model]", error);
    return res.status(502).json({ error: "Não foi possível resolver o modelo 3D automático agora." });
  }
});

// POST /api/arch/catalogo/:id/imagens — compatibilidade: grava na galeria do produto mestre
router.post(
  "/arch/catalogo/:id/imagens",
  authenticate,
  upload.array("imagens", 5),
  async (req, res) => {
    const id = String(req.params.id);
    const tid = tenantId(req);

    const [produto] = await db.select()
      .from(produtosCatalogoTable)
      .where(and(
        eq(produtosCatalogoTable.id, id),
        eq(produtosCatalogoTable.tenantId, tid),
      ))
      .limit(1);
    if (!produto) return res.status(404).json({ error: "Produto mestre não encontrado." });

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) return res.status(400).json({ error: "Nenhuma imagem enviada." });

    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) return res.status(500).json({ error: "PRIVATE_OBJECT_DIR não configurado." });

    const uploadedUrls: string[] = [];
    for (const file of files) {
      const ts = Date.now();
      const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "jpg";
      const objectPath = `${privateDir}/catalog-products/${tid}/${id}/${ts}.${ext}`;
      const parts = objectPath.replace(/^\//, "").split("/");
      const bucketName = parts[0]!;
      const objectName = parts.slice(1).join("/");
      const bucket = objectStorageClient.bucket(bucketName);
      const gcsFile = bucket.file(objectName);
      await gcsFile.save(file.buffer, { contentType: file.mimetype, resumable: false });
      uploadedUrls.push(`/api/storage/objects/catalog-products/${tid}/${id}/${ts}.${ext}`);
    }

    const existingImages = [
      produto.imagemUrl,
      ...((produto.imagens as string[] | null) ?? []),
    ].filter((value): value is string => Boolean(value));
    const newImages = Array.from(new Set([...existingImages, ...uploadedUrls])).slice(0, 20);

    const [updated] = await db.update(produtosCatalogoTable)
      .set({
        imagemUrl: produto.imagemUrl ?? newImages[0] ?? null,
        imagens: newImages,
        updatedAt: new Date(),
      })
      .where(and(
        eq(produtosCatalogoTable.id, id),
        eq(produtosCatalogoTable.tenantId, tid),
      ))
      .returning();

    return res.json(updated);
  },
);

// PATCH /api/arch/catalogo/:id
router.patch("/arch/catalogo/:id", authenticate, async (req, res) => {
  const id = String(req.params.id);
  const tid = tenantId(req);

  const [master] = await db.select()
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.id, id),
      eq(produtosCatalogoTable.tenantId, tid),
    ))
    .limit(1);

  if (master) {
    const legacySpecs = req.body?.especificacoes && typeof req.body.especificacoes === "object"
      ? req.body.especificacoes as Record<string, unknown>
      : null;
    const nextTechnical = legacySpecs
      ? Object.fromEntries(Object.entries(legacySpecs).filter(([key]) => !["model3dUrl", "textureUrl", "source", "sourceProductId"].includes(key)))
      : undefined;

    const [updated] = await db.update(produtosCatalogoTable)
      .set({
        ...(req.body?.ativo !== undefined ? { ativo: Boolean(req.body.ativo) } : {}),
        ...(legacySpecs && "model3dUrl" in legacySpecs
          ? { model3dUrl: typeof legacySpecs.model3dUrl === "string" ? legacySpecs.model3dUrl : null }
          : {}),
        ...(legacySpecs && "textureUrl" in legacySpecs
          ? { textureUrl: typeof legacySpecs.textureUrl === "string" ? legacySpecs.textureUrl : null }
          : {}),
        ...(nextTechnical ? { projectTechnicalConfig: nextTechnical } : {}),
        updatedAt: new Date(),
      })
      .where(and(
        eq(produtosCatalogoTable.id, id),
        eq(produtosCatalogoTable.tenantId, tid),
      ))
      .returning();
    return res.json(updated);
  }

  const [existing] = await db.select({ tenantId: archCatalogoTable.tenantId })
    .from(archCatalogoTable)
    .where(eq(archCatalogoTable.id, id))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Produto não encontrado." });
  if (!canAccessTenant(req, existing.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchCatalogoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [updated] = await db.update(archCatalogoTable)
    .set(parsed.data as any)
    .where(eq(archCatalogoTable.id, id))
    .returning();
  return res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// Material Library — materiais/texturas separados do catálogo de produtos
// ─────────────────────────────────────────────────────────────────────────────

function normalizeMaterialMasterKey(input: {
  fabricante: string;
  linha: string;
  nome: string;
  referencia?: string | null;
}) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return [
    normalize(input.fabricante),
    normalize(input.linha),
    normalize(input.referencia?.trim() || input.nome),
  ].join("::");
}

function materialQualityScore(width: number, height: number) {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const resolutionScore = Math.min(70, (shortSide / 2048) * 70);
  const ratio = longSide / Math.max(1, shortSide);
  const geometryScore = ratio <= 1.25 ? 30 : ratio <= 1.75 ? 24 : ratio <= 2.5 ? 16 : 8;
  return Math.round(Math.min(100, resolutionScore + geometryScore) * 100) / 100;
}

async function materialAccessible(materialId: string, tid: string) {
  const [material] = await db
    .select()
    .from(archMaterialsTable)
    .where(and(eq(archMaterialsTable.id, materialId), eq(archMaterialsTable.ativo, true)))
    .limit(1);

  if (!material) return null;
  if (material.ownerTenantId === tid || material.compartilhamento === "publico") return material;

  const [access] = await db
    .select({ id: archMaterialTenantAccessTable.id })
    .from(archMaterialTenantAccessTable)
    .where(and(
      eq(archMaterialTenantAccessTable.materialId, materialId),
      eq(archMaterialTenantAccessTable.tenantId, tid),
    ))
    .limit(1);

  return access ? material : null;
}

// GET /api/arch/materials
router.get("/arch/materials", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { categoria, fabricante, busca, limit = "60", offset = "0" } =
    req.query as Record<string, string | undefined>;

  const conditions = [
    eq(archMaterialsTable.ativo, true),
    or(
      eq(archMaterialsTable.ownerTenantId, tid),
      eq(archMaterialsTable.compartilhamento, "publico"),
      sql`exists (
        select 1 from arch_material_tenant_access a
        where a.material_id = ${archMaterialsTable.id}
          and a.tenant_id = ${tid}
      )`,
    )!,
  ];
  if (categoria) conditions.push(eq(archMaterialsTable.categoria, categoria));
  if (fabricante) conditions.push(ilike(archMaterialsTable.fabricante, `%${fabricante}%`));
  if (busca) {
    conditions.push(or(
      ilike(archMaterialsTable.nome, `%${busca}%`),
      ilike(archMaterialsTable.fabricante, `%${busca}%`),
      ilike(archMaterialsTable.linha, `%${busca}%`),
    )!);
  }

  const materials = await db
    .select()
    .from(archMaterialsTable)
    .where(and(...conditions))
    .orderBy(archMaterialsTable.categoria, archMaterialsTable.fabricante, archMaterialsTable.linha, archMaterialsTable.nome)
    .limit(Math.min(200, Number(limit) || 60))
    .offset(Math.max(0, Number(offset) || 0));

  const ids = materials.map((m) => m.id);
  const images = ids.length
    ? await db.select().from(archMaterialImagesTable)
        .where(and(inArray(archMaterialImagesTable.materialId, ids), eq(archMaterialImagesTable.status, "ativa")))
        .orderBy(desc(archMaterialImagesTable.qualityScore), desc(archMaterialImagesTable.createdAt))
    : [];

  const imagesByMaterial = new Map<string, typeof images>();
  for (const image of images) {
    const current = imagesByMaterial.get(image.materialId) ?? [];
    current.push(image);
    imagesByMaterial.set(image.materialId, current);
  }

  // Capa visual obrigatória: quando um material ainda não possui uma imagem
  // própria na Biblioteca, reaproveitamos a melhor referência visual do
  // produto mestre ao qual ele está vinculado. Isso evita cards vazios sem
  // duplicar imagem/cadastro e mantém o produto mestre como fonte única.
  const materialsWithoutImages = materials
    .filter((material) => !(imagesByMaterial.get(material.id)?.length))
    .map((material) => material.id);

  const fallbackCoverByMaterial = new Map<string, string>();
  if (materialsWithoutImages.length) {
    const links = await db
      .select({
        materialId: archCatalogProductMaterialsTable.materialId,
        masterProductId: archCatalogProductMaterialsTable.masterProductId,
      })
      .from(archCatalogProductMaterialsTable)
      .where(and(
        eq(archCatalogProductMaterialsTable.tenantId, tid),
        eq(archCatalogProductMaterialsTable.ativo, true),
        inArray(archCatalogProductMaterialsTable.materialId, materialsWithoutImages),
      ));

    const masterProductIds = Array.from(new Set(
      links
        .map((link) => link.masterProductId)
        .filter((id): id is string => Boolean(id)),
    ));

    if (masterProductIds.length) {
      const products = await db
        .select({
          id: produtosCatalogoTable.id,
          textureUrl: produtosCatalogoTable.textureUrl,
          imagemUrl: produtosCatalogoTable.imagemUrl,
          imagens: produtosCatalogoTable.imagens,
        })
        .from(produtosCatalogoTable)
        .where(and(
          inArray(produtosCatalogoTable.id, masterProductIds),
          eq(produtosCatalogoTable.ativo, true),
        ));

      const productsById = new Map(products.map((product) => [product.id, product]));
      for (const link of links) {
        if (!link.masterProductId || fallbackCoverByMaterial.has(link.materialId)) continue;
        const product = productsById.get(link.masterProductId);
        if (!product) continue;
        const gallery = Array.isArray(product.imagens) ? product.imagens : [];
        const cover = product.textureUrl ?? product.imagemUrl ?? gallery.find(Boolean) ?? null;
        if (cover) fallbackCoverByMaterial.set(link.materialId, cover);
      }
    }
  }

  return res.json(materials.map((material) => {
    const materialImages = imagesByMaterial.get(material.id) ?? [];
    const directCover =
      materialImages.find((image) => image.id === material.primaryImageId)?.storageUrl ??
      materialImages[0]?.storageUrl ??
      null;

    return {
      ...material,
      images: materialImages,
      coverImageUrl: directCover ?? fallbackCoverByMaterial.get(material.id) ?? null,
    };
  }));
});

// POST /api/arch/materials
// Global deduplication: fabricante + linha + referencia (ou nome) gera um único master.
router.post("/arch/materials", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const parsed = insertArchMaterialSchema.safeParse({ ...req.body, ownerTenantId: tid });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const masterKey = normalizeMaterialMasterKey(parsed.data);
  const [existing] = await db
    .select()
    .from(archMaterialsTable)
    .where(eq(archMaterialsTable.masterKey, masterKey))
    .limit(1);

  if (existing) {
    await db.insert(archMaterialTenantAccessTable)
      .values({ materialId: existing.id, tenantId: tid, role: existing.ownerTenantId === tid ? "owner" : "linked" })
      .onConflictDoNothing();

    const images = await db.select().from(archMaterialImagesTable)
      .where(and(eq(archMaterialImagesTable.materialId, existing.id), eq(archMaterialImagesTable.status, "ativa")))
      .orderBy(desc(archMaterialImagesTable.qualityScore), desc(archMaterialImagesTable.createdAt));

    return res.status(200).json({ ...existing, images, duplicate: true });
  }

  const [material] = await db.insert(archMaterialsTable)
    .values({ ...(parsed.data as any), masterKey })
    .returning();

  await db.insert(archMaterialTenantAccessTable)
    .values({ materialId: material.id, tenantId: tid, role: "owner" })
    .onConflictDoNothing();

  return res.status(201).json({ ...material, images: [], duplicate: false });
});

// PATCH /api/arch/materials/:id
router.patch("/arch/materials/:id", authenticate, async (req, res) => {
  const id = String(req.params.id);
  const tid = tenantId(req);

  const [existing] = await db.select().from(archMaterialsTable)
    .where(eq(archMaterialsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Material não encontrado." });
  if (existing.ownerTenantId !== tid) {
    return res.status(403).json({ error: "Somente o proprietário do material pode editar os dados mestres." });
  }

  const parsed = updateArchMaterialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const mergedIdentity = {
    fabricante: parsed.data.fabricante ?? existing.fabricante,
    linha: parsed.data.linha ?? existing.linha,
    nome: parsed.data.nome ?? existing.nome,
    referencia: parsed.data.referencia ?? existing.referencia,
  };
  const masterKey = normalizeMaterialMasterKey(mergedIdentity);

  const [duplicate] = await db.select({ id: archMaterialsTable.id })
    .from(archMaterialsTable)
    .where(and(eq(archMaterialsTable.masterKey, masterKey), ne(archMaterialsTable.id, id)))
    .limit(1);
  if (duplicate) {
    return res.status(409).json({ error: "Já existe um material com este fabricante, linha e referência/nome.", existingId: duplicate.id });
  }

  const [updated] = await db.update(archMaterialsTable)
    .set({ ...(parsed.data as any), masterKey, updatedAt: new Date() })
    .where(eq(archMaterialsTable.id, id))
    .returning();

  return res.json(updated);
});

// POST /api/arch/materials/:id/images
// Permite várias imagens por material. Imagem mínima: 1024px no menor lado.
// A melhor imagem é promovida automaticamente, mas pode ser escolhida manualmente depois.
router.post(
  "/arch/materials/:id/images",
  authenticate,
  upload.array("imagens", 5),
  async (req, res) => {
    const id = String(req.params.id);
    const tid = tenantId(req);
    const material = await materialAccessible(id, tid);
    if (!material) return res.status(404).json({ error: "Material não encontrado ou sem acesso." });

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) return res.status(400).json({ error: "Nenhuma imagem enviada." });

    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) return res.status(500).json({ error: "PRIVATE_OBJECT_DIR não configurado." });

    const createdImages: any[] = [];
    for (const file of files) {
      if (!allowed.has(file.mimetype)) {
        return res.status(400).json({ error: `Formato inválido em ${file.originalname}. Use JPG, PNG ou WebP.` });
      }

      const metadata = await sharp(file.buffer).metadata();
      const sourceWidth = metadata.width ?? 0;
      const sourceHeight = metadata.height ?? 0;
      if (!sourceWidth || !sourceHeight) {
        return res.status(400).json({ error: `${file.originalname}: não foi possível identificar as dimensões da imagem.` });
      }

      // Nunca bloquear o cadastro por baixa resolução. Quando necessário,
      // fazemos uma melhoria técnica conservadora antes de salvar, preservando
      // proporção, cores e desenho do material. O alvo de 2048 px no menor lado
      // deixa a textura mais adequada para render sem inventar conteúdo.
      const sourceShortSide = Math.min(sourceWidth, sourceHeight);
      const shouldEnhance = sourceShortSide < 1024;
      let outputBuffer = file.buffer;
      let width = sourceWidth;
      let height = sourceHeight;

      if (shouldEnhance) {
        const scale = 2048 / sourceShortSide;
        width = Math.round(sourceWidth * scale);
        height = Math.round(sourceHeight * scale);
        outputBuffer = await sharp(file.buffer)
          .resize({
            width,
            height,
            fit: "fill",
            kernel: sharp.kernel.lanczos3,
          })
          .sharpen({ sigma: 0.7 })
          .toBuffer();
      }

      const imageId = crypto.randomUUID();
      const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
      const objectPath = `${privateDir}/arch-materials/${id}/${imageId}.${ext}`;
      const parts = objectPath.replace(/^\//, "").split("/");
      const bucketName = parts[0]!;
      const objectName = parts.slice(1).join("/");
      await objectStorageClient.bucket(bucketName).file(objectName).save(outputBuffer, {
        contentType: file.mimetype,
        resumable: false,
      });

      const storageUrl = `/api/storage/objects/arch-materials/${id}/${imageId}.${ext}`;
      const score = materialQualityScore(width, height);
      const [imageRow] = await db.insert(archMaterialImagesTable).values({
        id: imageId,
        materialId: id,
        contributorTenantId: tid,
        storageUrl,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        width,
        height,
        fileSize: outputBuffer.length,
        qualityScore: String(score),
        status: "ativa",
      }).returning();
      createdImages.push(imageRow);
    }

    const allImages = await db.select().from(archMaterialImagesTable)
      .where(and(eq(archMaterialImagesTable.materialId, id), eq(archMaterialImagesTable.status, "ativa")))
      .orderBy(desc(archMaterialImagesTable.qualityScore), desc(archMaterialImagesTable.createdAt));

    const best = allImages[0];
    if (best && best.id !== material.primaryImageId) {
      await db.update(archMaterialsTable)
        .set({ primaryImageId: best.id, updatedAt: new Date() })
        .where(eq(archMaterialsTable.id, id));
    }

    return res.status(201).json({
      created: createdImages,
      images: allImages,
      primaryImageId: best?.id ?? material.primaryImageId ?? null,
      qualityRule: { minimumShortSidePx: 1024, recommendedShortSidePx: 2048, autoEnhanceBelowMinimum: true },
    });
  },
);

// PATCH /api/arch/materials/:id/primary-image
router.patch("/arch/materials/:id/primary-image", authenticate, async (req, res) => {
  const id = String(req.params.id);
  const tid = tenantId(req);
  const material = await materialAccessible(id, tid);
  if (!material) return res.status(404).json({ error: "Material não encontrado ou sem acesso." });

  const imageId = String(req.body?.imageId ?? "");
  const [image] = await db.select().from(archMaterialImagesTable)
    .where(and(eq(archMaterialImagesTable.id, imageId), eq(archMaterialImagesTable.materialId, id), eq(archMaterialImagesTable.status, "ativa")))
    .limit(1);
  if (!image) return res.status(400).json({ error: "Imagem inválida para este material." });

  const [updated] = await db.update(archMaterialsTable)
    .set({ primaryImageId: imageId, updatedAt: new Date() })
    .where(eq(archMaterialsTable.id, id))
    .returning();

  return res.json({ material: updated, primaryImage: image });
});

// GET /api/arch/catalogo/:id/materials — materiais/acabamentos permitidos no produto
router.patch("/arch/catalogo/:id/technical", authenticate, async (req, res) => {
  const productId = String(req.params.id);
  const tid = tenantId(req);
  const parsed = z.object({
    model3dUrl: z.string().max(4000).nullable().optional(),
    textureUrl: z.string().max(4000).nullable().optional(),
    projectLibraryEnabled: z.boolean().optional(),
    projectTechnicalConfig: z.record(z.string(), z.unknown()).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [product] = await db.select()
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.id, productId),
      eq(produtosCatalogoTable.tenantId, tid),
    ))
    .limit(1);
  if (!product) return res.status(404).json({ error: "Produto mestre não encontrado." });

  const [updated] = await db.update(produtosCatalogoTable)
    .set({
      ...(parsed.data.model3dUrl !== undefined ? { model3dUrl: parsed.data.model3dUrl } : {}),
      ...(parsed.data.textureUrl !== undefined ? { textureUrl: parsed.data.textureUrl } : {}),
      ...(parsed.data.projectLibraryEnabled !== undefined ? { projectLibraryEnabled: parsed.data.projectLibraryEnabled } : {}),
      ...(parsed.data.projectTechnicalConfig !== undefined ? { projectTechnicalConfig: parsed.data.projectTechnicalConfig } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(produtosCatalogoTable.id, productId),
      eq(produtosCatalogoTable.tenantId, tid),
    ))
    .returning();

  return res.json(updated);
});

// GET /api/arch/catalogo/:id/materials — materiais do mesmo produto mestre
router.get("/arch/catalogo/:id/materials", authenticate, async (req, res) => {
  const productId = String(req.params.id);
  const tid = tenantId(req);

  const [product] = await db.select({ id: produtosCatalogoTable.id })
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.id, productId),
      eq(produtosCatalogoTable.tenantId, tid),
      eq(produtosCatalogoTable.ativo, true),
    ))
    .limit(1);
  if (!product) return res.status(404).json({ error: "Produto mestre não encontrado." });

  const links = await db.select()
    .from(archCatalogProductMaterialsTable)
    .where(and(
      eq(archCatalogProductMaterialsTable.tenantId, tid),
      eq(archCatalogProductMaterialsTable.masterProductId, productId),
      eq(archCatalogProductMaterialsTable.ativo, true),
    ))
    .orderBy(archCatalogProductMaterialsTable.grupo, archCatalogProductMaterialsTable.surfaceKey);

  const materialIds = links.map((link) => link.materialId);
  const materials = materialIds.length
    ? await db.select().from(archMaterialsTable).where(inArray(archMaterialsTable.id, materialIds))
    : [];
  const primaryImageIds = materials.map((material) => material.primaryImageId).filter(Boolean) as string[];
  const primaryImages = primaryImageIds.length
    ? await db.select().from(archMaterialImagesTable).where(inArray(archMaterialImagesTable.id, primaryImageIds))
    : [];
  const byId = new Map(materials.map((material) => [material.id, material]));
  const imageById = new Map(primaryImages.map((image) => [image.id, image]));

  return res.json(links.map((link) => {
    const material = byId.get(link.materialId) ?? null;
    return {
      ...link,
      productId,
      material: material
        ? {
            ...material,
            primaryImage: material.primaryImageId ? imageById.get(material.primaryImageId) ?? null : null,
          }
        : null,
    };
  }));
});

// POST /api/arch/catalogo/:id/model-surfaces — persiste partes no produto mestre
router.post("/arch/catalogo/:id/model-surfaces", authenticate, async (req, res) => {
  const productId = String(req.params.id);
  const tid = tenantId(req);
  const body = z.object({
    model3dUrl: z.string().min(1).optional(),
    surfaces: z.array(z.object({
      key: z.string().min(1).max(180),
      label: z.string().min(1).max(255),
      nodeName: z.string().max(255).optional(),
      materialName: z.string().max(255).optional(),
      meshCount: z.number().int().min(1).max(500).default(1),
    })).min(1).max(100),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const [product] = await db.select()
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.id, productId),
      eq(produtosCatalogoTable.tenantId, tid),
      eq(produtosCatalogoTable.ativo, true),
    ))
    .limit(1);
  if (!product) return res.status(404).json({ error: "Produto mestre não encontrado." });

  const previous = (product.projectTechnicalConfig ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(previous.modelSurfaces)
    ? previous.modelSurfaces as Array<Record<string, unknown>>
    : [];
  const previousByKey = new Map(existing.map((surface) => [String(surface.key ?? ""), surface]));
  const modelSurfaces = body.data.surfaces.map((surface) => ({
    ...previousByKey.get(surface.key),
    ...surface,
    detected: true,
  }));
  const nextConfig = {
    ...previous,
    modelSurfaces,
    modelSurfacesDetectedAt: new Date().toISOString(),
  };

  const [updated] = await db.update(produtosCatalogoTable)
    .set({
      projectTechnicalConfig: nextConfig,
      ...(body.data.model3dUrl ? { model3dUrl: body.data.model3dUrl } : {}),
      updatedAt: new Date(),
    })
    .where(and(
      eq(produtosCatalogoTable.id, productId),
      eq(produtosCatalogoTable.tenantId, tid),
    ))
    .returning();

  return res.json({
    productId,
    modelSurfaces,
    model3dUrl: updated.model3dUrl,
    projectTechnicalConfig: updated.projectTechnicalConfig,
  });
});

// POST /api/arch/catalogo/:id/materials — vínculo direto com produto mestre
router.post("/arch/catalogo/:id/materials", authenticate, async (req, res) => {
  const productId = String(req.params.id);
  const tid = tenantId(req);
  const parsed = insertArchCatalogProductMaterialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [product] = await db.select({ id: produtosCatalogoTable.id })
    .from(produtosCatalogoTable)
    .where(and(
      eq(produtosCatalogoTable.id, productId),
      eq(produtosCatalogoTable.tenantId, tid),
      eq(produtosCatalogoTable.ativo, true),
    ))
    .limit(1);
  if (!product) return res.status(404).json({ error: "Produto mestre não encontrado." });

  const material = await materialAccessible(parsed.data.materialId, tid);
  if (!material) return res.status(404).json({ error: "Material não encontrado ou sem acesso." });

  if (parsed.data.isDefault) {
    await db.update(archCatalogProductMaterialsTable)
      .set({ isDefault: false })
      .where(and(
        eq(archCatalogProductMaterialsTable.tenantId, tid),
        eq(archCatalogProductMaterialsTable.masterProductId, productId),
        parsed.data.surfaceKey
          ? eq(archCatalogProductMaterialsTable.surfaceKey, parsed.data.surfaceKey)
          : sql`${archCatalogProductMaterialsTable.surfaceKey} is null`,
      ));
  }

  const [link] = await db.insert(archCatalogProductMaterialsTable)
    .values({
      ...(parsed.data as any),
      tenantId: tid,
      masterProductId: productId,
      productId: null,
    })
    .onConflictDoNothing()
    .returning();

  if (!link) {
    const [existingLink] = await db.select().from(archCatalogProductMaterialsTable)
      .where(and(
        eq(archCatalogProductMaterialsTable.tenantId, tid),
        eq(archCatalogProductMaterialsTable.masterProductId, productId),
        eq(archCatalogProductMaterialsTable.materialId, parsed.data.materialId),
        parsed.data.surfaceKey
          ? eq(archCatalogProductMaterialsTable.surfaceKey, parsed.data.surfaceKey)
          : sql`${archCatalogProductMaterialsTable.surfaceKey} is null`,
      ))
      .limit(1);
    if (existingLink && parsed.data.isDefault && !existingLink.isDefault) {
      const [updated] = await db.update(archCatalogProductMaterialsTable)
        .set({ isDefault: true })
        .where(eq(archCatalogProductMaterialsTable.id, existingLink.id))
        .returning();
      return res.status(200).json({ ...updated, productId, duplicate: true });
    }
    return res.status(200).json({ ...existingLink, productId, duplicate: true });
  }

  return res.status(201).json({ ...link, productId, duplicate: false });
});

router.delete("/arch/catalogo/:id/materials/:linkId", authenticate, async (req, res) => {
  const productId = String(req.params.id);
  const linkId = String(req.params.linkId);
  const tid = tenantId(req);

  const [deleted] = await db.delete(archCatalogProductMaterialsTable)
    .where(and(
      eq(archCatalogProductMaterialsTable.id, linkId),
      eq(archCatalogProductMaterialsTable.masterProductId, productId),
      eq(archCatalogProductMaterialsTable.tenantId, tid),
    ))
    .returning({ id: archCatalogProductMaterialsTable.id });

  if (!deleted) return res.status(404).json({ error: "Vínculo não encontrado." });
  return res.json({ ok: true, id: deleted.id });
});

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/arch/marketplace
router.get("/arch/marketplace", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { categoria, precoMin, precoMax, busca, limit = "20", offset = "0" } =
    req.query as Record<string, string | undefined>;

  const conditions = [
    eq(archMarketplaceItemsTable.ativo, true),
    ne(archMarketplaceItemsTable.vendedorTenantId, tid),
  ];
  if (categoria) conditions.push(eq(archMarketplaceItemsTable.categoria, categoria));
  if (busca)     conditions.push(ilike(archMarketplaceItemsTable.nome, `%${busca}%`));
  if (precoMin)  conditions.push(gte(archMarketplaceItemsTable.preco, precoMin));
  if (precoMax)  conditions.push(lte(archMarketplaceItemsTable.preco, precoMax));

  const items = await db
    .select()
    .from(archMarketplaceItemsTable)
    .where(and(...conditions))
    .orderBy(desc(archMarketplaceItemsTable.totalVendas))
    .limit(Number(limit))
    .offset(Number(offset));

  return res.json(items);
});

// GET /api/arch/marketplace/meus-produtos
router.get("/arch/marketplace/meus-produtos", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const items = await db
    .select()
    .from(archMarketplaceItemsTable)
    .where(eq(archMarketplaceItemsTable.vendedorTenantId, tid))
    .orderBy(desc(archMarketplaceItemsTable.createdAt));

  return res.json(items);
});

// GET /api/arch/marketplace/pedidos
router.get("/arch/marketplace/pedidos", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const pedidos = await db
    .select()
    .from(archMarketplacePedidosTable)
    .where(eq(archMarketplacePedidosTable.compradorTenantId, tid))
    .orderBy(desc(archMarketplacePedidosTable.createdAt));

  return res.json(pedidos);
});

// GET /api/arch/marketplace/vendas
router.get("/arch/marketplace/vendas", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const vendas = await db
    .select({
      pedido:    archMarketplacePedidosTable,
      itemNome:  archMarketplaceItemsTable.nome,
    })
    .from(archMarketplacePedidosTable)
    .innerJoin(
      archMarketplaceItemsTable,
      eq(archMarketplacePedidosTable.itemId, archMarketplaceItemsTable.id),
    )
    .where(eq(archMarketplaceItemsTable.vendedorTenantId, tid))
    .orderBy(desc(archMarketplacePedidosTable.createdAt));

  const totalComissoes = vendas.reduce((acc, v) => acc + Number(v.pedido.comissao ?? 0), 0);

  return res.json({ vendas, totalComissoes });
});

// POST /api/arch/marketplace
router.post("/arch/marketplace", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const bodySchema = z.object({
    nome:           z.string().min(1),
    descricao:      z.string().optional(),
    categoria:      z.string().optional(),
    preco:          z.coerce.number().nonnegative(),
    especificacoes: z.record(z.string(), z.unknown()).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [item] = await db
    .insert(archMarketplaceItemsTable)
    .values({
      vendedorTenantId: tid,
      nome:             parsed.data.nome,
      descricao:        parsed.data.descricao,
      categoria:        parsed.data.categoria,
      preco:            String(parsed.data.preco),
      especificacoes:   parsed.data.especificacoes,
    })
    .returning();

  return res.status(201).json(item);
});

// PATCH /api/arch/marketplace/:itemId
router.patch("/arch/marketplace/:itemId", authenticate, async (req, res) => {
  const itemId = String(req.params.itemId);
  const tid    = tenantId(req);

  const [item] = await db
    .select({ vendedorTenantId: archMarketplaceItemsTable.vendedorTenantId })
    .from(archMarketplaceItemsTable)
    .where(eq(archMarketplaceItemsTable.id, itemId))
    .limit(1);

  if (!item) return res.status(404).json({ error: "Produto não encontrado." });
  if (item.vendedorTenantId !== tid && !isSuperAdmin(req)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const bodySchema = z.object({
    nome:      z.string().optional(),
    descricao: z.string().optional(),
    categoria: z.string().optional(),
    preco:     z.coerce.number().nonnegative().optional(),
    ativo:     z.boolean().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updates: Record<string, unknown> = {};
  if (parsed.data.nome      !== undefined) updates.nome      = parsed.data.nome;
  if (parsed.data.descricao !== undefined) updates.descricao = parsed.data.descricao;
  if (parsed.data.categoria !== undefined) updates.categoria = parsed.data.categoria;
  if (parsed.data.preco     !== undefined) updates.preco     = String(parsed.data.preco);
  if (parsed.data.ativo     !== undefined) updates.ativo     = parsed.data.ativo;

  const [updated] = await db
    .update(archMarketplaceItemsTable)
    .set(updates)
    .where(eq(archMarketplaceItemsTable.id, itemId))
    .returning();

  return res.json(updated);
});

// POST /api/arch/marketplace/:itemId/comprar
router.post("/arch/marketplace/:itemId/comprar", authenticate, async (req, res) => {
  const itemId = String(req.params.itemId);
  const tid    = tenantId(req);

  const bodySchema = z.object({
    quantidade: z.coerce.number().positive(),
    projetoId:  z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [item] = await db
    .select()
    .from(archMarketplaceItemsTable)
    .where(and(eq(archMarketplaceItemsTable.id, itemId), eq(archMarketplaceItemsTable.ativo, true)))
    .limit(1);

  if (!item) return res.status(404).json({ error: "Produto não encontrado no marketplace." });
  if (item.vendedorTenantId === tid) {
    return res.status(400).json({ error: "Não é possível comprar o próprio produto." });
  }

  const { quantidade, projetoId } = parsed.data;
  const valorUnitario = Number(item.preco ?? 0);
  const valorTotal    = quantidade * valorUnitario;
  const comissao      = valorTotal * 0.10;

  const [pedido] = await db
    .insert(archMarketplacePedidosTable)
    .values({
      compradorTenantId: tid,
      itemId,
      projetoId:         projetoId ?? null,
      quantidade:        String(quantidade),
      valorUnitario:     String(valorUnitario),
      valorTotal:        String(valorTotal.toFixed(2)),
      comissao:          String(comissao.toFixed(2)),
    })
    .returning();

  // Incrementar totalVendas do item
  await db
    .update(archMarketplaceItemsTable)
    .set({ totalVendas: sql`${archMarketplaceItemsTable.totalVendas} + 1` })
    .where(eq(archMarketplaceItemsTable.id, itemId));

  // Se projetoId, adicionar ao orçamento do projeto
  if (projetoId) {
    const vTotal = valorTotal.toFixed(2);
    await db.insert(archOrcamentoItensTable).values({
      projetoId,
      ambienteId:    null,
      categoria:     item.categoria ?? "Marketplace",
      descricao:     item.nome,
      quantidade:    String(quantidade),
      unidade:       "un",
      valorUnitario: String(valorUnitario),
      valorTotal:    vTotal,
      fornecedor:    item.vendedorTenantId,
      produtoId:     itemId,
    });
    await recalcularOrcamentoTotal(projetoId);
  }

  // Notificar vendedor
  await db.insert(notificationsTable).values({
    tenantId: item.vendedorTenantId,
    title:    "Nova venda no Marketplace",
    message:  `Seu produto "${item.nome}" foi comprado (qtd: ${quantidade}). Valor: R$ ${valorTotal.toFixed(2)} — Comissão VendorAI: R$ ${comissao.toFixed(2)}.`,
    type:     "info",
    category: "general",
  });

  return res.status(201).json({ pedido, comissao });
});

// ─────────────────────────────────────────────────────────────────────────────
// Orçamento
// ─────────────────────────────────────────────────────────────────────────────

// Helper: recalcular orcamentoTotal do projeto
async function recalcularOrcamentoTotal(projetoId: string): Promise<void> {
  const [{ total }] = await db
    .select({ total: sum(archOrcamentoItensTable.valorTotal) })
    .from(archOrcamentoItensTable)
    .where(eq(archOrcamentoItensTable.projetoId, projetoId));

  await db
    .update(archProjetosTable)
    .set({ orcamentoTotal: total ?? "0", updatedAt: new Date() })
    .where(eq(archProjetosTable.id, projetoId));
}

// GET /api/arch/projetos/:id/orcamento
router.get("/arch/projetos/:id/orcamento", authenticate, async (req, res) => {
  const projetoId = String((req.params.id as string));

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId, orcamentoTotal: archProjetosTable.orcamentoTotal })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const itens = await db
    .select()
    .from(archOrcamentoItensTable)
    .where(eq(archOrcamentoItensTable.projetoId, projetoId));

  // Agrupar por ambienteId e categoria
  const grupos: Record<string, { ambienteId: string | null; categoria: string | null; itens: typeof itens; totalCategoria: number }> = {};
  for (const item of itens) {
    const key = `${item.ambienteId ?? "sem-ambiente"}|${item.categoria ?? "sem-categoria"}`;
    if (!grupos[key]) {
      grupos[key] = { ambienteId: item.ambienteId, categoria: item.categoria, itens: [], totalCategoria: 0 };
    }
    grupos[key].itens.push(item);
    grupos[key].totalCategoria += Number(item.valorTotal ?? 0);
  }

  return res.json({
    grupos: Object.values(grupos),
    totalGeral: Number(projeto.orcamentoTotal ?? 0),
  });
});

// POST /api/arch/projetos/:id/orcamento
router.post("/arch/projetos/:id/orcamento", authenticate, async (req, res) => {
  const projetoId = String((req.params.id as string));

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const bodySchema = z.object({
    ambienteId:    z.string().optional(),
    categoria:     z.string().optional(),
    descricao:     z.string().min(1),
    quantidade:    z.coerce.number().nonnegative(),
    unidade:       z.string().optional(),
    valorUnitario: z.coerce.number().nonnegative(),
    fornecedor:    z.string().optional(),
    produtoId:     z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { quantidade, valorUnitario, ...rest } = parsed.data;
  const valorTotal = (quantidade * valorUnitario).toFixed(2);

  const [item] = await db
    .insert(archOrcamentoItensTable)
    .values({
      projetoId,
      quantidade: String(quantidade),
      valorUnitario: String(valorUnitario),
      valorTotal,
      ...rest,
    })
    .returning();

  await recalcularOrcamentoTotal(projetoId);

  return res.status(201).json(item);
});

// PATCH /api/arch/orcamento/:itemId
router.patch("/arch/orcamento/:itemId", authenticate, async (req, res) => {
  const itemId = String(req.params.itemId);

  const [existing] = await db
    .select({
      projetoId:     archOrcamentoItensTable.projetoId,
      quantidade:    archOrcamentoItensTable.quantidade,
      valorUnitario: archOrcamentoItensTable.valorUnitario,
    })
    .from(archOrcamentoItensTable)
    .where(eq(archOrcamentoItensTable.id, itemId))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Item não encontrado." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, existing.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const parsed = updateArchOrcamentoItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const qty   = Number(parsed.data.quantidade    ?? existing.quantidade    ?? 0);
  const price = Number(parsed.data.valorUnitario ?? existing.valorUnitario ?? 0);
  const valorTotal = (qty * price).toFixed(2);

  const [updated] = await db
    .update(archOrcamentoItensTable)
    .set({ ...parsed.data, valorTotal } as any)
    .where(eq(archOrcamentoItensTable.id, itemId))
    .returning();

  await recalcularOrcamentoTotal(existing.projetoId);

  return res.json(updated);
});

// DELETE /api/arch/orcamento/:itemId
router.delete("/arch/orcamento/:itemId", authenticate, async (req, res) => {
  const itemId = String(req.params.itemId);

  const [existing] = await db
    .select({ projetoId: archOrcamentoItensTable.projetoId })
    .from(archOrcamentoItensTable)
    .where(eq(archOrcamentoItensTable.id, itemId))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Item não encontrado." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, existing.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  await db.delete(archOrcamentoItensTable).where(eq(archOrcamentoItensTable.id, itemId));
  await recalcularOrcamentoTotal(existing.projetoId);

  return res.status(204).send();
});

// POST /api/arch/orcamento/:itemId/vincular-produto
router.post("/arch/orcamento/:itemId/vincular-produto", authenticate, async (req, res) => {
  const itemId = String(req.params.itemId);

  const bodySchema = z.object({ produtoId: z.string().min(1) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [existing] = await db
    .select({
      projetoId:  archOrcamentoItensTable.projetoId,
      quantidade: archOrcamentoItensTable.quantidade,
    })
    .from(archOrcamentoItensTable)
    .where(eq(archOrcamentoItensTable.id, itemId))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Item não encontrado." });

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, existing.projetoId))
    .limit(1);

  if (!projeto || !canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const [produto] = await db
    .select({ precoBase: archCatalogoTable.precoBase, nome: archCatalogoTable.nome })
    .from(archCatalogoTable)
    .where(eq(archCatalogoTable.id, parsed.data.produtoId))
    .limit(1);

  if (!produto) return res.status(404).json({ error: "Produto não encontrado no catálogo." });

  const valorUnitario = String(produto.precoBase ?? "0");
  const valorTotal    = (Number(existing.quantidade ?? 0) * Number(valorUnitario)).toFixed(2);

  const [updated] = await db
    .update(archOrcamentoItensTable)
    .set({ produtoId: parsed.data.produtoId, valorUnitario, valorTotal })
    .where(eq(archOrcamentoItensTable.id, itemId))
    .returning();

  await recalcularOrcamentoTotal(existing.projetoId);

  return res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// IA
// ─────────────────────────────────────────────────────────────────────────────

const budgetScopeSchema = z.object({
  tipos: z.array(z.enum([
    "completo", "mobiliario", "marcenaria", "revestimentos", "reforma",
    "decoracao", "iluminacao", "eletrica", "hidraulica", "pintura", "outros",
  ])).min(1),
  observacoes: z.string().max(2000).optional().default(""),
  tratamentoExistentes: z.enum(["avaliar_individualmente", "manter", "substituir"]).optional().default("avaliar_individualmente"),
});

const BUDGET_SCOPE_LABELS: Record<string, string> = {
  completo: "Projeto completo",
  mobiliario: "Mobiliário",
  marcenaria: "Marcenaria",
  revestimentos: "Revestimentos",
  reforma: "Reforma",
  decoracao: "Decoração",
  iluminacao: "Iluminação",
  eletrica: "Elétrica",
  hidraulica: "Hidráulica",
  pintura: "Pintura",
  outros: "Outros",
};

function normalizeBudgetCategory(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function itemMatchesBudgetScope(category: unknown, description: unknown, scopeTypes: string[]): boolean {
  if (scopeTypes.includes("completo")) return true;
  const text = `${normalizeBudgetCategory(category)} ${normalizeBudgetCategory(description)}`;

  const rules: Record<string, string[]> = {
    mobiliario: ["movel", "moveis", "mobiliario", "sofa", "poltrona", "mesa", "cadeira", "cama", "estofado"],
    marcenaria: ["marcenaria", "planejado", "armario", "closet", "painel", "gabinete"],
    revestimentos: ["revestimento", "piso", "porcelanato", "ceramica", "pedra", "marmore", "granito", "acabamento"],
    reforma: ["reforma", "demolicao", "retirada", "preparacao", "regularizacao", "mao de obra", "alvenaria", "gesso", "forro"],
    decoracao: ["decoracao", "acessorio", "tapete", "cortina", "quadro", "objeto decorativo"],
    iluminacao: ["iluminacao", "luminaria", "spot", "perfil led", "fita led", "pendente", "plafon"],
    eletrica: ["eletrica", "eletrico", "tomada", "interruptor", "quadro eletrico", "ponto eletrico"],
    hidraulica: ["hidraulica", "hidraulico", "louca", "metal sanitario", "torneira", "ponto hidraulico"],
    pintura: ["pintura", "tinta", "massa corrida", "selador"],
    outros: ["outros", "outro"],
  };

  return scopeTypes.some((scope) => (rules[scope] ?? []).some((term) => text.includes(term)));
}

const iaItemSchema = z.object({
  ambiente:      z.string(),
  categoria:     z.string(),
  descricao:     z.string(),
  quantidade:    z.coerce.number(),
  unidade:       z.string(),
  valorUnitario: z.coerce.number(),
});

// POST /api/arch/projetos/:id/orcamento/gerar-ia
// Compatibilidade da rota antiga: o orçamento NÃO é mais inventado pela IA.
// Agora ele é materializado exclusivamente a partir da especificação confirmada
// do projeto, usando catálogo/preço do tenant ou override manual. Itens sem preço
// permanecem com R$ 0,00 para revisão/precificação, sem estimativa artificial.
router.post("/arch/projetos/:id/orcamento/gerar-ia", authenticate, async (req, res) => {
  const projetoId = String(req.params.id as string);

  const [projeto] = await db
    .select()
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) {
    return res.status(403).json({ error: "Acesso negado." });
  }

  const scopeParsed = budgetScopeSchema.safeParse(projeto.escopoOrcamento ?? null);
  if (!scopeParsed.success) {
    return res.status(409).json({
      error: "Defina primeiro o que será orçado para este cliente.",
      code: "ARCH_BUDGET_SCOPE_REQUIRED",
    });
  }
  const budgetScope = scopeParsed.data;

  const [spec] = await db
    .select()
    .from(archSpecificationsTable)
    .where(and(
      eq(archSpecificationsTable.tenantId, projeto.tenantId),
      eq(archSpecificationsTable.projetoId, projetoId),
    ))
    .orderBy(desc(archSpecificationsTable.createdAt))
    .limit(1);

  if (!spec) {
    return res.status(409).json({
      error: "Este projeto ainda não possui especificação. Analise e confirme os itens do ambiente antes de gerar o orçamento.",
      code: "ARCH_BUDGET_SPEC_REQUIRED",
    });
  }

  const specItems = await db
    .select()
    .from(archSpecItemsTable)
    .where(eq(archSpecItemsTable.specificationId, spec.id));

  const confirmados = specItems.filter((item) => item.status === "especificado");
  if (confirmados.length === 0) {
    return res.status(409).json({
      error: "Nenhum item da especificação foi confirmado ainda. Confirme os itens que realmente fazem parte do projeto.",
      code: "ARCH_BUDGET_SPEC_ITEMS_REQUIRED",
    });
  }

  const dentroDoEscopo = confirmados.filter((item) =>
    itemMatchesBudgetScope(item.categoria, item.overrideNome ?? item.descricao, budgetScope.tipos),
  );
  const foraDoEscopo = confirmados.length - dentroDoEscopo.length;

  if (dentroDoEscopo.length === 0) {
    const escopos = budgetScope.tipos.map((tipo) => BUDGET_SCOPE_LABELS[tipo] ?? tipo).join(", ");
    return res.status(409).json({
      error: `A especificação possui itens confirmados, mas nenhum pertence ao escopo deste cliente: ${escopos}.`,
      code: "ARCH_BUDGET_NO_ITEMS_IN_SCOPE",
    });
  }

  const catalogoIds = dentroDoEscopo
    .map((item) => item.catalogoItemId)
    .filter(Boolean) as string[];

  const catalogoItens = catalogoIds.length
    ? await db
        .select()
        .from(archCatalogoTable)
        .where(and(
          eq(archCatalogoTable.tenantId, projeto.tenantId),
          inArray(archCatalogoTable.id, catalogoIds),
        ))
    : [];

  const catalogoMap = new Map(catalogoItens.map((item) => [item.id, item]));

  // O ambiente escolhido no render/especificação é parte do contexto do item e
  // precisa sobreviver até o orçamento. A especificação histórica guarda renderId,
  // então resolvemos o ambiente a partir do render/cena e só usamos fallback
  // automático quando o projeto possui um único ambiente.
  const ambientesProjeto = await db
    .select({ id: archAmbientesTable.id, nome: archAmbientesTable.nome })
    .from(archAmbientesTable)
    .where(eq(archAmbientesTable.projetoId, projetoId));

  const normalizeEnvironmentName = (value: unknown) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const findAmbienteIdByName = (value: unknown): string | null => {
    const target = normalizeEnvironmentName(value);
    if (!target) return null;

    const exact = ambientesProjeto.find((ambiente) =>
      normalizeEnvironmentName(ambiente.nome) === target
    );
    if (exact) return exact.id;

    const compatible = ambientesProjeto.filter((ambiente) => {
      const nome = normalizeEnvironmentName(ambiente.nome);
      return nome.includes(target) || target.includes(nome);
    });
    return compatible.length === 1 ? compatible[0]!.id : null;
  };

  let ambienteIdEspecificacao: string | null = null;
  let ambienteOrigem = "nao_resolvido";

  if (spec.renderId) {
    const [aiRender] = await db
      .select({ ambiente: archAiRendersTable.ambiente })
      .from(archAiRendersTable)
      .where(and(
        eq(archAiRendersTable.id, spec.renderId),
        eq(archAiRendersTable.tenantId, projeto.tenantId),
        eq(archAiRendersTable.projectId, projetoId),
      ))
      .limit(1);

    ambienteIdEspecificacao = findAmbienteIdByName(aiRender?.ambiente);
    if (ambienteIdEspecificacao) ambienteOrigem = "ai_render";

    // Compatibilidade com renders antigos ligados a uma cena, onde o vínculo
    // com ambiente já existe como ID e não apenas como nome.
    if (!ambienteIdEspecificacao) {
      const [legacyRender] = await db
        .select({ cenaId: archRendersTable.cenaId })
        .from(archRendersTable)
        .where(eq(archRendersTable.id, spec.renderId))
        .limit(1);

      if (legacyRender?.cenaId) {
        const [cena] = await db
          .select({ ambienteId: archCenasTable.ambienteId })
          .from(archCenasTable)
          .where(and(
            eq(archCenasTable.id, legacyRender.cenaId),
            eq(archCenasTable.projetoId, projetoId),
          ))
          .limit(1);

        if (cena?.ambienteId && ambientesProjeto.some((ambiente) => ambiente.id === cena.ambienteId)) {
          ambienteIdEspecificacao = cena.ambienteId;
          ambienteOrigem = "cena";
        }
      }
    }
  }

  if (!ambienteIdEspecificacao && ambientesProjeto.length === 1) {
    ambienteIdEspecificacao = ambientesProjeto[0]!.id;
    ambienteOrigem = "ambiente_unico";
  }

  const rows = dentroDoEscopo.map((item) => {
    const catalogo = item.catalogoItemId ? catalogoMap.get(item.catalogoItemId) : undefined;
    const quantidade = Math.max(0, Number(item.quantidade ?? 1));
    const precoCatalogo = catalogo?.precoBase != null ? Number(catalogo.precoBase) : null;
    const precoOverride = item.overridePreco != null ? Number(item.overridePreco) : null;
    const valorUnitario =
      precoCatalogo != null && Number.isFinite(precoCatalogo)
        ? precoCatalogo
        : precoOverride != null && Number.isFinite(precoOverride)
          ? precoOverride
          : 0;

    const baseDescricao = catalogo?.nome ?? item.overrideNome ?? item.descricao;
    const dimensoes = [item.larguraCm, item.profundidadeCm, item.alturaCm]
      .map((value) => value != null && Number(value) > 0 ? Number(value) : null);
    const temDimensoes = dimensoes.some((value) => value != null);
    const descricaoTecnica = [
      item.codigo ? `[${item.codigo}]` : null,
      baseDescricao,
      item.modelo ? `Modelo: ${item.modelo}` : null,
      item.configuracao ? `Config.: ${item.configuracao}` : null,
      temDimensoes
        ? `Medidas (L×P×A): ${dimensoes[0] ?? "?"}×${dimensoes[1] ?? "?"}×${dimensoes[2] ?? "?"} cm`
        : null,
      item.material ? `Material: ${item.material}` : null,
      item.acabamento ? `Acabamento: ${item.acabamento}` : null,
      item.cor ? `Cor: ${item.cor}` : null,
    ].filter(Boolean).join(" · ");

    return {
      projetoId,
      ambienteId: ambienteIdEspecificacao,
      categoria: item.categoria,
      descricao: descricaoTecnica,
      quantidade: String(quantidade),
      unidade: catalogo?.unidade ?? item.unidadeQuantificacao ?? "un",
      valorUnitario: valorUnitario.toFixed(2),
      valorTotal: (quantidade * valorUnitario).toFixed(2),
      fornecedor: catalogo?.fornecedor ?? item.fabricante ?? item.overrideFornecedor ?? null,
      produtoId: catalogo?.id ?? null,
      geradoPorIa: true,
    };
  });

  // Regenerar substitui apenas as linhas derivadas automaticamente.
  // Itens manuais do orçamento são preservados.
  await db
    .delete(archOrcamentoItensTable)
    .where(and(
      eq(archOrcamentoItensTable.projetoId, projetoId),
      eq(archOrcamentoItensTable.geradoPorIa, true),
    ));

  const inseridos = rows.length
    ? await db.insert(archOrcamentoItensTable).values(rows).returning()
    : [];

  await recalcularOrcamentoTotal(projetoId);

  const semPreco = rows.filter((item) => Number(item.valorUnitario) <= 0).length;

  req.log.info(
    {
      tenantId: projeto.tenantId,
      projetoId,
      specificationId: spec.id,
      ambienteId: ambienteIdEspecificacao,
      ambienteOrigem,
      itensConfirmados: confirmados.length,
      itensDentroDoEscopo: dentroDoEscopo.length,
      itensForaDoEscopo: foraDoEscopo,
      itensCriados: inseridos.length,
      semPreco,
    },
    "arch/orcamento: orçamento regenerado a partir da especificação confirmada",
  );

  return res.status(201).json({
    count: inseridos.length,
    itens: inseridos,
    specificationId: spec.id,
    semPreco,
    fonte: "especificacao_confirmada",
    escopo: budgetScope.tipos,
    foraDoEscopo,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolver tenantId a partir do cenaId
// ─────────────────────────────────────────────────────────────────────────────
async function getCenaTenant(cenaId: string): Promise<{ cena: typeof archCenasTable.$inferSelect; tenantId: string; projetoNome: string | null } | null> {
  const [cena] = await db
    .select()
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return null;

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId, titulo: archProjetosTable.titulo })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, cena.projetoId))
    .limit(1);

  if (!projeto) return null;

  return { cena, tenantId: projeto.tenantId, projetoNome: projeto.titulo ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arch/cenas/:cenaId/versoes (autenticado)
// Listar versões de render ordenadas por versao desc
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/cenas/:cenaId/versoes", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const ctx = await getCenaTenant(cenaId);
  if (!ctx) return res.status(404).json({ error: "Cena não encontrada." });
  if (!canAccessTenant(req, ctx.tenantId)) return res.status(403).json({ error: "Acesso negado." });

  const versoes = await db
    .select({
      id:        archRenderVersoesTable.id,
      versao:    archRenderVersoesTable.versao,
      imageUrl:  archRenderVersoesTable.imageUrl,
      origem:    archRenderVersoesTable.origem,
      createdAt: archRenderVersoesTable.createdAt,
    })
    .from(archRenderVersoesTable)
    .where(eq(archRenderVersoesTable.cenaId, cenaId))
    .orderBy(desc(archRenderVersoesTable.versao));

  return res.json(versoes);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/arch/cenas/:cenaId/versoes/download (autenticado)
// Registrar log de download e retornar URL original + nome sugerido
// ─────────────────────────────────────────────────────────────────────────────
router.post("/arch/cenas/:cenaId/versoes/download", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const bodySchema = z.object({ versaoId: z.string().min(1) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "versaoId é obrigatório." });

  const ctx = await getCenaTenant(cenaId);
  if (!ctx) return res.status(404).json({ error: "Cena não encontrada." });
  if (!canAccessTenant(req, ctx.tenantId)) return res.status(403).json({ error: "Acesso negado." });

  const [versao] = await db
    .select({ id: archRenderVersoesTable.id, versao: archRenderVersoesTable.versao, imageUrl: archRenderVersoesTable.imageUrl })
    .from(archRenderVersoesTable)
    .where(and(eq(archRenderVersoesTable.id, parsed.data.versaoId), eq(archRenderVersoesTable.cenaId, cenaId)))
    .limit(1);

  if (!versao) return res.status(404).json({ error: "Versão não encontrada." });

  const nomeProjeto = (ctx.projetoNome ?? "projeto")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  const nomeArquivo = `render-${nomeProjeto}-v${versao.versao}.png`;

  // Log de download (sem modificar a imagem)
  req.log.info({ versaoId: versao.id, cenaId, nomeArquivo }, "arch:download-versao");

  return res.json({ imageUrl: versao.imageUrl, versao: versao.versao, nomeArquivo });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arch/cenas/:cenaId/solicitacoes (autenticado)
// Listar solicitações da cena
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/cenas/:cenaId/solicitacoes", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);

  const ctx = await getCenaTenant(cenaId);
  if (!ctx) return res.status(404).json({ error: "Cena não encontrada." });
  if (!canAccessTenant(req, ctx.tenantId)) return res.status(403).json({ error: "Acesso negado." });

  const solicitacoes = await db
    .select()
    .from(archRenderSolicitacoesTable)
    .where(eq(archRenderSolicitacoesTable.cenaId, cenaId))
    .orderBy(desc(archRenderSolicitacoesTable.createdAt));

  return res.json(solicitacoes);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/arch/cenas/:cenaId/solicitacoes (PÚBLICA — portal do cliente)
// Criar solicitação e disparar render em background
// ─────────────────────────────────────────────────────────────────────────────
archPublicRouter.post("/arch/cenas/:cenaId/solicitacoes", async (req, res) => {
  const cenaId = String(req.params.cenaId);

  // Verificar que a cena existe (sem checar tenant — rota pública)
  const [cena] = await db
    .select({ id: archCenasTable.id })
    .from(archCenasTable)
    .where(eq(archCenasTable.id, cenaId))
    .limit(1);

  if (!cena) return res.status(404).json({ error: "Cena não encontrada." });

  const solSchema = insertArchRenderSolicitacaoSchema.extend({
    clienteNome:       z.string().max(255).optional(),
    observacoes:       z.string().optional(),
    itensAdicionados:  z.array(z.object({
      tipo:    z.enum(["sofa", "mesa", "cadeira", "cama", "armario", "luminaria", "janela", "porta"]),
      cor:     z.string(),
      posicao: z.enum(["esquerda", "centro", "direita"]),
    })).optional(),
    texturasAlteradas: z.array(z.object({
      superficie: z.enum(["parede", "piso", "teto"]),
      material:   z.enum(["madeira", "marmore", "cimento", "tinta"]),
      cor:        z.string(),
    })).optional(),
  }).omit({ cenaId: true, versaoGeradaId: true, status: true });

  const parsed = solSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos.", detail: parsed.error.flatten() });
  }

  const { itensAdicionados, texturasAlteradas } = parsed.data;
  const temItens    = itensAdicionados    && itensAdicionados.length > 0;
  const temTexturas = texturasAlteradas   && texturasAlteradas.length > 0;

  if (!temItens && !temTexturas) {
    return res.status(400).json({ error: "Informe pelo menos 1 item ou 1 textura a alterar." });
  }

  const [solicitacao] = await db
    .insert(archRenderSolicitacoesTable)
    .values({ ...parsed.data, cenaId, status: "pendente" })
    .returning({ id: archRenderSolicitacoesTable.id, status: archRenderSolicitacoesTable.status });

  if (!solicitacao) return res.status(500).json({ error: "Falha ao criar solicitação." });

  // Disparar processamento em background — não aguardar resposta
  setImmediate(() => {
    processarSolicitacao(solicitacao.id).catch(() => undefined);
  });

  return res.status(201).json({
    solicitacaoId: solicitacao.id,
    status:        "pendente",
    mensagem:      "Seu render está sendo gerado",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arch/cenas/:cenaId/solicitacoes/:solId/status (PÚBLICA — polling)
// ─────────────────────────────────────────────────────────────────────────────
archPublicRouter.get("/arch/cenas/:cenaId/solicitacoes/:solId/status", async (req, res) => {
  const cenaId = String(req.params.cenaId);
  const solId  = String(req.params.solId);

  const [sol] = await db
    .select({
      id:              archRenderSolicitacoesTable.id,
      cenaId:          archRenderSolicitacoesTable.cenaId,
      status:          archRenderSolicitacoesTable.status,
      versaoGeradaId:  archRenderSolicitacoesTable.versaoGeradaId,
    })
    .from(archRenderSolicitacoesTable)
    .where(
      and(
        eq(archRenderSolicitacoesTable.id, solId),
        eq(archRenderSolicitacoesTable.cenaId, cenaId),
      ),
    )
    .limit(1);

  if (!sol) return res.status(404).json({ error: "Solicitação não encontrada." });

  // Se já tem versão gerada, retornar imageUrl
  if (sol.versaoGeradaId) {
    const [versao] = await db
      .select({ imageUrl: archRenderVersoesTable.imageUrl })
      .from(archRenderVersoesTable)
      .where(eq(archRenderVersoesTable.id, sol.versaoGeradaId))
      .limit(1);

    return res.json({ status: sol.status, imageUrl: versao?.imageUrl ?? null, versaoGeradaId: sol.versaoGeradaId });
  }

  // Se em processamento, verificar se a cena já tem renderUrl nova (via scheduler)
  if (sol.status === "processando") {
    const [cena] = await db
      .select({ renderUrl: archCenasTable.renderUrl, status: archCenasTable.status })
      .from(archCenasTable)
      .where(eq(archCenasTable.id, cenaId))
      .limit(1);

    if (cena?.renderUrl && cena.status !== "renderizando") {
      // Render concluído — criar versão e vincular (lazy promotion)
      const [ultimaVersao] = await db
        .select({ versao: archRenderVersoesTable.versao })
        .from(archRenderVersoesTable)
        .where(eq(archRenderVersoesTable.cenaId, cenaId))
        .orderBy(desc(archRenderVersoesTable.versao))
        .limit(1);

      const proximaVersao = (ultimaVersao?.versao ?? 0) + 1;

      const [novaVersao] = await db
        .insert(archRenderVersoesTable)
        .values({
          cenaId,
          versao:   proximaVersao,
          imageUrl: cena.renderUrl,
          origem:   "solicitacao",
        })
        .returning({ id: archRenderVersoesTable.id, imageUrl: archRenderVersoesTable.imageUrl });

      if (novaVersao) {
        await db
          .update(archRenderSolicitacoesTable)
          .set({ status: "concluido", versaoGeradaId: novaVersao.id, processadoEm: new Date() })
          .where(eq(archRenderSolicitacoesTable.id, solId));

        return res.json({ status: "concluido", imageUrl: novaVersao.imageUrl });
      }
    }
  }

  return res.json({ status: sol.status, imageUrl: null });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arch/projetos/:projetoId/solicitacoes (autenticado)
// Listar todas as solicitações do projeto (todas as cenas), com join
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/projetos/:projetoId/solicitacoes", authenticate, async (req, res) => {
  const projetoId = String(req.params.projetoId);

  const [projeto] = await db
    .select({ tenantId: archProjetosTable.tenantId })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.id, projetoId))
    .limit(1);

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });
  if (!canAccessTenant(req, projeto.tenantId)) return res.status(403).json({ error: "Acesso negado." });

  const rows = await db
    .select({
      id:                archRenderSolicitacoesTable.id,
      cenaId:            archRenderSolicitacoesTable.cenaId,
      cenaNome:          archCenasTable.nome,
      clienteNome:       archRenderSolicitacoesTable.clienteNome,
      status:            archRenderSolicitacoesTable.status,
      itensAdicionados:  archRenderSolicitacoesTable.itensAdicionados,
      texturasAlteradas: archRenderSolicitacoesTable.texturasAlteradas,
      observacoes:       archRenderSolicitacoesTable.observacoes,
      versaoGeradaId:    archRenderSolicitacoesTable.versaoGeradaId,
      versaoNum:         archRenderVersoesTable.versao,
      imageUrl:          archRenderVersoesTable.imageUrl,
      createdAt:         archRenderSolicitacoesTable.createdAt,
      processadoEm:      archRenderSolicitacoesTable.processadoEm,
    })
    .from(archRenderSolicitacoesTable)
    .innerJoin(archCenasTable, eq(archRenderSolicitacoesTable.cenaId, archCenasTable.id))
    .leftJoin(archRenderVersoesTable, eq(archRenderSolicitacoesTable.versaoGeradaId, archRenderVersoesTable.id))
    .where(eq(archCenasTable.projetoId, projetoId))
    .orderBy(desc(archRenderSolicitacoesTable.createdAt));

  return res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/arch/cenas/:cenaId/solicitacoes/:solId/retry (autenticado)
// Re-processar uma solicitação com erro
// ─────────────────────────────────────────────────────────────────────────────
router.post("/arch/cenas/:cenaId/solicitacoes/:solId/retry", authenticate, async (req, res) => {
  const cenaId = String(req.params.cenaId);
  const solId  = String(req.params.solId);

  const ctx = await getCenaTenant(cenaId);
  if (!ctx) return res.status(404).json({ error: "Cena não encontrada." });
  if (!canAccessTenant(req, ctx.tenantId)) return res.status(403).json({ error: "Acesso negado." });

  const [sol] = await db
    .select({ id: archRenderSolicitacoesTable.id, status: archRenderSolicitacoesTable.status })
    .from(archRenderSolicitacoesTable)
    .where(and(
      eq(archRenderSolicitacoesTable.id, solId),
      eq(archRenderSolicitacoesTable.cenaId, cenaId),
    ))
    .limit(1);

  if (!sol) return res.status(404).json({ error: "Solicitação não encontrada." });
  if (sol.status === "processando") return res.status(409).json({ error: "Solicitação já está sendo processada." });

  await db
    .update(archRenderSolicitacoesTable)
    .set({ status: "pendente", versaoGeradaId: null, processadoEm: null })
    .where(eq(archRenderSolicitacoesTable.id, solId));

  setImmediate(() => {
    processarSolicitacao(solId).catch(() => undefined);
  });

  return res.json({ ok: true, status: "pendente" });
});

// ── Schemas de validação ────────────────────────────────────────────────────
const archRenderBodySchema = z.object({
  referenceImageUrl: z.string().optional(),
  lighting: z.enum(["auto", "manha", "tarde", "golden", "noturno", "nublado"]).default("auto"),
  angle:    z.enum(["frontal", "45", "lateral_esq", "lateral_dir", "ampla", "aerea"]).default("frontal"),
  roomType: z.string().default("fachada externa"),
  estilo:   z.string().optional(),
  materials: z.array(z.object({
    zone:             z.string(),
    materialName:     z.string(),
    promptFragment:   z.string(),
  })).default([]),
  userNotes: z.string().optional(),
});

const lightingMapArch: Record<string, string> = {
  manha:   "Early morning daylight (7–9 am): soft warm sunlight from low angle, gentle shadows, golden-warm color temperature.",
  tarde:   "Bright midday/afternoon (1–4 pm): strong overhead daylight, crisp shadows, neutral-white color temperature.",
  golden:  "Golden hour (5–6 pm): warm amber-orange sunlight raking across surfaces, long soft shadows, romantic golden glow.",
  noturno: "Night scene (8 pm+): TURN ON all lamps, exterior fixtures, and lighting elements physically present; dark sky; warm artificial light; no daylight.",
  nublado: "Overcast cloudy day: soft diffuse light with no direct sun, cool neutral tones, no hard shadows, even illumination.",
};

const angleMapArch: Record<string, string> = {
  frontal:     "straight-on frontal camera angle",
  "45":        "45-degree diagonal perspective angle",
  lateral_esq: "side view from the left (−90° Y-axis rotation from frontal view)",
  lateral_dir: "side view from the right (+90° Y-axis rotation from frontal view)",
  ampla:       "wide-angle lens expansive view",
  aerea:       "aerial top-down bird's-eye view",
};

function realEnvironmentPromptFromBody(body: unknown): string {
  const env = body && typeof body === "object" ? (body as any).realEnvironment : null;
  return interventionPromptContext(env as RealEnvironmentAnalysis | null);
}

function buildArchPreservationRules(isExterior: boolean): string {
  return isExterior
    ? [
        "ARCHITECTURAL FIDELITY IS THE HIGHEST PRIORITY. PHOTOREALISM IS SECOND. AESTHETIC ENHANCEMENT IS THIRD.",
        "ABSOLUTE PRESERVATION — NEVER BREAK:",
        "• Treat the supplied image as a locked architectural source, not as inspiration for a redesign.",
        "• Preserve exactly the building geometry, apparent dimensions, proportions, footprint, number of floors, walls, slabs, roofs, columns, beams, canopies and every structural volume.",
        "• Preserve exactly every door, window, frame, opening, garage bay, access, driveway and circulation element: same position, size, rhythm and shape.",
        "• Preserve the exact camera position, focal viewpoint, framing, perspective, horizon and vertical alignment.",
        "• Preserve the position and scale of existing landscaping, vehicles and objects. You may make them look real, but do not add, remove, duplicate or relocate them.",
        "• Do not redesign, beautify or reinterpret the architecture. Do not invent architectural elements.",
        "PERMITTED CHANGES ONLY:",
        "• Convert existing 3D/CGI materials into physically believable real-world materials with correct texture scale, micro-imperfections, reflectance and roughness.",
        "• Convert existing 3D vegetation into natural photographic vegetation while keeping its location and massing.",
        "• Improve physically plausible light, shadows, glass reflections/transparency, interior depth visible through glazing, sky and restrained professional post-production.",
      ].join(" ")
    : [
        "ARCHITECTURAL FIDELITY IS THE HIGHEST PRIORITY. PHOTOREALISM IS SECOND. AESTHETIC ENHANCEMENT IS THIRD.",
        "ABSOLUTE PRESERVATION — NEVER BREAK:",
        "• Treat the supplied image as a locked interior design source, not as inspiration for a redesign.",
        "• Preserve exactly room geometry, walls, ceiling, floor, openings, built-ins, furniture, objects and their positions, dimensions, rotation and proportions.",
        "• Preserve the exact camera position, focal viewpoint, framing, perspective and vertical alignment.",
        "• Do not add, remove, duplicate, move or replace furniture, decoration, plants or architectural elements.",
        "PERMITTED CHANGES ONLY:",
        "• Convert existing surfaces and objects into physically believable real-world materials with correct texture scale, micro-imperfections, reflectance and roughness.",
        "• Improve physically plausible lighting, shadows, reflections, glazing, fabric response and restrained professional post-production.",
      ].join(" ");
}

const ARCH_PHOTOREALISM_OUTPUT = [
  "FINAL IMAGE STANDARD:",
  "• The result must look like a real completed project photographed by a high-end professional architectural photographer, not like a 3D render, illustration, animation or CGI.",
  "• Full-frame architectural photography look, natural lens behavior, straight verticals, realistic exposure and white balance, natural dynamic range and subtle photographic depth.",
  "• Materials must never look plastic or excessively smooth; include subtle real-world imperfections.",
  "• Avoid cartoon style, illustration, obvious CGI, fake vegetation, excessive HDR, excessive saturation, bloom, warped lines, deformed objects, floating elements and duplicated elements.",
  "• Use refined Brazilian architectural-photography context and restrained magazine-quality post-production.",
].join(" ");

// ── POST /api/arch/render — Renderização por IA com preservação estrutural ──
router.post("/arch/render", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const parsed = archRenderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Parâmetros inválidos",
      details: parsed.error.issues.map(i => i.message).join("; "),
    });
  }

  const { referenceImageUrl, lighting, angle, roomType, estilo, materials, userNotes } = parsed.data;
  const isExterior = !roomType || roomType === "fachada externa";

  const preservationRules = buildArchPreservationRules(isExterior);
  const realEnvironmentRules = realEnvironmentPromptFromBody(req.body);

  const materialInstructions = materials.length > 0
    ? [
        "MATERIAL APPLICATIONS (apply only to each specified zone — leave ALL other surfaces unchanged):",
        ...materials.map(m => `• ${m.zone}: ${m.promptFragment} — photorealistic texture, correct scale and perspective`),
      ].join(" ")
    : null;

  const lightingInstruction = lighting !== "auto" && lightingMapArch[lighting]
    ? `LIGHTING CONDITION: ${lightingMapArch[lighting]}`
    : null;

  const angleInstruction = referenceImageUrl
    ? "CAMERA LOCK: preserve the exact camera position, framing, perspective and field of view of the supplied reference image."
    : (angleMapArch[angle] ? `CAMERA ANGLE: render from a ${angleMapArch[angle]}.` : null);

  const estiloMap: Record<string, string> = {
    minimalista:   "minimalist style with clean lines, neutral palette (white/grey/beige), uncluttered spaces",
    contemporaneo: "contemporary modern style with bold geometric forms and refined materials",
    classico:      "timeless classic style with quality materials, warm tones, and refined simplicity",
    industrial:    "industrial style with raw concrete, exposed steel, and dark tones",
    escandinavo:   "Scandinavian style with natural light, pale wood, and simple functional forms",
    tropical:      "tropical Brazilian style with warm earthy tones, natural textures, and lush accents",
  };
  const estiloInstruction = estilo && estiloMap[estilo]
    ? `VISUAL STYLE: ${estiloMap[estilo]}.`
    : null;

  const prompt = [
    "You are a professional architectural photographer and photorealism engine.",
    `Transform the supplied ${isExterior ? "3D architectural exterior/reference view" : "3D interior/reference view"} into a TRUE PHOTOREALISTIC ARCHITECTURAL PHOTOGRAPH.`,
    preservationRules,
    realEnvironmentRules,
    materialInstructions,
    estiloInstruction,
    lightingInstruction,
    angleInstruction,
    userNotes ? `Additional user request, subordinate to preservation rules: ${userNotes}` : null,
    ARCH_PHOTOREALISM_OUTPUT,
  ].filter(Boolean).join(" ");

  try {
    const storage = new ObjectStorageService();
    let b64: string | undefined;
    let motor = "gpt-image-1";

    if (referenceImageUrl) {
      // Validate data URL before anything else
      const dataUrlMatch = referenceImageUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!dataUrlMatch) {
        return res.status(400).json({ success: false, error: "referenceImageUrl deve ser um data URL base64 válido (data:<mime>;base64,<dados>)" });
      }

      // ── Primary: Google Vertex Gemini Image ─────────────────────────
      if ((Boolean(process.env["GEMINI_API_KEY"]) || (process.env["GOOGLE_CLOUD_PROJECT"] && process.env["GOOGLE_VERTEX_IMAGE_ENABLED"] !== "false"))) {
        try {
          b64 = await callGoogleVertexImage({
            referenceImageDataUrl: referenceImageUrl,
            prompt,
            logger: req.log,
          });
          motor = process.env["GOOGLE_VERTEX_IMAGE_MODEL"]?.trim() || "gemini-3.1-flash-image";
        } catch (vertexErr: any) {
          req.log.warn({ err: vertexErr?.message, tenantId: tid }, "arch/render: Vertex falhou → fallback Replicate/OpenAI");
          db.insert(automationLogsTable).values({
            flow: "render_fallback", step: "vertex_to_replicate",
            status: "warning", errorMessage: vertexErr?.message ?? "Vertex failed",
          }).catch(() => undefined);
        }
      }

      // ── Fallback 1: Replicate Flux+ControlNet ────────────────────
      if (!b64 && process.env["REPLICATE_API_TOKEN"]) {
        try {
          b64    = await callReplicateFlux({ controlImageDataUrl: referenceImageUrl, prompt, logger: req.log });
          motor  = "replicate-flux";
        } catch (replicateErr: any) {
          req.log.warn({ err: replicateErr?.message, tenantId: tid }, "arch/render: Replicate falhou → fallback gpt-image-1");
          db.insert(automationLogsTable).values({
            flow: "render_fallback", step: "replicate_to_openai",
            status: "warning", errorMessage: replicateErr?.message ?? "Replicate failed",
          }).catch(() => undefined);
        }
      }

      // ── Fallback 2: gpt-image-1 (img2img) ────────────────────────
      if (!b64) {
        const openai    = await getOpenAIForTenant(tid);
        const mimeType  = dataUrlMatch[1];
        const imgBuffer = Buffer.from(dataUrlMatch[2], "base64");
        const ext       = mimeType.split("/")[1] ?? "png";
        const refFile   = await toFile(imgBuffer, `reference.${ext}`, { type: mimeType });
        const result    = await (openai.images.edit as Function)({
          model: "gpt-image-1", image: refFile, prompt, n: 1, size: "1536x1024", quality: "high",
        });
        b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
      }
    } else {
      // No reference image — prefer Vertex, fallback to gpt-image-1
      if ((Boolean(process.env["GEMINI_API_KEY"]) || (process.env["GOOGLE_CLOUD_PROJECT"] && process.env["GOOGLE_VERTEX_IMAGE_ENABLED"] !== "false"))) {
        try {
          b64 = await callGoogleVertexImage({ prompt, logger: req.log });
          motor = process.env["GOOGLE_VERTEX_IMAGE_MODEL"]?.trim() || "gemini-3.1-flash-image";
        } catch (vertexErr: any) {
          req.log.warn({ err: vertexErr?.message, tenantId: tid }, "arch/render: Vertex text-to-image falhou → fallback gpt-image-1");
        }
      }
      if (!b64) {
        const openai = await getOpenAIForTenant(tid);
        const result = await (openai.images.generate as Function)({
          model: "gpt-image-1", prompt, n: 1, size: "1536x1024", quality: "high",
        });
        b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
      }
    }

    if (!b64) throw new Error("Motor de render não retornou imagem");

    const outputResolution = "4k";
    const baseBuffer = Buffer.from(b64, "base64");
    const targetSize = { width: 3840, height: 2160 };

    const buf = await sharp(baseBuffer)
      .resize(targetSize.width, targetSize.height, {
        fit: "inside",
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3,
      })
      .sharpen({ sigma: 0.65, m1: 0.7, m2: 1.1 })
      .png({ compressionLevel: 7, adaptiveFiltering: true })
      .toBuffer();

    const captured = await captureGeneratedMedia({
      tenantId: tid,
      userId: req.user?.sub ?? null,
      title: "Render Arqdor",
      operation: "arqdor_render",
      buffer: buf,
      mimeType: "image/png",
      type: "image",
      originalFilename: `arch-render-${tid}-${outputResolution}-${targetSize.width}x${targetSize.height}-${Date.now()}.png`,
      kind: "mixed",
      metadata: {
        module: "arqdor",
        outputResolution,
        width: targetSize.width,
        height: targetSize.height,
        lighting,
        angle,
        motor,
        prompt,
        generatedByAi: true,
      },
    });
    const servePath = captured.storageUrl.replace(/^\/objects\//, "");
    const imageUrl = `/api/storage/objects/${servePath}`;

    req.log.info({ tenantId: tid, lighting, angle, motor, assetId: captured.assetId }, "arch/render: concluído");
    return res.json({ success: true, imageUrl, prompt, motor, mediaAssetId: captured.assetId });
  } catch (err: any) {
    req.log.error({ err, tenantId: tid }, "arch/render: erro");
    const { status, message } = sanitizeAIError(err);
    return res.status(status).json({ success: false, error: message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Render Studio Async API — /arch/ai-render
// Frontend creates a job, then polls GET /arch/ai-render/:id every ~2s.
// ══════════════════════════════════════════════════════════════════════════════

// ── Helper: build and execute a render job (shared logic) ─────────────────────
async function executeRenderJob(opts: {
  tid: string;
  renderId: string;
  originalImageUrl: string | null;
  prompt: string;
  log: import("pino").Logger;
  outputResolution?: "2k" | "4k";
  aspectRatio?: "16:9" | "3:2";
}): Promise<void> {
  const { tid, renderId, originalImageUrl, prompt, log, outputResolution = "4k", aspectRatio = "16:9" } = opts;
  const storage = new ObjectStorageService();
  let b64: string | undefined;
  let motor = "gpt-image-1";

  try {
    if (originalImageUrl) {
      let dataUrl = originalImageUrl;

      // If it's a storage path, fetch and convert to data URL
      if (originalImageUrl.startsWith("/api/storage/") || originalImageUrl.startsWith("/storage/")) {
        const absUrl = `http://localhost:${process.env["PORT"] ?? 8080}${originalImageUrl}`;
        const imgRes = await fetch(absUrl);
        if (!imgRes.ok) throw new Error(`Não foi possível buscar imagem: ${imgRes.status}`);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
      }

      const dataUrlMatch = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!dataUrlMatch) throw new Error("Imagem de referência deve ser um data URL base64 válido");

      if ((Boolean(process.env["GEMINI_API_KEY"]) || (process.env["GOOGLE_CLOUD_PROJECT"] && process.env["GOOGLE_VERTEX_IMAGE_ENABLED"] !== "false"))) {
        try {
          b64 = await callGoogleVertexImage({
            referenceImageDataUrl: dataUrl,
            prompt,
            logger: log,
          });
          motor = process.env["GOOGLE_VERTEX_IMAGE_MODEL"]?.trim() || "gemini-3.1-flash-image";
        } catch (vertexErr: any) {
          log.warn({ err: vertexErr?.message, tenantId: tid }, "arch/ai-render: Vertex falhou → fallback Replicate/OpenAI");
          db.insert(automationLogsTable).values({
            flow: "render_fallback", step: "vertex_to_replicate",
            status: "warning", errorMessage: vertexErr?.message ?? "Vertex failed",
          }).catch(() => undefined);
        }
      }

      if (!b64 && process.env["REPLICATE_API_TOKEN"]) {
        try {
          b64   = await callReplicateFlux({ controlImageDataUrl: dataUrl, prompt, logger: log });
          motor = "replicate-flux";
        } catch (replicateErr: any) {
          log.warn({ err: replicateErr?.message, tenantId: tid }, "arch/ai-render: Replicate falhou → fallback gpt-image-1");
          db.insert(automationLogsTable).values({
            flow: "render_fallback", step: "replicate_to_openai",
            status: "warning", errorMessage: replicateErr?.message ?? "Replicate failed",
          }).catch(() => undefined);
        }
      }

      if (!b64) {
        const openai    = await getOpenAIForTenant(tid);
        const mimeType  = dataUrlMatch[1]!;
        const imgBuffer = Buffer.from(dataUrlMatch[2]!, "base64");
        const ext       = mimeType.split("/")[1] ?? "png";
        const refFile   = await toFile(imgBuffer, `reference.${ext}`, { type: mimeType });
        const result    = await (openai.images.edit as Function)({
          model: "gpt-image-1", image: refFile, prompt, n: 1, size: "1536x1024", quality: "high",
        });
        b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
      }
    } else {
      if ((Boolean(process.env["GEMINI_API_KEY"]) || (process.env["GOOGLE_CLOUD_PROJECT"] && process.env["GOOGLE_VERTEX_IMAGE_ENABLED"] !== "false"))) {
        try {
          b64 = await callGoogleVertexImage({ prompt, logger: log });
          motor = process.env["GOOGLE_VERTEX_IMAGE_MODEL"]?.trim() || "gemini-3.1-flash-image";
        } catch (vertexErr: any) {
          log.warn({ err: vertexErr?.message, tenantId: tid }, "arch/ai-render: Vertex text-to-image falhou → fallback gpt-image-1");
        }
      }
      if (!b64) {
        const openai = await getOpenAIForTenant(tid);
        const result = await (openai.images.generate as Function)({
          model: "gpt-image-1", prompt, n: 1, size: "1536x1024", quality: "high",
        });
        b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
      }
    }

    if (!b64) throw new Error("Motor de render não retornou imagem");

    const baseBuffer = Buffer.from(b64, "base64");
    const targetSize = outputResolution === "2k"
      ? (aspectRatio === "16:9" ? { width: 2560, height: 1440 } : { width: 2304, height: 1536 })
      : (aspectRatio === "16:9" ? { width: 3840, height: 2160 } : { width: 3072, height: 2048 });

    const buf = await sharp(baseBuffer)
      .resize(targetSize.width, targetSize.height, {
        fit: "inside",
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3,
      })
      .sharpen({ sigma: 0.65, m1: 0.7, m2: 1.1 })
      .png({ compressionLevel: 7, adaptiveFiltering: true })
      .toBuffer();

    const captured = await captureGeneratedMedia({
      tenantId: tid,
      title: "Render Arqdor Studio",
      operation: "arqdor_ai_render",
      buffer: buf,
      mimeType: "image/png",
      type: "image",
      originalFilename: `arch-render-${tid}-${outputResolution}-${targetSize.width}x${targetSize.height}-${Date.now()}.png`,
      kind: "mixed",
      metadata: {
        module: "arqdor",
        renderId,
        outputResolution,
        width: targetSize.width,
        height: targetSize.height,
        motor,
        prompt,
        generatedByAi: true,
      },
    });
    const servePath = captured.storageUrl.replace(/^\/objects\//, "");
    const imageUrl = `/api/storage/objects/${servePath}`;

    await db.update(archAiRendersTable)
      .set({ status: "concluido", resultImageUrl: imageUrl, motor, prompt, concluidoEm: new Date() })
      .where(eq(archAiRendersTable.id, renderId));

    log.info({ tenantId: tid, renderId, motor }, "arch/ai-render: concluído");
  } catch (err: any) {
    log.error({ err, tenantId: tid, renderId }, "arch/ai-render: erro no processamento async");
    await db.update(archAiRendersTable)
      .set({ status: "erro", erroMsg: err?.message ?? "Erro desconhecido" })
      .where(eq(archAiRendersTable.id, renderId))
      .catch(() => undefined);
  }
}

// ── Helper: build prompt for ai-render ───────────────────────────────────────
function buildAiRenderPrompt(opts: {
  ambiente: string;
  mode: string;
  estilo: string | null;
  lighting: string | null;
  angle: string | null;
  userNotes: string | null;
  ajustePrompt?: string;
}): string {
  const { ambiente, mode, estilo, lighting, angle, userNotes, ajustePrompt } = opts;
  const isExterior = !ambiente || ambiente === "fachada_externa" || ambiente === "fachada externa";

  const preservationRules = buildArchPreservationRules(isExterior);

  const estiloMap: Record<string, string> = {
    minimalista:   "minimalist style with clean lines, neutral palette, uncluttered spaces",
    contemporaneo: "contemporary modern style with bold geometric forms and refined materials",
    classico:      "timeless classic style with quality materials, warm tones, and refined simplicity",
    industrial:    "industrial style with raw concrete, exposed steel, and dark tones",
    escandinavo:   "Scandinavian style with natural light, pale wood, and simple functional forms",
    tropical:      "tropical Brazilian style with warm earthy tones, natural textures, and lush accents",
  };

  const lightingInstruction = lighting && lighting !== "auto" && lightingMapArch[lighting as keyof typeof lightingMapArch]
    ? `LIGHTING CONDITION: ${lightingMapArch[lighting as keyof typeof lightingMapArch]}`
    : null;

  const angleInstruction = mode === "preservar"
    ? "CAMERA LOCK: preserve the exact camera position, framing, perspective and field of view of the supplied reference image."
    : (angle && angleMapArch[angle as keyof typeof angleMapArch]
        ? `CAMERA ANGLE: render from a ${angleMapArch[angle as keyof typeof angleMapArch]}.`
        : null);

  const estiloInstruction = estilo && estiloMap[estilo]
    ? `VISUAL STYLE: ${estiloMap[estilo]}.`
    : null;

  return [
    "You are a professional architectural photographer and photorealism engine.",
    ajustePrompt
      ? `Apply ONLY the following requested adjustment while preserving everything else: ${ajustePrompt}`
      : `Transform the supplied ${isExterior ? "3D architectural exterior/reference view" : "3D interior/reference view"} into a TRUE PHOTOREALISTIC ARCHITECTURAL PHOTOGRAPH.`,
    mode === "preservar" ? preservationRules : null,
    estiloInstruction,
    lightingInstruction,
    angleInstruction,
    userNotes ? `Additional user request, subordinate to preservation rules: ${userNotes}` : null,
    ARCH_PHOTOREALISM_OUTPUT,
  ].filter(Boolean).join(" ");
}

// ── POST /arch/ai-render — create async render job ───────────────────────────
router.post("/arch/ai-render", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const body = req.body as {
    original_image_url?: string;
    mode?: string;
    ambiente?: string;
    user_notes?: string;
    project_id?: string;
    estilo?: string;
    lighting?: string;
    angle?: string;
    output_resolution?: "2k" | "4k";
    aspect_ratio?: "16:9" | "3:2";
  };

  const ambiente        = body.ambiente ?? "sala";
  const mode            = body.mode ?? "preservar";
  const originalImageUrl = body.original_image_url ?? null;
  const userNotes       = body.user_notes ?? null;
  const projectId       = body.project_id ?? null;
  const estilo          = body.estilo ?? null;
  const lighting        = body.lighting ?? "auto";
  const angle           = body.angle ?? "frontal";
  const outputResolution = body.output_resolution === "2k" ? "2k" : "4k";
  const aspectRatio      = body.aspect_ratio === "3:2" ? "3:2" : "16:9";

  const prompt = buildAiRenderPrompt({ ambiente, mode, estilo, lighting, angle, userNotes });

  const [job] = await db
    .insert(archAiRendersTable)
    .values({
      tenantId:         tid,
      projectId:        projectId ?? undefined,
      mode,
      ambiente,
      estilo:           estilo ?? undefined,
      iluminacao:       lighting,
      angulo:           angle,
      originalImageUrl: originalImageUrl ?? undefined,
      status:           "processando",
      prompt,
    })
    .returning({ id: archAiRendersTable.id });

  const renderId = job!.id;
  const log      = req.log;

  setImmediate(() => {
    executeRenderJob({
      tid,
      renderId,
      originalImageUrl,
      prompt,
      log,
      outputResolution,
      aspectRatio,
    }).catch(() => undefined);
  });

  req.log.info({ tenantId: tid, renderId, ambiente, mode }, "arch/ai-render: job criado");
  return res.json({ render_id: renderId });
});

// ── GET /arch/ai-render/:id — poll render job status ─────────────────────────
router.get("/arch/ai-render/:id", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const [job] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(eq(archAiRendersTable.id, req.params["id"]!), eq(archAiRendersTable.tenantId, tid)))
    .limit(1);

  if (!job) return res.status(404).json({ error: "Render não encontrado" });

  return res.json({
    status:           job.status,
    result_image_url: job.resultImageUrl ?? undefined,
    erro_msg:         job.erroMsg ?? undefined,
    motor:            job.motor ?? undefined,
    ambiente:         job.ambiente,
    created_at:       job.createdAt,
    concluido_em:     job.concluidoEm ?? undefined,
    output_resolution: "4k",
    output_width: 3840,
    output_height: 2160,
  });
});

// ── POST /arch/ai-render/:id/adjust — create adjusted version ─────────────────
router.post("/arch/ai-render/:id/adjust", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const parentId = req.params["id"]!;
  const [parent] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(eq(archAiRendersTable.id, parentId), eq(archAiRendersTable.tenantId, tid)))
    .limit(1);

  if (!parent) return res.status(404).json({ error: "Render pai não encontrado" });

  const body = req.body as {
    ajuste_prompt?: string;
    mask_zones?: string[];
    user_notes?: string;
  };

  const ajustePrompt = body.ajuste_prompt ?? "";
  const prompt = buildAiRenderPrompt({
    ambiente:    parent.ambiente,
    mode:        parent.mode,
    estilo:      parent.estilo,
    lighting:    parent.iluminacao,
    angle:       parent.angulo,
    userNotes:   body.user_notes ?? null,
    ajustePrompt,
  });

  const [job] = await db
    .insert(archAiRendersTable)
    .values({
      tenantId:         tid,
      projectId:        parent.projectId ?? undefined,
      parentRenderId:   parentId,
      mode:             parent.mode,
      ambiente:         parent.ambiente,
      estilo:           parent.estilo ?? undefined,
      iluminacao:       parent.iluminacao ?? undefined,
      angulo:           parent.angulo ?? undefined,
      originalImageUrl: parent.resultImageUrl ?? parent.originalImageUrl ?? undefined,
      maskZones:        body.mask_zones,
      status:           "processando",
      prompt,
    })
    .returning({ id: archAiRendersTable.id });

  const renderId       = job!.id;
  const referenceImage = parent.resultImageUrl ?? parent.originalImageUrl ?? null;
  const log            = req.log;

  setImmediate(() => {
    executeRenderJob({
      tid,
      renderId,
      originalImageUrl: referenceImage,
      prompt,
      log,
      outputResolution: "4k",
      aspectRatio: "16:9",
    }).catch(() => undefined);
  });

  req.log.info({ tenantId: tid, renderId, parentId }, "arch/ai-render/adjust: job criado");
  return res.json({ render_id: renderId });
});

// ── POST /arch/ai-render/:id/approve — approve a render ──────────────────────
router.post("/arch/ai-render/:id/approve", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const [job] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(eq(archAiRendersTable.id, req.params["id"]!), eq(archAiRendersTable.tenantId, tid)))
    .limit(1);

  if (!job) return res.status(404).json({ error: "Render não encontrado" });
  if (job.status !== "concluido") {
    return res.status(400).json({ error: "Somente renders concluídos podem ser aprovados" });
  }

  // Corrigido: approvedBy vem do JWT autenticado, não do corpo da
  // requisição (antes qualquer chamador podia alegar ser qualquer pessoa) —
  // e agora fica persistido no banco, não só num log transiente.
  const approvedBy = (req as any).user?.sub as string | undefined;
  await db.update(archAiRendersTable)
    .set({ versionTag: "fiel_ao_original", approvedBy: approvedBy ?? null, approvedAt: new Date() })
    .where(eq(archAiRendersTable.id, job.id));

  req.log.info({ tenantId: tid, renderId: job.id, approvedBy }, "arch/ai-render: aprovado");
  return res.json({ success: true, render_id: job.id, result_image_url: job.resultImageUrl });
});

// ── POST /arch/ai-render/:id/send-to-specification — forward to spec pipeline ─
router.post("/arch/ai-render/:id/send-to-specification", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const [job] = await db
    .select()
    .from(archAiRendersTable)
    .where(and(eq(archAiRendersTable.id, req.params["id"]!), eq(archAiRendersTable.tenantId, tid)))
    .limit(1);

  if (!job) return res.status(404).json({ error: "Render não encontrado" });

  req.log.info({ tenantId: tid, renderId: job.id }, "arch/ai-render: enviado para especificação");
  return res.json({
    success:          true,
    render_id:        job.id,
    result_image_url: job.resultImageUrl,
    project_id:       job.projectId,
  });
});

// ── POST /api/arch/suggestions — Card de sugestões de decoração por IA ──────
const archSuggestionsBodySchema = z.object({
  style:             z.enum(["minimalista", "atemporal", "provencal", "neoclassico", "moderno"]),
  projectId:         z.string().optional(),
  referenceImageUrl: z.string().optional(),
});

const stylePromptsMap: Record<string, string> = {
  minimalista:  "minimalist interior design: clean lines, very few elements, neutral palette (white/grey/beige), functional furniture with simple forms, open empty spaces, no clutter, soft diffuse natural lighting",
  atemporal:    "timeless interior design: classic discreet elements, balanced neutral palette, quality materials (solid wood, stone, linen), refined simplicity, warm ambient light, no trendy items",
  provencal:    "Provençal rustic French interior: aged distressed wood furniture, pastel tones (lavender, cream, sage green), wrought iron details, linen curtains, dried flower arrangements, terracotta accents, warm natural light",
  neoclassico:  "neoclassical interior: symmetrical layout, ivory and gold tones, ornamental columns or pilasters, high ceiling with plaster moldings, elegant curved-leg furniture, crystal chandelier lighting",
  moderno:      "modern contemporary interior: bold geometric forms, industrial materials (exposed concrete, glass, steel), contrasting dark/light palette, integrated technology, architectural statement lighting, abstract artwork",
};

router.post("/arch/suggestions", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ success: false, error: "Tenant não identificado" });

  const parsed = archSuggestionsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Parâmetros inválidos",
      details: parsed.error.issues.map(i => i.message).join("; "),
    });
  }

  const { style, projectId, referenceImageUrl } = parsed.data;
  const styleDesc = stylePromptsMap[style] ?? style;

  const suggestionPrompt = referenceImageUrl
    ? `Use this room as the spatial reference and transform it into an inspiring decoration concept with ${styleDesc}. You MAY freely add furniture, decorative objects, plants, art, rugs, and atmospheric lighting to fill the space. This is a decoration INSPIRATION image — creative additions are welcome and encouraged. Photorealistic render, 4K quality.`
    : `Generate an inspiring interior decoration concept with ${styleDesc}. A beautifully decorated room filled with furniture, plants, art objects, rugs, and atmospheric lighting. Photorealistic render, 4K quality, Brazilian residential context.`;

  try {
    const openai  = await getOpenAIForTenant(tid);
    const storage = new ObjectStorageService();
    let b64: string | undefined;

    if (referenceImageUrl) {
      const dataUrlMatch = referenceImageUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!dataUrlMatch) {
        return res.status(400).json({ success: false, error: "referenceImageUrl deve ser um data URL base64 válido" });
      }
      const mimeType  = dataUrlMatch[1];
      const imgBuffer = Buffer.from(dataUrlMatch[2], "base64");
      const ext       = mimeType.split("/")[1] ?? "png";
      const refFile   = await toFile(imgBuffer, `reference.${ext}`, { type: mimeType });
      const result    = await (openai.images.edit as Function)({
        model:   "gpt-image-1",
        image:   refFile,
        prompt:  suggestionPrompt,
        n:       1,
        size:    "1024x1024",
        quality: "medium",
      });
      b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
    } else {
      const result = await (openai.images.generate as Function)({
        model:   "gpt-image-1",
        prompt:  suggestionPrompt,
        n:       1,
        size:    "1024x1024",
        quality: "medium",
      });
      b64 = (result.data?.[0] as Record<string, unknown>)?.["b64_json"] as string | undefined;
    }

    if (!b64) throw new Error("gpt-image-1 não retornou imagem");

    const buf = Buffer.from(b64, "base64");
    const captured = await captureGeneratedMedia({
      tenantId: tid,
      userId: req.user?.sub ?? null,
      title: "Sugestão visual Arqdor",
      operation: "arqdor_suggestion",
      buffer: buf,
      mimeType: "image/png",
      type: "image",
      originalFilename: `arch-suggestion-${tid}-${Date.now()}.png`,
      kind: "mixed",
      metadata: {
        module: "arqdor",
        projectId: projectId ?? null,
        style,
        generatedByAi: true,
      },
    });
    const servePath = captured.storageUrl.replace(/^\/objects\//, "");
    const imageUrl = `/api/storage/objects/${servePath}`;

    let suggestionId: string | undefined;
    try {
      const [saved] = await db
        .insert(archSuggestionsTable)
        .values({ tenantId: tid, projectId: projectId ?? null, style, imageUrl })
        .returning({ id: archSuggestionsTable.id });
      suggestionId = saved?.id;
    } catch (dbErr) {
      req.log.warn({ dbErr }, "arch/suggestions: falha ao persistir no DB");
    }

    req.log.info({ tenantId: tid, style }, "arch/suggestions: concluído");
    return res.json({ success: true, imageUrl, suggestionId, saved: !!suggestionId });
  } catch (err: any) {
    req.log.error({ err, tenantId: tid }, "arch/suggestions: erro");
    const { status, message } = sanitizeAIError(err);
    return res.status(status).json({ success: false, error: message });
  }
});

// ── GET /api/arch/surfaces/:projectId — Listar superfícies do projeto ────────
router.get("/arch/surfaces/:projectId", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const projectId = req.params.projectId as string;

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tid)));

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado" });

  const surfaces = await db
    .select()
    .from(renderSurfacesTable)
    .where(eq(renderSurfacesTable.projectId, projectId))
    .orderBy(renderSurfacesTable.displayOrder, renderSurfacesTable.createdAt);

  return res.json(surfaces);
});

// ── POST /api/arch/surfaces — Criar superfície ───────────────────────────────
router.post("/arch/surfaces", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const parsed = insertRenderSurfaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues.map(i => i.message).join("; ") });
  }

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, parsed.data.projectId), eq(archProjetosTable.tenantId, tid)));

  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado" });

  const [surface] = await db
    .insert(renderSurfacesTable)
    .values(parsed.data)
    .returning();

  return res.status(201).json(surface);
});

// ── PATCH /api/arch/surfaces/:surfaceId — Atualizar superfície ───────────────
router.patch("/arch/surfaces/:surfaceId", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const surfaceId = req.params.surfaceId as string;
  const parsed = updateRenderSurfaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues.map(i => i.message).join("; ") });
  }

  const [existing] = await db
    .select({ projectId: renderSurfacesTable.projectId })
    .from(renderSurfacesTable)
    .where(eq(renderSurfacesTable.id, surfaceId));

  if (!existing) return res.status(404).json({ error: "Superfície não encontrada" });

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, existing.projectId), eq(archProjetosTable.tenantId, tid)));

  if (!projeto) return res.status(403).json({ error: "Acesso negado" });

  const [updated] = await db
    .update(renderSurfacesTable)
    .set(parsed.data)
    .where(eq(renderSurfacesTable.id, surfaceId))
    .returning();

  return res.json(updated);
});

// ── POST /api/arch/surfaces/:surfaceId/material — Aplicar material ────────────
router.post("/arch/surfaces/:surfaceId/material", async (req, res) => {
  const tid = tenantId(req);
  if (!tid) return res.status(403).json({ error: "Tenant não identificado" });

  const surfaceId = req.params.surfaceId as string;

  const parsed = insertRenderSurfaceMaterialSchema.omit({ surfaceId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues.map(i => i.message).join("; ") });
  }

  const [existing] = await db
    .select({ projectId: renderSurfacesTable.projectId })
    .from(renderSurfacesTable)
    .where(eq(renderSurfacesTable.id, surfaceId));

  if (!existing) return res.status(404).json({ error: "Superfície não encontrada" });

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, existing.projectId), eq(archProjetosTable.tenantId, tid)));

  if (!projeto) return res.status(403).json({ error: "Acesso negado" });

  const [applied] = await db
    .insert(renderSurfaceMaterialsTable)
    .values({ ...parsed.data, surfaceId, appliedBy: (req as any).user?.sub ?? null })
    .returning();

  return res.status(201).json(applied);
});

// ─────────────────────────────────────────────────────────────────────────────
// ARQ PROJECTS — workspace persistence (objects, materials, AIE snapshots)
// ─────────────────────────────────────────────────────────────────────────────

// GET /arq/projects — list workspace projects for tenant
router.get("/arq/projects", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const clientProjectId = typeof req.query.clientProjectId === "string"
    ? req.query.clientProjectId.trim()
    : "";

  const conditions = [eq(archProjetosTable.tenantId, tid)];

  if (clientProjectId) {
    const [anchor] = await db
      .select({
        id: archProjetosTable.id,
        leadId: archProjetosTable.leadId,
        dealId: archProjetosTable.dealId,
        clienteNome: archProjetosTable.clienteNome,
        clienteEmail: archProjetosTable.clienteEmail,
        clienteTelefone: archProjetosTable.clienteTelefone,
      })
      .from(archProjetosTable)
      .where(and(
        eq(archProjetosTable.id, clientProjectId),
        eq(archProjetosTable.tenantId, tid),
      ))
      .limit(1);

    if (!anchor) return res.status(404).json({ error: "Projeto de referência não encontrado." });

    if (anchor.leadId) {
      conditions.push(eq(archProjetosTable.leadId, anchor.leadId));
    } else if (anchor.dealId) {
      conditions.push(eq(archProjetosTable.dealId, anchor.dealId));
    } else if (anchor.clienteEmail?.trim()) {
      const email = anchor.clienteEmail.trim().toLowerCase();
      conditions.push(sql<boolean>`lower(trim(coalesce(${archProjetosTable.clienteEmail}, ''))) = ${email}`);
    } else if (anchor.clienteTelefone?.trim()) {
      const phone = anchor.clienteTelefone.replace(/\D/g, "");
      conditions.push(sql<boolean>`regexp_replace(coalesce(${archProjetosTable.clienteTelefone}, ''), '[^0-9]', '', 'g') = ${phone}`);
    } else if (anchor.clienteNome?.trim()) {
      const name = anchor.clienteNome.trim().toLowerCase().replace(/\s+/g, " ");
      conditions.push(sql<boolean>`regexp_replace(lower(trim(coalesce(${archProjetosTable.clienteNome}, ''))), '\s+', ' ', 'g') = ${name}`);
    } else {
      conditions.push(eq(archProjetosTable.id, anchor.id));
    }
  }

  const projetos = await db
    .select({
      id:               archProjetosTable.id,
      leadId:           archProjetosTable.leadId,
      dealId:           archProjetosTable.dealId,
      titulo:           archProjetosTable.titulo,
      clienteNome:      archProjetosTable.clienteNome,
      clienteEmail:     archProjetosTable.clienteEmail,
      clienteTelefone:  archProjetosTable.clienteTelefone,
      status:           archProjetosTable.status,
      tipoObra:         archProjetosTable.tipoObra,
      areaM2:           archProjetosTable.areaM2,
      createdAt:        archProjetosTable.createdAt,
      updatedAt:        archProjetosTable.updatedAt,
    })
    .from(archProjetosTable)
    .where(and(...conditions))
    .orderBy(desc(archProjetosTable.updatedAt));
  return res.json(projetos);
});

// GET /arq/projects/:id — get project with objects + materials
router.get("/arq/projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String((req.params.id as string));

  const [projeto] = await db
    .select()
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const [objects, materials] = await Promise.all([
    db.select().from(arqObjectsTable).where(eq(arqObjectsTable.projetoId, id)),
    db.select().from(arqMaterialsTable).where(eq(arqMaterialsTable.projetoId, id)),
  ]);

  return res.json({ projeto, objects, materials });
});

// POST /arq/projects — create project
router.post("/arq/projects", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const parsed = insertArchProjetoSchema.safeParse({
    ...req.body,
    tenantId: tid,
  });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [projeto] = await db
    .insert(archProjetosTable)
    .values({ ...parsed.data, portalToken: crypto.randomUUID(), portalAtivo: false } as any)
    .returning();
  return res.status(201).json(projeto);
});

// PATCH /arq/projects/:id — update project metadata
router.patch("/arq/projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String((req.params.id as string));

  const [existing] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });

  const parsed = updateArchProjetoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [updated] = await db
    .update(archProjetosTable)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(archProjetosTable.id, id))
    .returning();
  return res.json(updated);
});

// DELETE /arq/projects/:id — delete project (cascades to objects/materials/aie_snapshots)
router.delete("/arq/projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String((req.params.id as string));

  const [existing] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Projeto não encontrado." });

  await db.delete(archProjetosTable).where(eq(archProjetosTable.id, id));
  return res.status(204).end();
});

const arqObjectRowSchema = z.object({
  objectClientId:  z.string(),
  name:            z.string(),
  category:        z.string(),
  material:        z.string().optional(),
  finish:          z.string().optional(),
  color:           z.string().optional(),
  dimensions:      z.object({ width: z.number(), height: z.number(), depth: z.number(), unit: z.string() }).optional(),
  position:        z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  visualWeight:    z.number().optional(),
  designIntent:    z.array(z.string()).optional(),
  componentId:     z.string().optional(),
  manufacturerId:  z.string().optional(),
  locked:          z.boolean().optional(),
});

// PUT /arq/projects/:id/objects — replace all objects for project
router.put("/arq/projects/:id/objects", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String((req.params.id as string));

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const parsed = z.array(arqObjectRowSchema).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await db.delete(arqObjectsTable).where(eq(arqObjectsTable.projetoId, id));

  if (parsed.data.length > 0) {
    await db.insert(arqObjectsTable).values(
      parsed.data.map(o => ({ ...o, projetoId: id }))
    );
  }

  await db
    .update(archProjetosTable)
    .set({ updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id));

  const objects = await db.select().from(arqObjectsTable).where(eq(arqObjectsTable.projetoId, id));
  return res.json(objects);
});

const arqMaterialRowSchema = z.object({
  materialClientId: z.string(),
  name:             z.string(),
  category:         z.string(),
  manufacturer:     z.string().default(""),
  finish:           z.string().default(""),
  gloss:            z.number().optional(),
  palette:          z.array(z.string()).optional(),
  usedByObjects:    z.array(z.string()).optional(),
});

// PUT /arq/projects/:id/materials — replace all materials for project
router.put("/arq/projects/:id/materials", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String((req.params.id as string));

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const parsed = z.array(arqMaterialRowSchema).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await db.delete(arqMaterialsTable).where(eq(arqMaterialsTable.projetoId, id));

  if (parsed.data.length > 0) {
    await db.insert(arqMaterialsTable).values(
      parsed.data.map(m => ({ ...m, projetoId: id }))
    );
  }

  await db
    .update(archProjetosTable)
    .set({ updatedAt: new Date() })
    .where(eq(archProjetosTable.id, id));

  const materials = await db.select().from(arqMaterialsTable).where(eq(arqMaterialsTable.projetoId, id));
  return res.json(materials);
});

const arqAieSnapshotBodySchema = z.object({
  scores: z.object({
    overall:         z.number(),
    renderReadiness: z.number(),
    material:        z.number(),
    consistency:     z.number(),
    composition:     z.number(),
    lighting:        z.number(),
    photography:     z.number(),
    geometry:        z.number(),
    promptQuality:   z.number(),
  }),
  fullResult:       z.any(),
  projectSnapshot:  z.any().optional(),
});

// POST /arq/projects/:id/aie-snapshots — save AIE result snapshot
router.post("/arq/projects/:id/aie-snapshots", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String((req.params.id as string));

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const parsed = arqAieSnapshotBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { scores, fullResult, projectSnapshot } = parsed.data;

  const [snapshot] = await db
    .insert(arqAieSnapshotsTable)
    .values({
      projetoId:            id,
      overallScore:         scores.overall,
      renderReadinessScore: scores.renderReadiness,
      materialScore:        scores.material,
      consistencyScore:     scores.consistency,
      compositionScore:     scores.composition,
      lightingScore:        scores.lighting,
      photographyScore:     scores.photography,
      geometryScore:        scores.geometry,
      promptQualityScore:   scores.promptQuality,
      fullResult,
      projectSnapshot: projectSnapshot ?? null,
    })
    .returning();

  return res.status(201).json(snapshot);
});

// GET /arq/projects/:id/aie-snapshots — get AIE snapshot history for learning engine
router.get("/arq/projects/:id/aie-snapshots", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id  = String((req.params.id as string));

  const [projeto] = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, id), eq(archProjetosTable.tenantId, tid)))
    .limit(1);
  if (!projeto) return res.status(404).json({ error: "Projeto não encontrado." });

  const snapshots = await db
    .select()
    .from(arqAieSnapshotsTable)
    .where(eq(arqAieSnapshotsTable.projetoId, id))
    .orderBy(desc(arqAieSnapshotsTable.createdAt));

  return res.json(snapshots);
});

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Variations — server-side persistence
// ─────────────────────────────────────────────────────────────────────────────

// GET /arch/prompt-variations — list all variations for the current user
router.get("/arch/prompt-variations", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const uid = (req as any).user?.sub as string;

  const rows = await db
    .select()
    .from(archPromptVariationsTable)
    .where(
      and(
        eq(archPromptVariationsTable.tenantId, tid),
        eq(archPromptVariationsTable.userId, uid),
      ),
    )
    .orderBy(desc(archPromptVariationsTable.savedAt));

  return res.json(rows);
});

// POST /arch/prompt-variations — create a new variation
router.post("/arch/prompt-variations", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const uid = (req as any).user?.sub as string;

  const body = insertArchPromptVariationSchema.safeParse({
    ...req.body,
    tenantId: tid,
    userId: uid,
  });

  if (!body.success) {
    return res.status(400).json({ error: "Dados inválidos", details: body.error.issues });
  }

  const [row] = await db
    .insert(archPromptVariationsTable)
    .values(body.data)
    .returning();

  return res.status(201).json(row);
});

// PATCH /arch/prompt-variations/:id — rename or update notes
router.patch("/arch/prompt-variations/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const uid = (req as any).user?.sub as string;
  const id = (req.params.id as string) as string;

  const body = updateArchPromptVariationSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "Dados inválidos", details: body.error.issues });
  }

  const [row] = await (db as any)
    .update(archPromptVariationsTable)
    .set({ ...body.data, updatedAt: new Date() } as any)
    .where(
      and(
        eq(archPromptVariationsTable.id, id),
        eq(archPromptVariationsTable.tenantId, tid!),
        eq(archPromptVariationsTable.userId, uid),
      )!,
    )
    .returning();

  if (!row) return res.status(404).json({ error: "Variação não encontrada" });
  return res.json(row);
});

// DELETE /arch/prompt-variations/:id — remove a variation
router.delete("/arch/prompt-variations/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const uid = (req as any).user?.sub as string;
  const id = (req.params.id as string) as string;

  const [row] = await (db as any)
    .delete(archPromptVariationsTable)
    .where(
      and(
        eq(archPromptVariationsTable.id, id),
        eq(archPromptVariationsTable.tenantId, tid!),
        eq(archPromptVariationsTable.userId, uid),
      )!,
    )
    .returning({ id: archPromptVariationsTable.id });

  if (!row) return res.status(404).json({ error: "Variação não encontrada" });
  return res.json({ ok: true });
});

// POST /arch/prompt-variations/bulk — migrate localStorage batch on first login
router.post("/arch/prompt-variations/bulk", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const uid = (req as any).user?.sub as string;

  const items = z.array(insertArchPromptVariationSchema.omit({ tenantId: true, userId: true })).safeParse(req.body);
  if (!items.success) {
    return res.status(400).json({ error: "Dados inválidos", details: items.error.issues });
  }

  if (items.data.length === 0) return res.json([]);

  const rows = await db
    .insert(archPromptVariationsTable)
    .values(items.data.map(v => ({ ...v, tenantId: tid, userId: uid })))
    .onConflictDoNothing()
    .returning();

  return res.status(201).json(rows);
});

// GET /arq/learning — build learning profile from all tenant project snapshots
router.get("/arq/learning", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const projetos = await db
    .select({ id: archProjetosTable.id })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.tenantId, tid));

  if (projetos.length === 0) return res.json({ snapshots: [], contexts: [] });

  const projectIds = projetos.map(p => p.id);

  const snapshots = await db
    .select({
      projetoId:      arqAieSnapshotsTable.projetoId,
      projectSnapshot: arqAieSnapshotsTable.projectSnapshot,
      overallScore:   arqAieSnapshotsTable.overallScore,
      createdAt:      arqAieSnapshotsTable.createdAt,
    })
    .from(arqAieSnapshotsTable)
    .where(inArray(arqAieSnapshotsTable.projetoId, projectIds))
    .orderBy(desc(arqAieSnapshotsTable.createdAt))
    .limit(50);

  return res.json({ snapshots });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /arqdor/projects/:id — load a full ProjectContext blob for this tenant
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arqdor/projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id = String((req.params.id as string));

  const [row] = await db
    .select()
    .from(arqdorWorkspaceProjectsTable)
    .where(
      and(
        eq(arqdorWorkspaceProjectsTable.id, id),
        eq(arqdorWorkspaceProjectsTable.tenantId, tid)
      )
    )
    .limit(1);

  if (!row) return res.status(404).json({ error: "Projeto não encontrado." });
  return res.json(row.contextBlob);
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /arqdor/projects/:id — upsert (create or update) a ProjectContext blob
// ─────────────────────────────────────────────────────────────────────────────
router.put("/arqdor/projects/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const id = String((req.params.id as string));
  const contextBlob = req.body;

  if (!contextBlob || typeof contextBlob !== "object" || Array.isArray(contextBlob)) {
    return res.status(400).json({ error: "Corpo inválido: deve ser um objeto JSON." });
  }

  const [upserted] = await db
    .insert(arqdorWorkspaceProjectsTable)
    .values({ id, tenantId: tid, contextBlob, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [arqdorWorkspaceProjectsTable.id, arqdorWorkspaceProjectsTable.tenantId],
      set: { contextBlob, updatedAt: new Date() },
    })
    .returning();

  return res.json(upserted?.contextBlob ?? contextBlob);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /arch/copilot/chat — ARQ Copilot Intelligence (real AI, full context)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/arch/copilot/chat", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { message, projectId, history = [] } = req.body as {
    message: string;
    projectId?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: "Mensagem não pode ser vazia." });
  }

  // ── 1. Assemble project context ──────────────────────────────────────────
  let contextStr = "";

  if (projectId) {
    const [projeto] = await db
      .select()
      .from(archProjetosTable)
      .where(
        and(
          eq(archProjetosTable.id, projectId),
          eq(archProjetosTable.tenantId, tid),
        ),
      )
      .limit(1);

    if (projeto) {
      const [ambientes, cenas, catalogItems] = await Promise.all([
        db
          .select()
          .from(archAmbientesTable)
          .where(eq(archAmbientesTable.projetoId, projectId)),
        db
          .select()
          .from(archCenasTable)
          .where(eq(archCenasTable.projetoId, projectId))
          .orderBy(desc(archCenasTable.createdAt))
          .limit(5),
        db
          .select({
            nome: archCatalogoTable.nome,
            categoria: archCatalogoTable.categoria,
            fornecedor: archCatalogoTable.fornecedor,
            descricao: archCatalogoTable.descricao,
          })
          .from(archCatalogoTable)
          .where(eq(archCatalogoTable.tenantId, tid))
          .limit(20),
      ]);

      const renders = await db
        .select({
          imageUrl: archRenderVersoesTable.imageUrl,
          versao: archRenderVersoesTable.versao,
          origem: archRenderVersoesTable.origem,
          createdAt: archRenderVersoesTable.createdAt,
        })
        .from(archRenderVersoesTable)
        .innerJoin(archCenasTable, eq(archCenasTable.id, archRenderVersoesTable.cenaId))
        .where(eq(archCenasTable.projetoId, projectId))
        .orderBy(desc(archRenderVersoesTable.createdAt))
        .limit(3);

      contextStr = `
PROJETO ATIVO: ${projeto.titulo}
Cliente: ${projeto.clienteNome || "N/A"}
Status: ${projeto.status}
Tipo de obra: ${projeto.tipoObra || "N/A"}
Área: ${projeto.areaM2 ? `${projeto.areaM2}m²` : "N/A"}
Orçamento estimado: ${projeto.orcamentoTotal ? `R$ ${projeto.orcamentoTotal}` : "N/A"}
Prazo: ${projeto.prazoEstimado || "N/A"}

AMBIENTES (${ambientes.length}):
${ambientes.map((a) => `- ${a.nome}`).join("\n") || "Nenhum ambiente cadastrado"}

CENAS DE RENDER (${cenas.length}):
${cenas.map((c) => `- ${c.nome}: status ${c.status}`).join("\n") || "Nenhuma cena cadastrada"}

RENDERS GERADOS: ${renders.length === 0 ? "Nenhum render gerado ainda" : `${renders.length} render(s). Mais recente: versão ${renders[0]?.versao || "N/A"}, motor ${renders[0]?.origem || "N/A"}`}

CATÁLOGO DISPONÍVEL (${catalogItems.length} itens registrados):
${catalogItems.slice(0, 10).map((i) => `- ${i.nome} [${i.categoria}] — ${i.fornecedor}`).join("\n") || "Catálogo vazio"}
`.trim();

      // Inject partner directory into copilot context
      const partners = await db
        .select({
          nome:          archPartnersTable.nome,
          tipo:          archPartnersTable.tipo,
          especialidades: archPartnersTable.especialidades,
          cidade:        archPartnersTable.cidade,
          prazoDescricao: archPartnersTable.prazoDescricao,
          email:         archPartnersTable.email,
        })
        .from(archPartnersTable)
        .where(and(eq(archPartnersTable.tenantId, tid), eq(archPartnersTable.ativo, true)))
        .limit(20);

      if (partners.length > 0) {
        contextStr += `\n\nPARCEIROS CADASTRADOS (${partners.length} no diretório do escritório):\n` +
          partners.map(p =>
            `- ${p.nome} [${p.tipo}]${p.cidade ? ` · ${p.cidade}` : ""}${p.prazoDescricao ? ` · prazo: ${p.prazoDescricao}` : ""}${(p.especialidades as string[] | null)?.length ? ` · especialidades: ${(p.especialidades as string[]).join(", ")}` : ""}`
          ).join("\n");
      }
    }
  }

  // ── Knowledge Engine: inject top patterns into copilot context ───────────
  try {
    const kTags = await db
      .select({ tag: archKnowledgeTagsTable.tag, count: archKnowledgeTagsTable.count })
      .from(archKnowledgeTagsTable)
      .where(eq(archKnowledgeTagsTable.tenantId, tid))
      .orderBy(desc(archKnowledgeTagsTable.count))
      .limit(8);

    if (kTags.length > 0) {
      contextStr += `\n\nBASE DE CONHECIMENTO DO ESCRITÓRIO (padrões extraídos de projetos anteriores):\nPadrões mais recorrentes: ${kTags.map(t => t.tag).join(", ")}`;
    }
  } catch { /* non-blocking */ }

  // ── 2-6. Delegate to AI Orchestrator (intent → specialists → AI → parse) ──
  let orchResult: import("../lib/arqdor/orchestrator").OrchestrationResult;
  let logEntry:   import("../lib/arqdor/orchestrator").OrchestratorLogEntry;

  try {
    ({ result: orchResult, logEntry } = await arqOrchestrator.orchestrate(
      {
        message,
        projectContext: contextStr,
        history,
        tenantId: tid,
        projectId,
      },
      callOpenAI,
      req.log,
    ));
  } catch (err: any) {
    const { status, message: msg } = sanitizeAIError(err);
    return res.status(status).json({ error: msg });
  }

  // ── 7. Persist orchestrator log as snapshot (non-blocking) ───────────────
  if (projectId) {
    db.insert(arqAieSnapshotsTable)
      .values({
        projetoId: projectId,
        projectSnapshot: {
          type:         "copilot_exchange",
          messageId:    logEntry.messageId,
          question:     message.slice(0, 500),
          answer:       orchResult.reply.slice(0, 1000),
          intent:       logEntry.intent,
          specialists:  logEntry.specialists,
          provider:     orchResult.provider,
          model:        orchResult.model,
          inputTokens:  logEntry.inputTokens,
          outputTokens: logEntry.outputTokens,
          costUsd:      logEntry.costUsd,
          durationMs:   logEntry.durationMs,
          tenantId:     tid,
        } as any,
      } as any)
      .catch(() => {/* non-blocking */});
  }

  return res.json({
    reply:       orchResult.reply,
    actions:     orchResult.actions,
    intent:      orchResult.intent,
    specialists: orchResult.specialists,
    provider:    orchResult.provider,
    model:       orchResult.model,
    tokens:      { input: orchResult.inputTokens, output: orchResult.outputTokens },
    cost:        orchResult.costUsd,
    durationMs:  orchResult.durationMs,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/arch/specification/analyze — IA analisa render e identifica itens
// ─────────────────────────────────────────────────────────────────────────────
router.post("/arch/specification/analyze", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { imageUrl, projetoId, renderId } = req.body as { imageUrl?: string; projetoId?: string; renderId?: string };

  if (!imageUrl || !projetoId) {
    return res.status(400).json({ error: "imageUrl e projetoId são obrigatórios" });
  }

  try {
    // Anthropic only accepts base64 images (not URLs). Fetch internally and convert.
    let imageBase64: string;
    let imageMime: string = "image/png";
    if (imageUrl.startsWith("/")) {
      const absUrl = `http://localhost:${process.env["PORT"] ?? 8080}${imageUrl}`;
      const imgRes = await fetch(absUrl);
      if (!imgRes.ok) throw new Error(`Não foi possível buscar imagem do render: ${imgRes.status}`);
      const contentType = imgRes.headers.get("content-type") ?? "image/png";
      imageMime = contentType.split(";")[0]!.trim() || "image/png";
      imageBase64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
    } else {
      // External URL — fetch and encode
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error(`Não foi possível buscar imagem: ${imgRes.status}`);
      const contentType = imgRes.headers.get("content-type") ?? "image/png";
      imageMime = contentType.split(";")[0]!.trim() || "image/png";
      imageBase64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
    }

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: imageMime as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: imageBase64 },
          },
          {
            type: "text",
            text: `Você é um arquiteto especialista em especificação técnica de projetos de interiores brasileiros.

Analise esta imagem de render arquitetônico e identifique TODOS os itens presentes na cena.

Para cada item, retorne:
- categoria: uma de (Mobiliário | Iluminação | Revestimento | Metal | Louça | Decoração | Eletrodoméstico | Esquadria | Componente)
- descricao: descrição técnica específica e detalhada do item
- quantidade: número estimado de unidades visíveis na cena
- confianca: nível de confiança da identificação entre 0.50 e 1.00

Seja específico e técnico. Exemplo: "Sofá em L com chaise, estofamento em couro natural bege" em vez de apenas "sofá".

Responda SOMENTE com JSON válido, sem texto adicional:
{"items":[{"categoria":"Mobiliário","descricao":"Sofá modular 3 lugares, estofamento em veludo cinza","quantidade":1,"confianca":0.92}]}`
          }
        ]
      }]
    });

    const textContent = message.content[0];
    if (textContent.type !== "text") throw new Error("Resposta inesperada da IA");

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("IA não retornou JSON válido");

    const parsed = JSON.parse(jsonMatch[0]) as { items?: Array<{ categoria: string; descricao: string; quantidade: number; confianca: number }> };
    const aiItems = parsed.items ?? [];

    if (aiItems.length === 0) {
      return res.status(422).json({ error: "A IA não identificou itens na imagem. Tente com uma imagem de maior qualidade." });
    }

    const [spec] = await db
      .insert(archSpecificationsTable)
      .values({
        tenantId:       tid,
        projetoId:      String(projetoId),
        renderId:       renderId ? String(renderId) : null,
        renderImageUrl: String(imageUrl),
        status:         "draft",
        itemsCount:     aiItems.length,
        specifiedCount: 0,
      })
      .returning();

    const prefixForCategory = (categoria: string) => {
      const normalized = categoria.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (normalized.includes("mobili")) return "MOB";
      if (normalized.includes("marcen")) return "MAR";
      if (normalized.includes("revest")) return "REV";
      if (normalized.includes("ilumin")) return "IL";
      if (normalized.includes("esquadr")) return "ESQ";
      if (normalized.includes("lou")) return "LOU";
      if (normalized.includes("metal")) return "MET";
      if (normalized.includes("eletro")) return "ELE";
      return "ESP";
    };

    // Objetos 3D persistidos são a fonte de verdade para dimensões.
    // O reconhecimento visual serve apenas para localizar/classificar o item.
    const projectObjects = await db
      .select()
      .from(arqObjectsTable)
      .where(eq(arqObjectsTable.projetoId, String(projetoId)));

    const normText = (value: unknown) =>
      String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const categoryAliases: Record<string, string[]> = {
      mobiliario: ["mobiliario", "sofa", "poltrona", "cadeira", "mesa", "cama", "banco"],
      marcenaria: ["marcenaria", "armario", "gabinete", "painel", "estante", "closet"],
      iluminacao: ["iluminacao", "luminaria", "pendente", "spot", "plafon", "led"],
      revestimento: ["piso", "revestimento", "pedra"],
      metal: ["metal", "torneira", "misturador"],
      louca: ["louca", "cuba", "vaso", "banheira"],
      eletrodomestico: ["equipamentos", "eletrodomestico", "geladeira", "forno", "cooktop"],
      esquadria: ["esquadria", "porta", "janela", "vidro"],
      componente: ["componente", "ferragem", "puxador", "bancada"],
    };

    const itemCategoryCompatible = (aiCategory: string, objectCategory: string, objectName: string) => {
      const ai = normText(aiCategory);
      const obj = normText(objectCategory);
      const name = normText(objectName);
      if (ai && (obj.includes(ai) || ai.includes(obj))) return true;
      const aliases = categoryAliases[ai] ?? [];
      return aliases.some((alias) => obj.includes(alias) || name.includes(alias));
    };

    const tokens = (value: unknown) =>
      new Set(normText(value).split(" ").filter((token) => token.length >= 3));

    const matchProjectObject = (item: { categoria: string; descricao: string }) => {
      const itemTokens = tokens(item.descricao);
      const candidates = projectObjects
        .map((obj) => {
          const objectTokens = tokens(`${obj.name} ${obj.category} ${obj.material ?? ""}`);
          let overlap = 0;
          for (const token of itemTokens) if (objectTokens.has(token)) overlap++;
          const categoryOk = itemCategoryCompatible(item.categoria, obj.category, obj.name);
          const score = overlap * 3 + (categoryOk ? 4 : 0);
          return { obj, score, categoryOk, overlap };
        })
        .filter(({ obj, score, categoryOk }) => Boolean(obj.dimensions) && categoryOk && score >= 4)
        .sort((a, b) => b.score - a.score);

      // Evita preencher medidas com correspondência textual fraca entre vários objetos.
      if (!candidates[0]) return null;
      if (candidates[1] && candidates[0].score === candidates[1].score && candidates[0].overlap === 0) return null;
      return candidates[0].obj;
    };

    const toCm = (value: unknown, unit: unknown): string | null => {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return null;
      const u = normText(unit);
      const factor = u === "m" || u.includes("metro") ? 100 : u === "mm" ? 0.1 : 1;
      return String(Math.round(n * factor * 10) / 10);
    };

    const counters = new Map<string, number>();
    const items = await db
      .insert(archSpecItemsTable)
      .values(
        aiItems.map(item => {
          const prefix = prefixForCategory(item.categoria);
          const next = (counters.get(prefix) ?? 0) + 1;
          counters.set(prefix, next);

          const projectObject = matchProjectObject(item);
          const dims = projectObject?.dimensions;
          const widthCm = dims ? toCm(dims.width, dims.unit) : null;
          const heightCm = dims ? toCm(dims.height, dims.unit) : null;
          const depthCm = dims ? toCm(dims.depth, dims.unit) : null;
          const hasProjectDimensions = Boolean(widthCm || heightCm || depthCm);

          return {
            specificationId: spec.id,
            categoria:       item.categoria,
            descricao:       item.descricao,
            quantidade:      Math.max(1, Math.round(item.quantidade)),
            confianca:       String(Math.min(1, Math.max(0.5, item.confianca)).toFixed(2)),
            status:          "pendente",
            codigo:          `${prefix}-${String(next).padStart(2, "0")}`,
            origemMedida:    hasProjectDimensions ? "projeto" : "pendente",
            unidadeQuantificacao: "un",
            larguraCm:       widthCm,
            alturaCm:        heightCm,
            profundidadeCm:  depthCm,
            material:        projectObject?.material ?? null,
            acabamento:      projectObject?.finish ?? null,
            cor:             projectObject?.color ?? null,
            notes: projectObject
              ? `Vinculado automaticamente ao objeto 3D "${projectObject.name}" (${projectObject.objectClientId}).`
              : null,
          };
        })
      )
      .returning();

    return res.json({ spec, items });
  } catch (err: unknown) {
    const { status, message } = sanitizeAIError(err);
    return res.status(status).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/arch/specification/:projetoId — especificação mais recente do projeto
// ─────────────────────────────────────────────────────────────────────────────
router.get("/arch/specification/:projetoId", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const projetoId = req.params.projetoId as string;

  const [spec] = await db
    .select()
    .from(archSpecificationsTable)
    .where(and(
      eq(archSpecificationsTable.tenantId, tid),
      eq(archSpecificationsTable.projetoId, projetoId),
    ))
    .orderBy(desc(archSpecificationsTable.createdAt))
    .limit(1);

  if (!spec) {
    return res.status(404).json({ error: "Nenhuma especificação encontrada." });
  }

  const items = await db
    .select()
    .from(archSpecItemsTable)
    .where(eq(archSpecItemsTable.specificationId, spec.id))
    .orderBy(archSpecItemsTable.categoria, archSpecItemsTable.descricao);

  return res.json({ spec, items });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/arch/specification/:id — atualiza medidas do ambiente (área,
// pé-direito) — preenchimento manual, não estimado por IA.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/arch/specification/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const specId = req.params.id as string;

  const parsed = updateArchSpecificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: String(parsed.error) });

  const [updated] = await db
    .update(archSpecificationsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(archSpecificationsTable.id, specId), eq(archSpecificationsTable.tenantId, tid)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Especificação não encontrada." });

  return res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/arch/specification/item/:itemId — atualiza status/match de um item
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/arch/specification/item/:itemId", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const itemId = req.params.itemId as string;

  const [ownership] = await db
    .select({ id: archSpecItemsTable.id, specificationId: archSpecItemsTable.specificationId })
    .from(archSpecItemsTable)
    .innerJoin(archSpecificationsTable, eq(archSpecificationsTable.id, archSpecItemsTable.specificationId))
    .where(and(
      eq(archSpecItemsTable.id, itemId),
      eq(archSpecificationsTable.tenantId, tid),
    ))
    .limit(1);

  if (!ownership) return res.status(404).json({ error: "Item não encontrado." });

  const parsed = updateArchSpecItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: String(parsed.error) });

  const [updated] = await db
    .update(archSpecItemsTable)
    .set(parsed.data)
    .where(eq(archSpecItemsTable.id, itemId))
    .returning();

  if (parsed.data.status) {
    const [counts] = await db
      .select({
        total:     sql<number>`count(*)`.mapWith(Number),
        specified: sql<number>`count(*) filter (where status = 'especificado')`.mapWith(Number),
      })
      .from(archSpecItemsTable)
      .where(eq(archSpecItemsTable.specificationId, ownership.specificationId));

    await db
      .update(archSpecificationsTable)
      .set({
        itemsCount:     counts?.total ?? 0,
        specifiedCount: counts?.specified ?? 0,
        updatedAt:      new Date(),
      })
      .where(eq(archSpecificationsTable.id, ownership.specificationId));
  }

  return res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/arch/specification/:specificationId/enviar-orcamento
// Ponte real especificação técnica → orçamento. Resolve cada item
// especificado (via catálogo vinculado ou override manual) e cria a linha
// correspondente em arch_orcamento_itens. Quality gate: só permite enviar
// se não sobrar nenhum item 'pendente' (todo item precisa ter sido resolvido
// como especificado ou marcado explicitamente como não-especificado).
// ─────────────────────────────────────────────────────────────────────────────
router.post("/arch/specification/:specificationId/enviar-orcamento", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const specificationId = req.params.specificationId as string;
  const requestedIds = Array.isArray((req.body as any)?.itemIds)
    ? (req.body as any).itemIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (requestedIds.length === 0) {
    return res.status(400).json({ error: "Selecione pelo menos um item confirmado para enviar ao orçamento." });
  }

  const [spec] = await db
    .select()
    .from(archSpecificationsTable)
    .where(and(eq(archSpecificationsTable.id, specificationId), eq(archSpecificationsTable.tenantId, tid)))
    .limit(1);

  if (!spec) return res.status(404).json({ error: "Especificação não encontrada." });

  const items = await db
    .select()
    .from(archSpecItemsTable)
    .where(eq(archSpecItemsTable.specificationId, specificationId));

  // Quality gate: somente itens explicitamente confirmados como parte do
  // escopo comercial podem virar linha de orçamento. Itens pendentes ficam
  // na revisão técnica; itens "nao_especificado" permanecem como referência.
  const requestedSet = new Set(requestedIds);
  const enviaveis = items.filter((i) => requestedSet.has(i.id) && i.status === "especificado");
  if (enviaveis.length === 0) {
    return res.status(422).json({ error: "Os itens selecionados ainda não foram confirmados como inclusos no orçamento." });
  }

  const invalidRequested = requestedIds.filter((id: string) => !items.some((item) => item.id === id));
  if (invalidRequested.length > 0) {
    return res.status(400).json({ error: "Há itens selecionados que não pertencem a esta especificação." });
  }

  // Resolve nome/preço/fornecedor de cada item — catálogo vinculado tem
  // prioridade, override manual é o fallback (mesma regra usada na tela de
  // especificação pra decidir o que mostrar).
  const catalogoIds = enviaveis.map((i) => i.catalogoItemId).filter(Boolean) as string[];
  const catalogoItens = catalogoIds.length
    ? await db.select().from(archCatalogoTable).where(inArray(archCatalogoTable.id, catalogoIds))
    : [];
  const catalogoMap = new Map(catalogoItens.map((c) => [c.id, c]));

  const novosItens = enviaveis.map((item) => {
    const catalogo = item.catalogoItemId ? catalogoMap.get(item.catalogoItemId) : undefined;
    const valorUnitario = catalogo?.precoBase ?? item.overridePreco ?? "0";
    const quantidade = item.quantidade ?? 1;
    return {
      projetoId: spec.projetoId,
      categoria: item.categoria,
      descricao: catalogo?.nome ?? item.overrideNome ?? item.descricao,
      quantidade: String(quantidade),
      unidade: catalogo?.unidade ?? "un",
      valorUnitario: String(valorUnitario),
      valorTotal: String(Number(valorUnitario) * Number(quantidade)),
      fornecedor: catalogo?.fornecedor ?? item.overrideFornecedor ?? null,
      produtoId: item.catalogoItemId ?? null,
      geradoPorIa: true,
    };
  });

  const inseridos = await db.insert(archOrcamentoItensTable).values(novosItens).returning();

  const pendentes = items.filter((item) => item.status === "pendente").length;
  const referencias = items.filter((item) => item.status === "nao_especificado").length;

  await db
    .update(archSpecificationsTable)
    .set({
      status: pendentes > 0 ? "enviado_orcamento_parcial" : "enviado_orcamento",
      updatedAt: new Date(),
    })
    .where(eq(archSpecificationsTable.id, specificationId));

  req.log.info(
    { tenantId: tid, specificationId, itensCriados: inseridos.length, pendentes, referencias },
    "arch/specification: itens confirmados enviados pro orçamento",
  );

  return res.status(201).json({
    success: true,
    itensCriados: inseridos.length,
    pendentes,
    referencias,
    itens: inseridos,
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SPRINT 6 — ECOSYSTEM ENGINE: Partner Directory + Solicitações
// ═════════════════════════════════════════════════════════════════════════════

// ── Helper: send partner notification via Resend ──────────────────────────────
async function sendPartnerEmail(opts: {
  to: string; subject: string; html: string
}): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey || !opts.to) return false;
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "arqdor.ai <noreply@vendorai.app>",
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    return resp.ok;
  } catch { return false; }
}

// ── GET /arch/partners — listar parceiros do tenant (com search + tipo filter) ─
router.get("/arch/partners", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { q, tipo } = req.query as Record<string, string>;

  const conditions = [
    eq(archPartnersTable.tenantId, tid),
    eq(archPartnersTable.ativo, true),
  ];
  if (tipo && tipo !== "todos") {
    conditions.push(eq(archPartnersTable.tipo, tipo));
  }
  if (q?.trim()) {
    conditions.push(
      sql`(${archPartnersTable.nome} ilike ${"%" + q + "%"} OR ${archPartnersTable.cidade} ilike ${"%" + q + "%"} OR ${archPartnersTable.especialidades}::text ilike ${"%" + q + "%"})`
    );
  }

  const rows = await db
    .select()
    .from(archPartnersTable)
    .where(and(...conditions))
    .orderBy(desc(archPartnersTable.createdAt));

  return res.json(rows);
});

// ── POST /arch/partners — criar parceiro ──────────────────────────────────────
router.post("/arch/partners", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const parsed = insertArchPartnerSchema.safeParse({ ...req.body, tenantId: tid });
  if (!parsed.success) return res.status(400).json({ error: String(parsed.error) });

  let connectedTenantId = parsed.data.connectedTenantId ?? null;

  if (connectedTenantId) {
    const [target] = await db.select({ id: tenantsTable.id }).from(tenantsTable)
      .where(and(eq(tenantsTable.id, connectedTenantId), eq(tenantsTable.status, "active"), ne(tenantsTable.id, tid)))
      .limit(1);
    if (!target) return res.status(422).json({ error: "Tenant VendorAI informado não está disponível para conexão." });
  } else {
    const [matched] = await db.select({ id: tenantsTable.id }).from(tenantsTable)
      .where(and(
        eq(tenantsTable.status, "active"),
        ne(tenantsTable.id, tid),
        sql`lower(trim(${tenantsTable.name})) = lower(trim(${parsed.data.nome}))`,
      ))
      .limit(1);
    connectedTenantId = matched?.id ?? null;
  }

  const [created] = await db
    .insert(archPartnersTable)
    .values({
      ...parsed.data,
      connectedTenantId,
      partnerSource: connectedTenantId ? "tenant" : "external",
    })
    .returning();

  return res.status(201).json(created);
});

// ── PATCH /arch/partners/:id — atualizar parceiro ─────────────────────────────
router.patch("/arch/partners/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const [existing] = await db
    .select({ id: archPartnersTable.id })
    .from(archPartnersTable)
    .where(and(eq(archPartnersTable.id, (req.params.id as string)), eq(archPartnersTable.tenantId, tid)))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Parceiro não encontrado." });

  const parsed = updateArchPartnerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: String(parsed.error) });

  const [updated] = await db
    .update(archPartnersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(archPartnersTable.id, (req.params.id as string)))
    .returning();

  return res.json(updated);
});

// ── DELETE /arch/partners/:id — desativar parceiro (soft delete) ──────────────
router.delete("/arch/partners/:id", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const [existing] = await db
    .select({ id: archPartnersTable.id })
    .from(archPartnersTable)
    .where(and(eq(archPartnersTable.id, (req.params.id as string)), eq(archPartnersTable.tenantId, tid)))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Parceiro não encontrado." });

  await db
    .update(archPartnersTable)
    .set({ ativo: false, updatedAt: new Date() })
    .where(eq(archPartnersTable.id, (req.params.id as string)));

  return res.json({ ok: true });
});

// ── POST /arch/partners/:id/solicitar — criar solicitação ─────────────────────
router.post("/arch/partners/:id/solicitar", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const partnerId = (req.params.id as string) as string;
  const { tipo, mensagem, canal, projetoId, projetoTitulo, catalogoItemId, itemNome,
    participationEnabled, participationPercent, platformFeePercent, attributionWindowDays } = req.body as {
    tipo: string; mensagem?: string; canal?: string
    projetoId?: string; projetoTitulo?: string; catalogoItemId?: string; itemNome?: string
    participationEnabled?: boolean; participationPercent?: number; platformFeePercent?: number; attributionWindowDays?: number
  };

  const [partner] = await db
    .select()
    .from(archPartnersTable)
    .where(and(eq(archPartnersTable.id, partnerId), eq(archPartnersTable.tenantId, tid)))
    .limit(1);

  if (!partner) return res.status(404).json({ error: "Parceiro não encontrado." });
  const TIPO_LABELS: Record<string, string> = {
    orcamento: "Orçamento", amostra: "Amostra", visita: "Visita Técnica", compartilhar: "Compartilhamento de Projeto",
  };

  const canalEnvio = partner.connectedTenantId ? "app" : (canal ?? "manual");
  const participacaoAtiva = tipo === "orcamento" && participationEnabled === true;
  const participacao = participacaoAtiva ? Math.max(0, Math.min(100, Number(participationPercent ?? 10))) : null;
  const taxaPlataforma = participacaoAtiva ? Math.max(0, Math.min(100, Number(platformFeePercent ?? 1))) : null;
  const janelaAtribuicao = Math.max(0, Number(attributionWindowDays ?? 90));
  const externalAccessToken = partner.connectedTenantId ? null : crypto.randomUUID();
  const publicBaseUrl = (process.env["PUBLIC_APP_URL"] ?? process.env["FRONTEND_URL"] ?? "https://app.appvendorai.com").replace(/\/$/, "");
  const externalQuoteUrl = externalAccessToken ? `${publicBaseUrl}/api/arch/external-quote/${externalAccessToken}` : null;
  let enviadoEm: Date | undefined;

  if (partner.connectedTenantId) {
    enviadoEm = new Date();
  }

  // Tentar envio por email se parceiro tiver email e canal = email
  if (canalEnvio === "email" && partner.email) {
    const tipoLabel = TIPO_LABELS[tipo] ?? tipo;
    const sent = await sendPartnerEmail({
      to: partner.email,
      subject: `Solicitação de ${tipoLabel} — arqdor.ai`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
          <h2 style="font-size:20px;color:#111;margin:0 0 16px;">Solicitação de ${tipoLabel}</h2>
          ${projetoTitulo ? `<p style="color:#444;font-size:14px;margin:0 0 12px;">📁 Projeto: <strong>${projetoTitulo}</strong></p>` : ""}
          ${itemNome ? `<p style="color:#444;font-size:14px;margin:0 0 12px;">📋 Item: <strong>${itemNome}</strong></p>` : ""}
          ${mensagem ? `<div style="background:#f4f4f5;border-radius:8px;padding:16px;margin:16px 0;font-size:14px;color:#374151;line-height:1.6;">${mensagem.replace(/\n/g, "<br>")}</div>` : ""}
          ${externalQuoteUrl ? `<p style="margin:20px 0;"><a href="${externalQuoteUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#6d28d9;color:white;text-decoration:none;font-weight:700;">Abrir projeto e responder orçamento</a></p>` : ""}
          <p style="color:#6b7280;font-size:13px;margin-top:24px;">Esta solicitação foi enviada via <strong>arqdor.ai</strong> — Ecosystem Engine.</p>
        </div>
      `,
    });
    if (sent) enviadoEm = new Date();
  }

  const [sol] = await db
    .insert(archSolicitacoesTable)
    .values({
      tenantId:       tid,
      tipo,
      status:         enviadoEm ? "enviado" : "pendente",
      partnerId,
      parceiroNome:   partner.nome,
      projetoId:      projetoId ?? null,
      projetoTitulo:  projetoTitulo ?? null,
      catalogoItemId: catalogoItemId ?? null,
      itemNome:       itemNome ?? null,
      mensagem:       mensagem ?? null,
      canalEnvio:     canalEnvio,
      recipientTenantId: partner.connectedTenantId ?? null,
      participationEnabled: participacaoAtiva,
      participationPercent: participacao != null ? String(participacao) : null,
      platformFeePercent: taxaPlataforma != null ? String(taxaPlataforma) : null,
      agreementStatus: participacaoAtiva ? "pending" : "not_applicable",
      attributionWindowDays: janelaAtribuicao,
      attributionSource: "architect_project",
      externalAccessToken,
      metadata: {
        source: partner.connectedTenantId ? "vendorai_tenant" : "external_partner",
        partnerSource: partner.partnerSource,
        projectId: projetoId ?? null,
        catalogItemId: catalogoItemId ?? null,
      },
      enviadoEm:      enviadoEm ?? null,
    })
    .returning();

  if (sol?.recipientTenantId) {
    await db.insert(notificationsTable).values({
      tenantId: sol.recipientTenantId,
      title: "Nova solicitação de orçamento",
      message: `${projetoTitulo ?? "Projeto"} foi enviado por um parceiro para orçamento.`,
      type: "info",
      category: "arch_partner_quote",
    });
  }

  return res.status(201).json({ ...sol, emailSent: canalEnvio === "email" && !!enviadoEm });
});

// ── POST /arch/partners/compartilhar — compartilhar projeto com parceiro ───────
router.post("/arch/partners/compartilhar", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { partnerId, mensagem, canal, projetoId, projetoTitulo } = req.body as {
    partnerId: string; mensagem?: string; canal?: string; projetoId?: string; projetoTitulo?: string
  };

  const [partner] = await db
    .select()
    .from(archPartnersTable)
    .where(and(eq(archPartnersTable.id, partnerId), eq(archPartnersTable.tenantId, tid)))
    .limit(1);

  if (!partner) return res.status(404).json({ error: "Parceiro não encontrado." });
  let enviadoEm: Date | undefined;
  if ((canal === "email") && partner.email) {
    const sent = await sendPartnerEmail({
      to: partner.email,
      subject: `Projeto Compartilhado: ${projetoTitulo ?? "arqdor.ai"} — arqdor.ai`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
          <h2 style="font-size:20px;color:#111;margin:0 0 16px;">📁 Projeto Compartilhado</h2>
          <p style="color:#444;font-size:14px;margin:0 0 12px;">Você recebeu um projeto via <strong>arqdor.ai</strong>.</p>
          ${projetoTitulo ? `<div style="background:#f4f4f5;border-radius:8px;padding:12px 16px;margin-bottom:16px;"><strong style="font-size:16px;color:#111;">${projetoTitulo}</strong></div>` : ""}
          ${mensagem ? `<div style="background:#f9f9f9;border-radius:8px;padding:16px;font-size:14px;color:#374151;line-height:1.6;">${mensagem.replace(/\n/g, "<br>")}</div>` : ""}
          <p style="color:#6b7280;font-size:13px;margin-top:24px;">— Enviado via arqdor.ai · Ecosystem Engine</p>
        </div>
      `,
    });
    if (sent) enviadoEm = new Date();
  }

  const [sol] = await db
    .insert(archSolicitacoesTable)
    .values({
      tenantId:      tid,
      tipo:          "compartilhar",
      status:        enviadoEm ? "enviado" : "pendente",
      partnerId,
      parceiroNome:  partner.nome,
      projetoId:     projetoId ?? null,
      projetoTitulo: projetoTitulo ?? null,
      mensagem:      mensagem ?? null,
      canalEnvio:    canal ?? "manual",
      enviadoEm:     enviadoEm ?? null,
    })
    .returning();

  return res.status(201).json({ ...sol, emailSent: !!enviadoEm });
});

// ── POST /arch/projetos/:projetoId/solicitar-orcamentos — fluxo único multifornnecedor ─
router.post("/arch/projetos/:projetoId/solicitar-orcamentos", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const projetoId = String(req.params.projetoId);
  const body = z.object({
    projetoTitulo: z.string().optional(),
    partnerIds: z.array(z.string().min(1)).min(1).max(50),
    mensagem: z.string().optional(),
    participationEnabled: z.boolean().default(true),
    participationPercent: z.number().min(0).max(100).default(10),
    platformFeePercent: z.number().min(0).max(100).default(1),
    attributionWindowDays: z.number().int().min(0).max(3650).default(90),
    quoteScope: z.string().max(160).optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(422).json({ error: "INVALID_REQUEST", issues: body.error.issues });

  const partners = await db
    .select()
    .from(archPartnersTable)
    .where(and(eq(archPartnersTable.tenantId, tid), inArray(archPartnersTable.id, body.data.partnerIds), eq(archPartnersTable.ativo, true)));

  if (partners.length === 0) return res.status(404).json({ error: "Nenhum parceiro válido encontrado." });

  const rows = partners.map((partner) => ({
    tenantId: tid,
    recipientTenantId: partner.connectedTenantId ?? null,
    tipo: "orcamento",
    status: partner.connectedTenantId ? "enviado" : "pendente",
    partnerId: partner.id,
    parceiroNome: partner.nome,
    projetoId,
    projetoTitulo: body.data.projetoTitulo ?? null,
    mensagem: body.data.mensagem ?? null,
    canalEnvio: partner.connectedTenantId ? "app" : "manual",
    participationEnabled: body.data.participationEnabled,
    participationPercent: body.data.participationEnabled ? String(body.data.participationPercent) : null,
    platformFeePercent: body.data.participationEnabled ? String(body.data.platformFeePercent) : null,
    agreementStatus: body.data.participationEnabled ? "pending" : "not_applicable",
    attributionWindowDays: body.data.attributionWindowDays,
    attributionSource: "architect_project",
    quoteScope: body.data.quoteScope ?? null,
    externalAccessToken: partner.connectedTenantId ? null : crypto.randomUUID(),
    metadata: {
      source: partner.connectedTenantId ? "vendorai_tenant" : "external_partner",
      partnerSource: partner.partnerSource,
      bulkRequest: true,
    },
    enviadoEm: partner.connectedTenantId ? new Date() : null,
  }));

  const created = await db.insert(archSolicitacoesTable).values(rows).returning();

  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const publicBaseUrl = (process.env["PUBLIC_APP_URL"] ?? process.env["FRONTEND_URL"] ?? "https://app.appvendorai.com").replace(/\/$/, "");

  for (const sol of created) {
    if (sol.recipientTenantId) {
      await db.insert(notificationsTable).values({
        tenantId: sol.recipientTenantId,
        title: "Nova solicitação de orçamento",
        message: `${sol.projetoTitulo ?? "Projeto"} foi enviado para orçamento.`,
        type: "info",
        category: "arch_partner_quote",
      });
      continue;
    }

    const partner = sol.partnerId ? partnerById.get(sol.partnerId) : null;
    if (partner?.email && sol.externalAccessToken) {
      const link = `${publicBaseUrl}/api/arch/external-quote/${sol.externalAccessToken}`;
      const sent = await sendPartnerEmail({
        to: partner.email,
        subject: `Solicitação de Orçamento — ${sol.projetoTitulo ?? "Projeto"}`,
        html: `
          <div style="font-family:sans-serif;max-width:620px;margin:0 auto;padding:24px;">
            <h2>Solicitação de orçamento</h2>
            <p>Você recebeu um projeto para orçamento via <strong>arqdor.ai</strong>.</p>
            ${sol.projetoTitulo ? `<p><strong>Projeto:</strong> ${sol.projetoTitulo}</p>` : ""}
            ${sol.quoteScope ? `<p><strong>Escopo:</strong> ${sol.quoteScope}</p>` : ""}
            ${sol.mensagem ? `<p>${sol.mensagem}</p>` : ""}
            <p><a href="${link}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#6d28d9;color:#fff;text-decoration:none;font-weight:700;">Visualizar e responder orçamento</a></p>
            <p style="color:#6b7280;font-size:13px;">Não é necessário ser cliente VendorAI para responder.</p>
          </div>`,
      });
      if (sent) {
        await db.update(archSolicitacoesTable).set({ status: "enviado", enviadoEm: new Date() }).where(eq(archSolicitacoesTable.id, sol.id));
        sol.status = "enviado";
        sol.enviadoEm = new Date();
      }
    }
  }

  return res.status(201).json({
    projetoId,
    total: created.length,
    tenants: created.filter((x) => x.recipientTenantId).length,
    externos: created.filter((x) => !x.recipientTenantId).length,
    participation: {
      enabled: body.data.participationEnabled,
      percent: body.data.participationEnabled ? body.data.participationPercent : null,
      platformFeePercent: body.data.participationEnabled ? body.data.platformFeePercent : null,
      agreementStatus: body.data.participationEnabled ? "pending" : "not_applicable",
    },
    solicitacoes: created,
  });
});

// ── PATCH /arch/solicitacoes/:id/responder — aceite comercial do fornecedor ────
router.patch("/arch/solicitacoes/:id/responder", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const solicitacaoId = String(req.params.id);
  const parsed = z.object({
    resposta: z.enum(["accepted", "rejected"]),
    observacao: z.string().max(2000).optional(),
    quoteAmountCents: z.number().int().min(0).optional(),
    quoteDeliveryDays: z.number().int().min(0).max(3650).optional(),
    quoteValidUntil: z.string().datetime({ offset: true }).optional(),
    quoteProposalUrl: z.string().url().max(2000).optional(),
  }).safeParse(req.body);

  if (!parsed.success) return res.status(422).json({ error: "INVALID_RESPONSE", issues: parsed.error.issues });

  const [sol] = await db
    .select()
    .from(archSolicitacoesTable)
    .where(eq(archSolicitacoesTable.id, solicitacaoId))
    .limit(1);

  if (!sol) return res.status(404).json({ error: "Solicitação não encontrada." });

  const canRespond = sol.recipientTenantId === tid || sol.tenantId === tid;
  if (!canRespond) return res.status(403).json({ error: "FORBIDDEN" });

  const [updated] = await db
    .update(archSolicitacoesTable)
    .set({
      agreementStatus: sol.participationEnabled ? parsed.data.resposta : "not_applicable",
      status: parsed.data.resposta === "accepted" ? "respondido" : "concluido",
      quoteAmountCents: parsed.data.resposta === "accepted" ? (parsed.data.quoteAmountCents ?? sol.quoteAmountCents) : sol.quoteAmountCents,
      quoteDeliveryDays: parsed.data.resposta === "accepted" ? (parsed.data.quoteDeliveryDays ?? sol.quoteDeliveryDays) : sol.quoteDeliveryDays,
      quoteValidUntil: parsed.data.quoteValidUntil ? new Date(parsed.data.quoteValidUntil) : sol.quoteValidUntil,
      quoteProposalUrl: parsed.data.quoteProposalUrl ?? sol.quoteProposalUrl,
      quoteResponseMessage: parsed.data.observacao ?? sol.quoteResponseMessage,
      metadata: {
        ...(sol.metadata ?? {}),
        agreementResponse: parsed.data.resposta,
        agreementRespondedByTenantId: tid,
        agreementRespondedAt: new Date().toISOString(),
        agreementObservation: parsed.data.observacao ?? null,
      },
    })
    .where(eq(archSolicitacoesTable.id, solicitacaoId))
    .returning();

  if (sol.tenantId !== tid) {
    await db.insert(notificationsTable).values({
      tenantId: sol.tenantId,
      title: parsed.data.resposta === "accepted" ? "Fornecedor aceitou a participação" : "Fornecedor recusou a participação",
      message: `${sol.parceiroNome ?? "Fornecedor"} respondeu à solicitação do projeto ${sol.projetoTitulo ?? sol.projetoId ?? ""}.`,
      type: parsed.data.resposta === "accepted" ? "info" : "warning",
      category: "arch_partner_quote",
    });
  }

  return res.json(updated);
});

// ── GET /arch/solicitacoes — caixa de saída + entrada de parceiros ─────────────
router.get("/arch/solicitacoes", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const scope = String(req.query.scope ?? "all");
  const projetoId = typeof req.query.projetoId === "string" ? req.query.projetoId : null;

  const visibility = scope === "inbox"
    ? eq(archSolicitacoesTable.recipientTenantId, tid)
    : scope === "outbox"
      ? eq(archSolicitacoesTable.tenantId, tid)
      : or(eq(archSolicitacoesTable.tenantId, tid), eq(archSolicitacoesTable.recipientTenantId, tid));

  const where = projetoId
    ? and(visibility, eq(archSolicitacoesTable.projetoId, projetoId))
    : visibility;

  const rows = await db
    .select()
    .from(archSolicitacoesTable)
    .where(where)
    .orderBy(desc(archSolicitacoesTable.createdAt))
    .limit(200);

  return res.json(rows.map((row) => ({ ...row, direction: row.recipientTenantId === tid ? "inbox" : "outbox" })));
});

// ── POST /arch/solicitacoes/:id/selecionar — arquiteto escolhe a proposta ─────
router.post("/arch/solicitacoes/:id/selecionar", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const solicitacaoId = String(req.params.id);

  const [sol] = await db.select().from(archSolicitacoesTable)
    .where(and(eq(archSolicitacoesTable.id, solicitacaoId), eq(archSolicitacoesTable.tenantId, tid)))
    .limit(1);

  if (!sol) return res.status(404).json({ error: "Solicitação não encontrada." });
  if (sol.tipo !== "orcamento" || sol.agreementStatus !== "accepted" || sol.quoteAmountCents == null) {
    return res.status(422).json({ error: "A proposta precisa estar respondida, aceita e com valor informado." });
  }

  const groupConditions = [
    eq(archSolicitacoesTable.tenantId, tid),
    eq(archSolicitacoesTable.projetoId, sol.projetoId ?? ""),
    eq(archSolicitacoesTable.tipo, "orcamento"),
  ];
  if (sol.quoteScope) groupConditions.push(eq(archSolicitacoesTable.quoteScope, sol.quoteScope));

  await db.update(archSolicitacoesTable)
    .set({ selected: false, selectedAt: null, selectedByTenantId: null })
    .where(and(...groupConditions));

  const [selected] = await db.update(archSolicitacoesTable)
    .set({ selected: true, selectedAt: new Date(), selectedByTenantId: tid, status: "concluido" })
    .where(eq(archSolicitacoesTable.id, solicitacaoId))
    .returning();

  if (selected?.recipientTenantId) {
    await db.insert(notificationsTable).values({
      tenantId: selected.recipientTenantId,
      title: "Proposta selecionada",
      message: `Sua proposta para ${selected.projetoTitulo ?? "o projeto"} foi selecionada.`,
      type: "info",
      category: "arch_partner_quote",
    });
  }

  return res.json(selected);
});

// ── POST /arch/solicitacoes/:id/confirmar-venda — libera participação ─────────
router.post("/arch/solicitacoes/:id/confirmar-venda", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const solicitacaoId = String(req.params.id);
  const parsed = z.object({
    saleAmountCents: z.number().int().positive(),
    paymentId: z.string().min(3).max(180),
    receiptPercent: z.number().min(0).max(100).default(100),
  }).safeParse(req.body);

  if (!parsed.success) return res.status(422).json({ error: "INVALID_SALE", issues: parsed.error.issues });

  const [sol] = await db.select().from(archSolicitacoesTable)
    .where(eq(archSolicitacoesTable.id, solicitacaoId))
    .limit(1);

  if (!sol) return res.status(404).json({ error: "Solicitação não encontrada." });
  if (sol.recipientTenantId !== tid && sol.tenantId !== tid) return res.status(403).json({ error: "FORBIDDEN" });
  if (!sol.selected) return res.status(422).json({ error: "A proposta precisa estar selecionada antes de confirmar a venda." });
  if (!sol.participationEnabled || sol.agreementStatus !== "accepted") {
    return res.status(422).json({ error: "Não existe Participação de Especificação aceita para esta venda." });
  }

  const participationResult = await createSpecificationParticipation({
    tenantId: sol.tenantId,
    projectId: sol.projetoId,
    solicitationId: sol.id,
    architectActorId: sol.tenantId,
    baseAmountCents: parsed.data.saleAmountCents,
    participationPercent: Number(sol.participationPercent ?? 0),
    platformFeePercent: Number(sol.platformFeePercent ?? 0),
    paymentId: parsed.data.paymentId,
    receiptPercent: parsed.data.receiptPercent,
    metadata: {
      supplierTenantId: sol.recipientTenantId,
      partnerId: sol.partnerId,
      quoteScope: sol.quoteScope,
      projectTitle: sol.projetoTitulo,
    },
  });

  const [updated] = await db.update(archSolicitacoesTable)
    .set({
      saleConfirmedAt: new Date(),
      saleAmountCents: parsed.data.saleAmountCents,
      participationEventId: participationResult.event?.id ?? sol.participationEventId,
      metadata: {
        ...(sol.metadata ?? {}),
        salePaymentId: parsed.data.paymentId,
        receiptPercent: parsed.data.receiptPercent,
      },
    })
    .where(eq(archSolicitacoesTable.id, solicitacaoId))
    .returning();

  return res.json({ solicitacao: updated, participation: participationResult });
});

// ── Portal público leve para fornecedor externo (sem conta VendorAI) ──────────
archPublicRouter.get("/arch/external-quote/:token", async (req, res) => {
  const token = String(req.params.token);
  const [sol] = await db.select().from(archSolicitacoesTable)
    .where(eq(archSolicitacoesTable.externalAccessToken, token))
    .limit(1);

  if (!sol) return res.status(404).send("Solicitação não encontrada ou link inválido.");

  if (sol.status === "enviado" || sol.status === "pendente") {
    await db.update(archSolicitacoesTable).set({ status: "visualizado" }).where(eq(archSolicitacoesTable.id, sol.id));
  }

  const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m] ?? m));
  const participacao = sol.participationEnabled
    ? `<div class="notice"><strong>Participação de Especificação:</strong> ${esc(sol.participationPercent)}% · Taxa da plataforma: ${esc(sol.platformFeePercent)}%. Ao aceitar, esta condição fica vinculada a esta oportunidade.</div>`
    : "";

  return res.type("html").send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Solicitação de orçamento</title><style>
    body{font-family:Inter,Arial,sans-serif;background:#f6f7fb;margin:0;color:#18181b}.wrap{max-width:760px;margin:40px auto;padding:0 18px}.card{background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.05)}h1{font-size:24px;margin:0 0 8px}.muted{color:#71717a;font-size:14px}.notice{margin:18px 0;padding:14px;border-radius:10px;background:#f3e8ff;color:#581c87}label{display:block;font-size:13px;font-weight:700;margin:14px 0 5px}input,textarea{width:100%;box-sizing:border-box;padding:11px;border:1px solid #d4d4d8;border-radius:9px;font-size:14px}button{margin-top:18px;padding:12px 18px;border:0;border-radius:9px;background:#6d28d9;color:#fff;font-weight:800;cursor:pointer}.reject{background:#fff;color:#b91c1c;border:1px solid #fecaca;margin-left:8px}</style></head><body><div class="wrap"><div class="card">
    <div class="muted">arqdor.ai · Rede de Parceiros VendorAI</div><h1>${esc(sol.projetoTitulo ?? "Projeto para orçamento")}</h1>
    <p><strong>Escopo:</strong> ${esc(sol.quoteScope ?? sol.itemNome ?? "Orçamento do projeto")}</p>
    <p class="muted">${esc(sol.mensagem ?? "")}</p>${participacao}
    <form id="quoteForm">
      <label>Valor do orçamento (R$)</label><input id="amount" type="number" min="0" step="0.01" required value="${sol.quoteAmountCents != null ? Number(sol.quoteAmountCents)/100 : ""}"/>
      <label>Prazo de entrega/execução (dias)</label><input id="days" type="number" min="0" step="1" value="${esc(sol.quoteDeliveryDays ?? "")}"/>
      <label>Validade da proposta</label><input id="valid" type="date"/>
      <label>Link da proposta/PDF (opcional)</label><input id="url" type="url" value="${esc(sol.quoteProposalUrl ?? "")}"/>
      <label>Observações</label><textarea id="message" rows="5">${esc(sol.quoteResponseMessage ?? "")}</textarea>
      <button type="submit">Enviar proposta e aceitar condições</button><button type="button" class="reject" id="reject">Recusar</button>
    </form><p id="result" class="muted"></p>
  </div></div><script>
    const post=async(payload)=>{const r=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Falha ao responder");return d};
    document.getElementById("quoteForm").addEventListener("submit",async(e)=>{e.preventDefault();const amount=Math.round(Number(document.getElementById("amount").value||0)*100);const valid=document.getElementById("valid").value;try{await post({resposta:"accepted",quoteAmountCents:amount,quoteDeliveryDays:Number(document.getElementById("days").value||0),quoteValidUntil:valid?new Date(valid+"T23:59:59-03:00").toISOString():undefined,quoteProposalUrl:document.getElementById("url").value||undefined,observacao:document.getElementById("message").value||undefined});document.getElementById("result").textContent="Proposta enviada com sucesso.";document.getElementById("quoteForm").style.display="none"}catch(err){document.getElementById("result").textContent=err.message}});
    document.getElementById("reject").addEventListener("click",async()=>{try{await post({resposta:"rejected",observacao:document.getElementById("message").value||undefined});document.getElementById("result").textContent="Solicitação recusada.";document.getElementById("quoteForm").style.display="none"}catch(err){document.getElementById("result").textContent=err.message}});
  </script></body></html>`);
});

archPublicRouter.post("/arch/external-quote/:token", async (req, res) => {
  const token = String(req.params.token);
  const parsed = z.object({
    resposta: z.enum(["accepted", "rejected"]),
    observacao: z.string().max(2000).optional(),
    quoteAmountCents: z.number().int().min(0).optional(),
    quoteDeliveryDays: z.number().int().min(0).max(3650).optional(),
    quoteValidUntil: z.string().datetime({ offset: true }).optional(),
    quoteProposalUrl: z.string().url().max(2000).optional(),
  }).safeParse(req.body);

  if (!parsed.success) return res.status(422).json({ error: "Resposta inválida", issues: parsed.error.issues });

  const [sol] = await db.select().from(archSolicitacoesTable)
    .where(eq(archSolicitacoesTable.externalAccessToken, token))
    .limit(1);
  if (!sol) return res.status(404).json({ error: "Solicitação não encontrada." });

  const [updated] = await db.update(archSolicitacoesTable).set({
    agreementStatus: sol.participationEnabled ? parsed.data.resposta : "not_applicable",
    status: parsed.data.resposta === "accepted" ? "respondido" : "concluido",
    quoteAmountCents: parsed.data.quoteAmountCents ?? sol.quoteAmountCents,
    quoteDeliveryDays: parsed.data.quoteDeliveryDays ?? sol.quoteDeliveryDays,
    quoteValidUntil: parsed.data.quoteValidUntil ? new Date(parsed.data.quoteValidUntil) : sol.quoteValidUntil,
    quoteProposalUrl: parsed.data.quoteProposalUrl ?? sol.quoteProposalUrl,
    quoteResponseMessage: parsed.data.observacao ?? sol.quoteResponseMessage,
    metadata: {
      ...(sol.metadata ?? {}),
      externalResponse: true,
      agreementRespondedAt: new Date().toISOString(),
    },
  }).where(eq(archSolicitacoesTable.id, sol.id)).returning();

  await db.insert(notificationsTable).values({
    tenantId: sol.tenantId,
    title: parsed.data.resposta === "accepted" ? "Orçamento externo recebido" : "Fornecedor recusou a solicitação",
    message: `${sol.parceiroNome ?? "Fornecedor"} respondeu ao projeto ${sol.projetoTitulo ?? ""}.`,
    type: parsed.data.resposta === "accepted" ? "info" : "warning",
    category: "arch_partner_quote",
  });

  return res.json(updated);
});

// ═════════════════════════════════════════════════════════════════════════════
// SPRINT 7 — KNOWLEDGE ENGINE
// ═════════════════════════════════════════════════════════════════════════════

// ── Knowledge Extraction Helper ───────────────────────────────────────────────
function classifyKnowledgeTag(tag: string): string {
  if (["residencial","comercial","corporativo","hospitalar","educacional","industrial","misto"].some(t => tag.includes(t))) return "tipo_obra";
  if (["alto-padrao","medio-padrao","economico"].includes(tag)) return "padrao";
  if (["grande-porte","medio-porte","pequeno-porte"].includes(tag)) return "porte";
  if (tag.startsWith("fornecedor-")) return "fabricante";
  if (["concluido","em-andamento","alta-aprovacao"].includes(tag)) return "status";
  if (["piso","parede","teto","madeira","metal","pedra","vidro","ceramica","tecido","iluminacao"].some(m => tag.includes(m))) return "material";
  return "geral";
}

async function extractTenantKnowledge(tid: string): Promise<number> {
  // 1. Get all projects
  const projects = await db
    .select()
    .from(archProjetosTable)
    .where(eq(archProjetosTable.tenantId, tid))
    .limit(100);

  // 2. Get tenant catalog
  const catalog = await db
    .select({
      nome:       archCatalogoTable.nome,
      categoria:  archCatalogoTable.categoria,
      fornecedor: archCatalogoTable.fornecedor,
    })
    .from(archCatalogoTable)
    .where(eq(archCatalogoTable.tenantId, tid))
    .limit(60);

  // 3. Process each project
  for (const projeto of projects) {
    const [cenas, orcItems, prompts] = await Promise.all([
      db.select().from(archCenasTable).where(eq(archCenasTable.projetoId, projeto.id)),
      db.select().from(archOrcamentoItensTable).where(eq(archOrcamentoItensTable.projetoId, projeto.id)).limit(50),
      db.select({ prompt: archPromptVariationsTable.prompt })
        .from(archPromptVariationsTable)
        .where(eq(archPromptVariationsTable.tenantId, tid))
        .limit(10),
    ]);

    const renders = await db
      .select({ id: archRenderVersoesTable.id })
      .from(archRenderVersoesTable)
      .innerJoin(archCenasTable, eq(archCenasTable.id, archRenderVersoesTable.cenaId))
      .where(eq(archCenasTable.projetoId, projeto.id));

    // Build auto-tags
    const tags: string[] = [];
    if (projeto.tipoObra) tags.push(projeto.tipoObra.toLowerCase().replace(/\s+/g, "-").slice(0, 40));

    const orc = Number(projeto.orcamentoTotal);
    if (orc > 500_000) tags.push("alto-padrao");
    else if (orc > 100_000) tags.push("medio-padrao");
    else if (orc > 0) tags.push("economico");

    const area = Number(projeto.areaM2);
    if (area > 200) tags.push("grande-porte");
    else if (area > 80) tags.push("medio-porte");
    else if (area > 0) tags.push("pequeno-porte");

    if (projeto.status === "concluido") tags.push("concluido");
    const aprovadas = cenas.filter(c => c.status === "aprovado").length;
    if (cenas.length > 0 && aprovadas / cenas.length >= 0.7) tags.push("alta-aprovacao");

    catalog.forEach(item => {
      if (item.categoria) {
        const t = item.categoria.toLowerCase().slice(0, 30);
        if (!tags.includes(t)) tags.push(t);
      }
    });

    const fabricantes = [...new Set(orcItems.filter(i => i.fornecedor).map(i => i.fornecedor!))];
    const componentes  = orcItems.slice(0, 30).map(i => ({ descricao: i.descricao, categoria: i.categoria ?? null, fornecedor: i.fornecedor ?? null }));
    const materiaisUsados = catalog.map(i => ({ nome: i.nome, categoria: i.categoria ?? null, fornecedor: i.fornecedor ?? null }));
    const promptsUsados   = prompts.map(p => p.prompt.slice(0, 300));
    const uniqueTags      = [...new Set(tags)];

    await db
      .insert(archKnowledgeEntriesTable)
      .values({
        tenantId:        tid,
        projectId:       projeto.id,
        titulo:          projeto.titulo,
        tipo:            projeto.tipoObra ?? null,
        areaM2:          projeto.areaM2,
        orcamentoTotal:  projeto.orcamentoTotal,
        status:          projeto.status ?? null,
        tags:            uniqueTags,
        materiaisUsados,
        fabricantes,
        componentes,
        promptsUsados,
        renderCount:      renders.length,
        rendersAprovados: aprovadas,
        cenasCount:       cenas.length,
        revisoes:         Math.max(0, renders.length - cenas.length),
        snapshotAt:       new Date(),
      })
      .onConflictDoUpdate({
        target: archKnowledgeEntriesTable.projectId,
        set: {
          titulo:           projeto.titulo,
          tipo:             projeto.tipoObra ?? null,
          status:           projeto.status ?? null,
          tags:             uniqueTags,
          materiaisUsados,
          fabricantes,
          componentes,
          promptsUsados,
          renderCount:      renders.length,
          rendersAprovados: aprovadas,
          cenasCount:       cenas.length,
          revisoes:         Math.max(0, renders.length - cenas.length),
          snapshotAt:       new Date(),
          updatedAt:        new Date(),
        },
      });
  }

  // 4. Rebuild tag frequency index
  await db.delete(archKnowledgeTagsTable).where(eq(archKnowledgeTagsTable.tenantId, tid));

  const allEntries = await db
    .select({ tags: archKnowledgeEntriesTable.tags })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid));

  const tagFreq = new Map<string, number>();
  allEntries.forEach(e => {
    ((e.tags as string[] | null) ?? []).forEach(tag => tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1));
  });

  const total = allEntries.length || 1;
  const tagRows = [...tagFreq.entries()].map(([tag, count]) => ({
    tenantId: tid, tag, tipo: classifyKnowledgeTag(tag), count, score: count / total,
  }));

  if (tagRows.length > 0) {
    await db.insert(archKnowledgeTagsTable).values(tagRows);
  }

  return projects.length;
}

// ── POST /arch/knowledge/extract — extrai conhecimento de todos os projetos ───
router.post("/arch/knowledge/extract", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const count = await extractTenantKnowledge(tid);
  return res.json({ ok: true, projectsProcessed: count });
});

// ── GET /arch/knowledge/dashboard — painel de inteligência ────────────────────
router.get("/arch/knowledge/dashboard", authenticate, async (req, res) => {
  const tid = tenantId(req);

  // Auto-seed if empty
  const [check] = await db
    .select({ id: archKnowledgeEntriesTable.id })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid))
    .limit(1);
  if (!check) await extractTenantKnowledge(tid);

  // Aggregate stats
  const [stats] = await db
    .select({
      totalProjects:  sql<number>`count(*)`.mapWith(Number),
      totalRenders:   sql<number>`coalesce(sum(render_count), 0)`.mapWith(Number),
      totalAprovados: sql<number>`coalesce(sum(renders_aprovados), 0)`.mapWith(Number),
      avgRevisoes:    sql<number>`coalesce(avg(revisoes), 0)`.mapWith(Number),
      avgAreaM2:      sql<number>`coalesce(avg(area_m2::numeric), 0)`.mapWith(Number),
    })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid));

  // Top tipos de obra
  const topTipos = await db
    .select({
      tipo:  archKnowledgeEntriesTable.tipo,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(archKnowledgeEntriesTable)
    .where(and(eq(archKnowledgeEntriesTable.tenantId, tid), sql`tipo IS NOT NULL`))
    .groupBy(archKnowledgeEntriesTable.tipo)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  // Top tags
  const topTags = await db
    .select()
    .from(archKnowledgeTagsTable)
    .where(eq(archKnowledgeTagsTable.tenantId, tid))
    .orderBy(desc(archKnowledgeTagsTable.count))
    .limit(24);

  // Flatten fabricantes & materiais across entries
  const allEntries = await db
    .select({ fabricantes: archKnowledgeEntriesTable.fabricantes, materiaisUsados: archKnowledgeEntriesTable.materiaisUsados })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid));

  const fabFreq  = new Map<string, number>();
  const matFreq  = new Map<string, { count: number; cat: string }>();

  allEntries.forEach(e => {
    ((e.fabricantes as string[] | null) ?? []).forEach(f => fabFreq.set(f, (fabFreq.get(f) ?? 0) + 1));
    ((e.materiaisUsados as { nome: string; categoria: string | null }[] | null) ?? []).forEach(m => {
      const prev = matFreq.get(m.nome);
      matFreq.set(m.nome, { count: (prev?.count ?? 0) + 1, cat: m.categoria ?? "outros" });
    });
  });

  const topFabricantes = [...fabFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  const topMateriais   = [...matFreq.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([nome, v]) => ({ nome, count: v.count, categoria: v.cat }));

  const approvalRate = (stats?.totalRenders ?? 0) > 0
    ? Math.round(((stats?.totalAprovados ?? 0) / stats.totalRenders) * 100)
    : 0;

  return res.json({
    totalProjects:  stats?.totalProjects ?? 0,
    totalRenders:   stats?.totalRenders ?? 0,
    approvalRate,
    avgRevisoes:    Math.round((stats?.avgRevisoes ?? 0) * 10) / 10,
    avgAreaM2:      Math.round(stats?.avgAreaM2 ?? 0),
    topTipos:       topTipos.filter(t => t.tipo),
    topTags,
    topFabricantes,
    topMateriais,
  });
});

// ── GET /arch/knowledge/patterns — biblioteca de padrões ──────────────────────
router.get("/arch/knowledge/patterns", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const entries = await db
    .select({
      tipo:             archKnowledgeEntriesTable.tipo,
      materiaisUsados:  archKnowledgeEntriesTable.materiaisUsados,
      fabricantes:      archKnowledgeEntriesTable.fabricantes,
      renderCount:      archKnowledgeEntriesTable.renderCount,
      rendersAprovados: archKnowledgeEntriesTable.rendersAprovados,
      tags:             archKnowledgeEntriesTable.tags,
    })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid));

  // Aggregate tipo × categoria combos
  const patterns = new Map<string, { count: number; aprovados: number; renders: number; tags: Set<string> }>();

  entries.forEach(e => {
    const mats = (e.materiaisUsados as { nome: string; categoria: string | null }[] | null) ?? [];
    const cats = [...new Set(mats.map(m => m.categoria).filter(Boolean) as string[])];
    const tipo  = e.tipo ?? "outros";
    const tags  = (e.tags as string[] | null) ?? [];

    cats.forEach(cat => {
      const key = `${tipo}|${cat}`;
      const prev = patterns.get(key) ?? { count: 0, aprovados: 0, renders: 0, tags: new Set<string>() };
      tags.forEach(t => prev.tags.add(t));
      patterns.set(key, {
        count:    prev.count + 1,
        aprovados:prev.aprovados + (e.rendersAprovados ?? 0),
        renders:  prev.renders + (e.renderCount ?? 0),
        tags:     prev.tags,
      });
    });

    // Also a fabricante-level pattern
    const fabs = (e.fabricantes as string[] | null) ?? [];
    fabs.forEach(fab => {
      const key = `${tipo}|fab:${fab}`;
      const prev = patterns.get(key) ?? { count: 0, aprovados: 0, renders: 0, tags: new Set<string>() };
      tags.forEach(t => prev.tags.add(t));
      patterns.set(key, {
        count:    prev.count + 1,
        aprovados:prev.aprovados + (e.rendersAprovados ?? 0),
        renders:  prev.renders + (e.renderCount ?? 0),
        tags:     prev.tags,
      });
    });
  });

  const result = [...patterns.entries()]
    .map(([key, v]) => {
      const [tipo, cat] = key.split("|");
      const isFab = cat?.startsWith("fab:");
      const approvalRate = v.renders > 0 ? Math.round((v.aprovados / v.renders) * 100) : 0;
      return {
        id: key,
        tipo,
        categoria:    isFab ? null : cat,
        fabricante:   isFab ? cat?.slice(4) : null,
        tipoPattern:  isFab ? "fabricante" : "material",
        count:        v.count,
        approvalRate,
        tags:         [...v.tags].slice(0, 6),
      };
    })
    .sort((a, b) => b.count - a.count || b.approvalRate - a.approvalRate)
    .slice(0, 24);

  return res.json(result);
});

// ── GET /arch/knowledge/ranking — ranking de combinações ─────────────────────
router.get("/arch/knowledge/ranking", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const entries = await db
    .select({
      tipo:             archKnowledgeEntriesTable.tipo,
      fabricantes:      archKnowledgeEntriesTable.fabricantes,
      materiaisUsados:  archKnowledgeEntriesTable.materiaisUsados,
      renderCount:      archKnowledgeEntriesTable.renderCount,
      rendersAprovados: archKnowledgeEntriesTable.rendersAprovados,
    })
    .from(archKnowledgeEntriesTable)
    .where(eq(archKnowledgeEntriesTable.tenantId, tid));

  // Score: 70% approval rate × 30% frequency weight
  const comboMap = new Map<string, { count: number; aprovados: number; renders: number }>();

  entries.forEach(e => {
    const tipo = e.tipo ?? "outros";
    const fabs = (e.fabricantes as string[] | null) ?? [];
    const mats = (e.materiaisUsados as { nome: string; categoria: string | null }[] | null) ?? [];
    const cats = [...new Set(mats.map(m => m.categoria).filter(Boolean) as string[])];

    // Fabricante combos
    fabs.forEach(fab => {
      const key = `fab|${tipo}|${fab}`;
      const prev = comboMap.get(key) ?? { count: 0, aprovados: 0, renders: 0 };
      comboMap.set(key, { count: prev.count + 1, aprovados: prev.aprovados + (e.rendersAprovados ?? 0), renders: prev.renders + (e.renderCount ?? 0) });
    });

    // Material category combos
    cats.forEach(cat => {
      const key = `mat|${tipo}|${cat}`;
      const prev = comboMap.get(key) ?? { count: 0, aprovados: 0, renders: 0 };
      comboMap.set(key, { count: prev.count + 1, aprovados: prev.aprovados + (e.rendersAprovados ?? 0), renders: prev.renders + (e.renderCount ?? 0) });
    });
  });

  const maxCount = Math.max(...[...comboMap.values()].map(v => v.count), 1);

  const ranked = [...comboMap.entries()]
    .map(([key, v]) => {
      const [kind, tipo, combo] = key.split("|");
      const approvalRate = v.renders > 0 ? (v.aprovados / v.renders) * 100 : 50;
      const freqScore    = (v.count / maxCount) * 100;
      const score        = approvalRate * 0.7 + freqScore * 0.3;
      return { key, kind, tipo, combo, count: v.count, approvalRate: Math.round(approvalRate), score: Math.round(score) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return res.json(ranked);
});

// ── GET /arch/knowledge/suggestions — sugestões automáticas ──────────────────
router.get("/arch/knowledge/suggestions", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const { projectId } = req.query as Record<string, string>;

  let tipo: string | null = null;
  if (projectId) {
    const [proj] = await db
      .select({ tipoObra: archProjetosTable.tipoObra })
      .from(archProjetosTable)
      .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tid)))
      .limit(1);
    tipo = proj?.tipoObra ?? null;
  }

  const conditions = [eq(archKnowledgeEntriesTable.tenantId, tid)];
  if (tipo) conditions.push(eq(archKnowledgeEntriesTable.tipo, tipo));
  if (projectId) conditions.push(sql`project_id != ${projectId}`);

  let candidates = await db
    .select()
    .from(archKnowledgeEntriesTable)
    .where(and(...conditions))
    .orderBy(desc(archKnowledgeEntriesTable.rendersAprovados))
    .limit(10);

  // Fallback to all entries
  if (candidates.length === 0 && tipo) {
    candidates = await db
      .select()
      .from(archKnowledgeEntriesTable)
      .where(eq(archKnowledgeEntriesTable.tenantId, tid))
      .orderBy(desc(archKnowledgeEntriesTable.rendersAprovados))
      .limit(10);
  }

  const matFreq  = new Map<string, { count: number; cat: string }>();
  const fabFreq  = new Map<string, number>();
  const tagFreq  = new Map<string, number>();
  const promptSet: string[] = [];

  candidates.forEach(c => {
    ((c.materiaisUsados as { nome: string; categoria: string | null }[] | null) ?? [])
      .forEach(m => { const prev = matFreq.get(m.nome); matFreq.set(m.nome, { count: (prev?.count ?? 0) + 1, cat: m.categoria ?? "outros" }); });
    ((c.fabricantes as string[] | null) ?? [])
      .forEach(f => fabFreq.set(f, (fabFreq.get(f) ?? 0) + 1));
    ((c.promptsUsados as string[] | null) ?? [])
      .forEach(p => { if (!promptSet.includes(p)) promptSet.push(p); });
    ((c.tags as string[] | null) ?? [])
      .forEach(t => tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1));
  });

  return res.json({
    basedOnProjects: candidates.length,
    tipo:            tipo ?? "geral",
    materiais:       [...matFreq.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([nome, v]) => ({ nome, count: v.count, categoria: v.cat })),
    fabricantes:     [...fabFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nome, count]) => ({ nome, count })),
    prompts:         promptSet.slice(0, 5),
    tags:            [...tagFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count })),
  });
});

// ── GET /arch/knowledge/tags — tag cloud do tenant ───────────────────────────
router.get("/arch/knowledge/tags", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const tags = await db
    .select()
    .from(archKnowledgeTagsTable)
    .where(eq(archKnowledgeTagsTable.tenantId, tid))
    .orderBy(desc(archKnowledgeTagsTable.count))
    .limit(50);
  return res.json(tags);
});

// ═════════════════════════════════════════════════════════════════════════════
// SPRINT 9 — OFFICE OPERATING SYSTEM
// ═════════════════════════════════════════════════════════════════════════════

const PIPELINE_STAGES = ["lead","briefing","anteprojeto","projeto","render","cliente","executivo","obra","concluido"] as const;
type PipelineStage = typeof PIPELINE_STAGES[number];

// ── GET /arch/office/pipeline — projetos agrupados por etapa ─────────────────
router.get("/arch/office/pipeline", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const projects = await db
    .select({
      id:            archProjetosTable.id,
      titulo:        archProjetosTable.titulo,
      clienteNome:   archProjetosTable.clienteNome,
      status:        archProjetosTable.status,
      tipoObra:      archProjetosTable.tipoObra,
      areaM2:        archProjetosTable.areaM2,
      pipelineStage: archProjetosTable.pipelineStage,
      prazoEstimado: archProjetosTable.prazoEstimado,
      createdAt:     archProjetosTable.createdAt,
      updatedAt:     archProjetosTable.updatedAt,
    })
    .from(archProjetosTable)
    .where(eq(archProjetosTable.tenantId, tid))
    .orderBy(desc(archProjetosTable.updatedAt));

  const grouped: Record<string, typeof projects> = {};
  PIPELINE_STAGES.forEach(s => { grouped[s] = []; });
  projects.forEach(p => {
    const s = (p.pipelineStage ?? p.status ?? "briefing") as string;
    const key = PIPELINE_STAGES.includes(s as PipelineStage) ? s : "briefing";
    grouped[key].push(p);
  });

  return res.json({ stages: PIPELINE_STAGES, projects: grouped });
});

// ── PATCH /arch/office/pipeline/:projectId/stage — mover etapa ───────────────
router.patch("/arch/office/pipeline/:projectId/stage", authenticate, async (req, res) => {
  const projectId = req.params.projectId as string;
  const { stage }     = req.body as { stage: string };
  const tid           = tenantId(req);

  if (!PIPELINE_STAGES.includes(stage as PipelineStage)) {
    return res.status(400).json({ error: "Stage inválido" });
  }

  await db
    .update(archProjetosTable)
    .set({ pipelineStage: stage, updatedAt: new Date() })
    .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tid)));

  return res.json({ ok: true, stage });
});

// ── GET /arch/office/dashboard — visão geral do escritório ───────────────────
router.get("/arch/office/dashboard", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const [projects, knowledgeOverview, templateCount, partnerCount] = await Promise.all([
    db.select({
      id:            archProjetosTable.id,
      titulo:        archProjetosTable.titulo,
      clienteNome:   archProjetosTable.clienteNome,
      pipelineStage: archProjetosTable.pipelineStage,
      status:        archProjetosTable.status,
      tipoObra:      archProjetosTable.tipoObra,
      updatedAt:     archProjetosTable.updatedAt,
    }).from(archProjetosTable)
      .where(eq(archProjetosTable.tenantId, tid))
      .orderBy(desc(archProjetosTable.updatedAt)),

    db.select({
      total:      sql<number>`count(*)`.mapWith(Number),
      renders:    sql<number>`coalesce(sum(render_count), 0)`.mapWith(Number),
      aprovados:  sql<number>`coalesce(sum(renders_aprovados), 0)`.mapWith(Number),
      avgRevisoes:sql<number>`coalesce(avg(revisoes), 0)`.mapWith(Number),
    }).from(archKnowledgeEntriesTable)
      .where(eq(archKnowledgeEntriesTable.tenantId, tid)),

    db.select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(archOfficeTemplatesTable)
      .where(eq(archOfficeTemplatesTable.tenantId, tid)),

    db.select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(archPartnersTable)
      .where(and(eq(archPartnersTable.tenantId, tid), eq(archPartnersTable.ativo, true))),
  ]);

  const ACTIVE = ["lead","briefing","anteprojeto","projeto","render","cliente","executivo","obra"];
  const byStage: Record<string, number> = {};
  PIPELINE_STAGES.forEach(s => { byStage[s] = 0; });
  projects.forEach(p => {
    const s = p.pipelineStage ?? p.status ?? "briefing";
    if (s in byStage) byStage[s]++;
  });

  const ks = knowledgeOverview[0];
  const approvalRate = (ks?.renders ?? 0) > 0 ? Math.round((ks.aprovados / ks.renders) * 100) : 0;

  return res.json({
    totalProjetos:  projects.length,
    projetosAtivos: projects.filter(p => ACTIVE.includes(p.pipelineStage ?? p.status ?? "")).length,
    emRender:       byStage["render"],
    concluidos:     byStage["concluido"],
    byStage,
    approvalRate,
    totalRenders:   ks?.renders ?? 0,
    avgRevisoes:    Math.round((ks?.avgRevisoes ?? 0) * 10) / 10,
    totalTemplates: templateCount[0]?.count ?? 0,
    totalParceiros: partnerCount[0]?.count ?? 0,
    recentActivity: projects.slice(0, 8),
  });
});

// ── GET /arch/office/dna — DNA do escritório ─────────────────────────────────
router.get("/arch/office/dna", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const [entries, tags, partners, catalog] = await Promise.all([
    db.select({
      materiaisUsados: archKnowledgeEntriesTable.materiaisUsados,
      fabricantes:     archKnowledgeEntriesTable.fabricantes,
      promptsUsados:   archKnowledgeEntriesTable.promptsUsados,
    }).from(archKnowledgeEntriesTable)
      .where(eq(archKnowledgeEntriesTable.tenantId, tid)),

    db.select()
      .from(archKnowledgeTagsTable)
      .where(eq(archKnowledgeTagsTable.tenantId, tid))
      .orderBy(desc(archKnowledgeTagsTable.count))
      .limit(30),

    db.select({
      nome:          archPartnersTable.nome,
      tipo:          archPartnersTable.tipo,
      especialidades:archPartnersTable.especialidades,
      cidade:        archPartnersTable.cidade,
    }).from(archPartnersTable)
      .where(and(eq(archPartnersTable.tenantId, tid), eq(archPartnersTable.ativo, true)))
      .limit(20),

    db.select({
      nome:      archCatalogoTable.nome,
      categoria: archCatalogoTable.categoria,
      fornecedor:archCatalogoTable.fornecedor,
    }).from(archCatalogoTable)
      .where(eq(archCatalogoTable.tenantId, tid))
      .limit(60),
  ]);

  const matFreq  = new Map<string, { count: number; cat: string }>();
  const fabFreq  = new Map<string, number>();
  const promptFreq = new Map<string, number>();

  entries.forEach(e => {
    ((e.materiaisUsados as { nome: string; categoria: string | null }[] | null) ?? [])
      .forEach(m => { const p = matFreq.get(m.nome); matFreq.set(m.nome, { count: (p?.count ?? 0) + 1, cat: m.categoria ?? "outros" }); });
    ((e.fabricantes as string[] | null) ?? [])
      .forEach(f => fabFreq.set(f, (fabFreq.get(f) ?? 0) + 1));
    ((e.promptsUsados as string[] | null) ?? [])
      .forEach(p => promptFreq.set(p, (promptFreq.get(p) ?? 0) + 1));
  });

  const catFreq = new Map<string, number>();
  catalog.forEach(c => { if (c.categoria) catFreq.set(c.categoria, (catFreq.get(c.categoria) ?? 0) + 1); });

  return res.json({
    totalProjetos:        entries.length,
    materiaisPreferidos:  [...matFreq.entries()].sort((a,b) => b[1].count-a[1].count).slice(0,12).map(([nome,v]) => ({ nome, count: v.count, categoria: v.cat })),
    fabricantesFavoritos: [...fabFreq.entries()].sort((a,b) => b[1]-a[1]).slice(0,10).map(([nome,count]) => ({ nome, count })),
    promptsFrequentes:    [...promptFreq.entries()].sort((a,b) => b[1]-a[1]).slice(0,6).map(([texto,count]) => ({ texto: texto.slice(0,200), count })),
    estilos:              tags.filter(t => ["tipo_obra","estilo"].includes(t.tipo)),
    padroes:              tags.filter(t => ["padrao","porte"].includes(t.tipo)),
    parceiros:            partners,
    biblioteca:           catalog.slice(0,30),
    categoriasLibrary:    [...catFreq.entries()].sort((a,b) => b[1]-a[1]).map(([cat,count]) => ({ cat, count })),
  });
});

// ── GET /arch/office/agenda — agenda inteligente ─────────────────────────────
router.get("/arch/office/agenda", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const projects = await db
    .select({
      id:            archProjetosTable.id,
      titulo:        archProjetosTable.titulo,
      clienteNome:   archProjetosTable.clienteNome,
      pipelineStage: archProjetosTable.pipelineStage,
      status:        archProjetosTable.status,
      tipoObra:      archProjetosTable.tipoObra,
      prazoEstimado: archProjetosTable.prazoEstimado,
      createdAt:     archProjetosTable.createdAt,
    }).from(archProjetosTable)
      .where(and(eq(archProjetosTable.tenantId, tid), sql`status != 'concluido'`))
      .orderBy(archProjetosTable.prazoEstimado);

  const events = projects
    .filter(p => p.prazoEstimado && p.prazoEstimado > 0)
    .map(p => {
      const due = new Date(p.createdAt);
      due.setDate(due.getDate() + (p.prazoEstimado ?? 30));
      const daysRemaining = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
      return {
        id:            p.id,
        titulo:        p.titulo,
        clienteNome:   p.clienteNome,
        pipelineStage: p.pipelineStage ?? p.status ?? "briefing",
        tipoObra:      p.tipoObra,
        dueDate:       due.toISOString().slice(0, 10),
        daysRemaining,
        urgente:       daysRemaining <= 7,
        atrasado:      daysRemaining < 0,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  // Without Google Calendar connection, also return projects without prazo as "backlog"
  const semPrazo = projects
    .filter(p => !p.prazoEstimado || p.prazoEstimado <= 0)
    .map(p => ({
      id:            p.id,
      titulo:        p.titulo,
      clienteNome:   p.clienteNome,
      pipelineStage: p.pipelineStage ?? p.status ?? "briefing",
      tipoObra:      p.tipoObra,
      dueDate:       null,
      daysRemaining: null,
      urgente:       false,
      atrasado:      false,
    }));

  return res.json({ events, semPrazo, total: events.length });
});

// ── POST /arch/office/agenda — criar evento de agenda ────────────────────────
router.post("/arch/office/agenda", authenticate, async (req, res) => {
  const { projectId, titulo, dueDate, nota } = req.body as Record<string, string>;
  const tid = tenantId(req);

  if (!projectId || !dueDate) {
    return res.status(400).json({ error: "projectId e dueDate são obrigatórios" });
  }

  // Compute prazoEstimado (days from project createdAt)
  const [proj] = await db.select({ createdAt: archProjetosTable.createdAt })
    .from(archProjetosTable)
    .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tid)))
    .limit(1);

  if (!proj) return res.status(404).json({ error: "Projeto não encontrado" });

  const due    = new Date(dueDate);
  const created = new Date(proj.createdAt);
  const daysDiff = Math.ceil((due.getTime() - created.getTime()) / 86_400_000);

  await db.update(archProjetosTable)
    .set({ prazoEstimado: Math.max(1, daysDiff), updatedAt: new Date() })
    .where(and(eq(archProjetosTable.id, projectId), eq(archProjetosTable.tenantId, tid)));

  return res.json({ ok: true, prazoEstimado: Math.max(1, daysDiff), titulo, nota });
});

// ── GET /arch/office/templates — listar templates ─────────────────────────────
router.get("/arch/office/templates", authenticate, async (req, res) => {
  const tid = tenantId(req);
  const templates = await db
    .select()
    .from(archOfficeTemplatesTable)
    .where(eq(archOfficeTemplatesTable.tenantId, tid))
    .orderBy(desc(archOfficeTemplatesTable.vezesCriado), desc(archOfficeTemplatesTable.createdAt));
  return res.json(templates);
});

// ── POST /arch/office/templates — criar template ──────────────────────────────
router.post("/arch/office/templates", authenticate, async (req, res) => {
  const tid  = tenantId(req);
  const body = req.body as {
    nome: string; descricao?: string; tipoObra?: string; estiloBase?: string;
    prazoEstimado?: number; orcamentoBase?: number;
    ambientes?: { nome: string; descricao?: string }[];
    materiais?: { nome: string; categoria: string; fornecedor?: string }[];
    prompts?: string[];
  };

  if (!body.nome) return res.status(400).json({ error: "nome é obrigatório" });

  const [tmpl] = await db
    .insert(archOfficeTemplatesTable)
    .values({
      tenantId:       tid,
      nome:           body.nome,
      descricao:      body.descricao,
      tipoObra:       body.tipoObra,
      estiloBase:     body.estiloBase,
      prazoEstimado:  body.prazoEstimado,
      orcamentoBase:  body.orcamentoBase ? String(body.orcamentoBase) : undefined,
      ambientes:      body.ambientes ?? [],
      materiais:      body.materiais ?? [],
      prompts:        body.prompts ?? [],
    })
    .returning();

  return res.status(201).json(tmpl);
});

// ── DELETE /arch/office/templates/:id — remover template ─────────────────────
router.delete("/arch/office/templates/:id", authenticate, async (req, res) => {
  const id = (req.params.id as string) as string;
  const tid    = tenantId(req);
  await db.delete(archOfficeTemplatesTable)
    .where(and(eq(archOfficeTemplatesTable.id, id), eq(archOfficeTemplatesTable.tenantId, tid)));
  return res.json({ ok: true });
});

// ── GET /arch/office/indicators — KPIs do escritório ─────────────────────────
router.get("/arch/office/indicators", authenticate, async (req, res) => {
  const tid = tenantId(req);

  const [projectStats, projectsByStage, knowledge, recentCount] = await Promise.all([
    db.select({
      total:    sql<number>`count(*)`.mapWith(Number),
      avgDias:  sql<number>`
        coalesce(avg(
          extract(epoch from (updated_at - created_at)) / 86400
        ), 0)
      `.mapWith(Number),
    }).from(archProjetosTable)
      .where(eq(archProjetosTable.tenantId, tid)),

    db.select({
      stage: archProjetosTable.pipelineStage,
      count: sql<number>`count(*)`.mapWith(Number),
    }).from(archProjetosTable)
      .where(eq(archProjetosTable.tenantId, tid))
      .groupBy(archProjetosTable.pipelineStage),

    db.select({
      total:       sql<number>`count(*)`.mapWith(Number),
      renders:     sql<number>`coalesce(sum(render_count), 0)`.mapWith(Number),
      aprovados:   sql<number>`coalesce(sum(renders_aprovados), 0)`.mapWith(Number),
      revisoes:    sql<number>`coalesce(avg(revisoes), 0)`.mapWith(Number),
      iaRenderers: sql<number>`coalesce(sum(render_count), 0)`.mapWith(Number),
    }).from(archKnowledgeEntriesTable)
      .where(eq(archKnowledgeEntriesTable.tenantId, tid)),

    db.select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(archProjetosTable)
      .where(and(
        eq(archProjetosTable.tenantId, tid),
        sql`created_at >= now() - interval '30 days'`,
      )),
  ]);

  const ps = projectStats[0];
  const ks = knowledge[0];
  const approvalRate = (ks?.renders ?? 0) > 0 ? Math.round((ks.aprovados / ks.renders) * 100) : 0;
  const avgRendersPerProjeto = (ks?.total ?? 0) > 0 ? Math.round((ks.renders / ks.total) * 10) / 10 : 0;

  // Stage funnel
  const stageCounts: Record<string, number> = {};
  PIPELINE_STAGES.forEach(s => { stageCounts[s] = 0; });
  projectsByStage.forEach(r => {
    if (r.stage && r.stage in stageCounts) stageCounts[r.stage] = r.count;
  });

  return res.json({
    totalProjetos:        ps?.total ?? 0,
    projetosUltimos30Dias:recentCount[0]?.count ?? 0,
    tempMedioProjeto:     Math.round(ps?.avgDias ?? 0),
    totalRenders:         ks?.renders ?? 0,
    taxaAprovacao:        approvalRate,
    avgRendersPerProjeto,
    avgRevisoes:          Math.round((ks?.revisoes ?? 0) * 10) / 10,
    usoIA:                ks?.renders ?? 0,
    funnel:               stageCounts,
  });
});

export { archPublicRouter };
export default router;