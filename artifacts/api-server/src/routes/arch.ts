[Reading 1000 lines from start (total: 10235 lines, 9235 remaining)]

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
