import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const MODEL_FILE_LIMIT = 45 * 1024 * 1024;
export type ModelCalibration = {
  measuredDistance: number; actualMeters: number;
  referenceDimensions: { width: number; depth: number; height: number };
  tolerance: number;
};
export type ModelRecord = {
  id: string; sha256: string; key: string; originalName: string; bytes: number;
  createdAt: string; format: "glb"; meshCount: number;
  materials: { name: string; specificationStatus: "unconfirmed" }[];
  geometryStatus: "requires_review"; quantitiesEnabled: false;
};

export function safeSegment(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error("Identificador inválido");
  return value;
}

export function inspectEmbeddedGlb(buffer: Buffer) {
  if (buffer.length > MODEL_FILE_LIMIT) throw new Error("Modelo excede 45 MB");
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "glTF" ||
      buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error("Envie um GLB 2.0 válido");
  }
  const length = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a || length % 4 !== 0 ||
      length > 16 * 1024 * 1024 || length > buffer.length - 20) {
    throw new Error("Metadados GLB inválidos");
  }
  const document = JSON.parse(buffer.toString("utf8", 20, 20 + length));
  if (!document || document.asset?.version !== "2.0") throw new Error("Metadados glTF 2.0 obrigatórios");
  for (const name of ["buffers", "images", "meshes", "materials"]) {
    if (document[name] !== undefined && !Array.isArray(document[name])) throw new Error("Estrutura GLB inválida");
  }
  for (const resource of [...(document.buffers ?? []), ...(document.images ?? [])]) {
    if (!resource || typeof resource !== "object") throw new Error("Recurso GLB inválido");
    if (resource.uri !== undefined && (typeof resource.uri !== "string" || !resource.uri.startsWith("data:"))) {
      throw new Error("GLB deve incorporar os recursos. Não são aceitos arquivos externos.");
    }
  }
  if (!document.meshes?.length) throw new Error("Modelo sem malhas");
  return {
    meshCount: document.meshes.length as number,
    materials: (document.materials ?? []).map((material: { name?: unknown }, index: number) => ({
      name: typeof material?.name === "string" ? material.name.slice(0, 200) : `Material ${index + 1}`,
      specificationStatus: "unconfirmed" as const,
    })),
  };
}

export function validateCalibration(input: unknown): ModelCalibration {
  if (!input || typeof input !== "object") throw new Error("Informe medidas de referência");
  const body = input as Record<string, any>;
  const positive = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error("As medidas devem ser números positivos e finitos");
    return value;
  };
  const measuredDistance = positive(body.measuredDistance);
  const actualMeters = positive(body.actualMeters);
  positive(actualMeters / measuredDistance);
  const tolerance = positive(body.tolerance ?? .01);
  if (tolerance > .05) throw new Error("Tolerância máxima de 5%");
  return { measuredDistance, actualMeters, tolerance, referenceDimensions: {
    width: positive(body.referenceDimensions?.width), depth: positive(body.referenceDimensions?.depth),
    height: positive(body.referenceDimensions?.height),
  } };
}


export type ModelSceneSettings = {
  sunlight: number;
  materials: Record<string, string>;
  cameras: Array<{ name: string; position: [number, number, number]; target: [number, number, number] }>;
};
export function validateSceneSettings(value: unknown): ModelSceneSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Configuração de cena inválida");
  const input = value as Record<string, unknown>;
  if (typeof input.sunlight !== "number" || !Number.isFinite(input.sunlight) || input.sunlight < 0 || input.sunlight > 4)
    throw new Error("Intensidade solar fora do intervalo");
  if (!input.materials || typeof input.materials !== "object" || Array.isArray(input.materials)) throw new Error("Materiais inválidos");
  const entries = Object.entries(input.materials);
  if (entries.length > 2000 || entries.some(([key, color]) => key.length > 128 || !/^mat-(0|[1-9][0-9]{0,5})$/.test(key) || typeof color !== "string" || !/^#[a-fA-F0-9]{6}$/.test(color)))
    throw new Error("Cores de superfície inválidas");
  if (!Array.isArray(input.cameras) || input.cameras.length > 100) throw new Error("Câmeras inválidas");
  const tuple = (value: unknown): value is [number, number, number] =>
    Array.isArray(value) && value.length === 3 && value.every(item => typeof item === "number" && Number.isFinite(item) && Math.abs(item) <= 1e8);
  const cameras = input.cameras.map((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") throw new Error("Câmera inválida");
    const item = candidate as Record<string, unknown>;
    if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 80 || !tuple(item.position) || !tuple(item.target)) throw new Error("Dados de câmera inválidos");
    return { name: item.name, position: item.position, target: item.target };
  });
  return { sunlight: input.sunlight, materials: Object.fromEntries(entries) as Record<string, string>, cameras };
}

export class ModelFileStore {
  root: string;
  constructor(root: string) { this.root = path.resolve(root); }

  private async directory(tenantId: string, projectId: string, modelId?: string) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const root = await realpath(this.root);
    let current = root;
    for (const segment of [tenantId, projectId, ...(modelId ? [modelId] : [])]) {
      const next = path.join(current, safeSegment(segment));
      await mkdir(next, { recursive: true, mode: 0o700 });
      if (await realpath(next) !== next) throw new Error("Diretório privado inválido");
      current = next;
    }
    return current;
  }

  private async privateRead(directory: string, filename: string) {
    const target = path.join(directory, filename);
    if (await realpath(target) !== target) throw new Error("Arquivo privado inválido");
    return readFile(target);
  }

  async save(tenantId: string, projectId: string, originalName: string, buffer: Buffer): Promise<ModelRecord> {
    const summary = inspectEmbeddedGlb(buffer);
    const id = randomUUID();
    const directory = await this.directory(tenantId, projectId, id);
    const record: ModelRecord = {
      id, sha256: createHash("sha256").update(buffer).digest("hex"),
      key: `${projectId}/${id}/model.glb`, originalName: path.basename(originalName).slice(0, 200),
      bytes: buffer.length, createdAt: new Date().toISOString(), format: "glb", ...summary,
      geometryStatus: "requires_review", quantitiesEnabled: false,
    };
    try {
      await writeFile(path.join(directory, "model.glb"), buffer, { flag: "wx", mode: 0o600 });
      await writeFile(path.join(directory, "metadata.tmp"), JSON.stringify(record), { flag: "wx", mode: 0o600 });
      await rename(path.join(directory, "metadata.tmp"), path.join(directory, "metadata.json"));
      return record;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async attachConvertedSource(tenantId: string, projectId: string, modelId: string,
    originalName: string, source: Buffer, sourceSha256: string, conversionDetails?: Record<string, unknown>) {
    const record = await this.get(tenantId, projectId, modelId);
    if (!/\\.(obj|fbx)$/i.test(originalName)) throw new Error("Extensão de origem inválida");
    const sha = createHash("sha256").update(source).digest("hex");
    if (sha !== sourceSha256) throw new Error("SHA256 de origem divergente");
    const directory = await this.directory(tenantId, projectId, modelId);
    const extension = path.extname(originalName).toLowerCase();
    await writeFile(path.join(directory, `source${extension}`), source, { flag: "wx", mode: 0o600 });
    const audit = { originalName: path.basename(originalName).slice(0, 200), sourceSha256: sha,
      sourceBytes: source.length, convertedSha256: record.sha256,
      geometryApproved: false, materialsApproved: false,
      status: "converted_pending_geometry_review",
      geometryReport: conversionDetails ?? null };
    await writeFile(path.join(directory, "conversion-report.json"), JSON.stringify(audit), { flag: "wx", mode: 0o600 });
    return audit;
  }

  async list(tenantId: string, projectId: string): Promise<ModelRecord[]> {
    const directory = await this.directory(tenantId, projectId);
    const entries = await readdir(directory, { withFileTypes: true });
    const records = await Promise.all(entries.filter(entry => entry.isDirectory()).map(async entry => {
      try { return await this.get(tenantId, projectId, entry.name); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    }));
    return records.filter((record): record is ModelRecord => record !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(tenantId: string, projectId: string, modelId: string): Promise<ModelRecord> {
    const directory = await this.directory(tenantId, projectId, modelId);
    return JSON.parse((await this.privateRead(directory, "metadata.json")).toString("utf8"));
  }

  async file(tenantId: string, projectId: string, modelId: string) {
    const record = await this.get(tenantId, projectId, modelId);
    const buffer = await this.privateRead(await this.directory(tenantId, projectId, modelId), "model.glb");
    if (createHash("sha256").update(buffer).digest("hex") !== record.sha256) throw new Error("Integridade do modelo inválida");
    return { record, buffer };
  }

  async sceneSettings(tenantId: string, projectId: string, modelId: string) {
    const record = await this.get(tenantId, projectId, modelId);
    const directory = await this.directory(tenantId, projectId, modelId);
    try {
      const saved = JSON.parse((await this.privateRead(directory, "scene-settings.json")).toString("utf8"));
      if (saved.modelSha256 !== record.sha256) throw new Error("Configuração de outra versão do modelo");
      return saved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { modelSha256: record.sha256, settings: { sunlight: 1.2, materials: {}, cameras: [] } };
      throw error;
    }
  }

  async saveSceneSettings(tenantId: string, projectId: string, modelId: string, userId: string, input: unknown) {
    const record = await this.get(tenantId, projectId, modelId);
    const settings = validateSceneSettings(input);
    const directory = await this.directory(tenantId, projectId, modelId);
    const draft = { modelSha256: record.sha256, settings, updatedBy: userId, updatedAt: new Date().toISOString() };
    const temp = path.join(directory, `scene-settings-${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(draft), { flag: "wx", mode: 0o600 });
      await rename(temp, path.join(directory, "scene-settings.json"));
    } finally { await rm(temp, { force: true }); }
    return draft;
  }

  async saveCalibration(tenantId: string, projectId: string, modelId: string, userId: string, input: unknown) {
    const calibration = validateCalibration(input);
    const record = await this.get(tenantId, projectId, modelId);
    const directory = await this.directory(tenantId, projectId, modelId);
    const draft = { id: randomUUID(), modelSha256: record.sha256, calibration, createdBy: userId,
      createdAt: new Date().toISOString(), status: "pending_worker_validation" };
    await writeFile(path.join(directory, `calibration-${draft.id}.json`), JSON.stringify(draft), { flag: "wx", mode: 0o600 });
    return draft;
  }

  async calibrations(tenantId: string, projectId: string, modelId: string) {
    await this.get(tenantId, projectId, modelId);
    const directory = await this.directory(tenantId, projectId, modelId);
    const entries = await readdir(directory);
    const drafts = await Promise.all(entries.filter(name => /^calibration-[a-f0-9-]+\.json$/.test(name))
      .map(async name => JSON.parse((await this.privateRead(directory, name)).toString("utf8"))));
    return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
