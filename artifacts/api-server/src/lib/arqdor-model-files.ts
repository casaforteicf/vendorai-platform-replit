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
