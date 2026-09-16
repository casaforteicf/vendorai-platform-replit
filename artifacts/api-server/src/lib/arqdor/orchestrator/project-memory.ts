import { and, desc, eq } from "drizzle-orm";
import {
  arqAieSnapshotsTable,
  arqdorWorkspaceProjectsTable,
  archProjetosTable,
  db,
} from "@workspace/db";

type WorkspaceProjectContext = {
  dna?: unknown;
  renderGoal?: unknown;
  style?: {
    name?: unknown;
    designIntent?: unknown;
    palette?: unknown;
    restrictions?: unknown;
  } | null;
  objects?: unknown;
  materials?: unknown;
};

type CopilotExchangeSnapshot = {
  type?: unknown;
  question?: unknown;
  answer?: unknown;
  intent?: unknown;
  specialists?: unknown;
};

function safeString(value: unknown, max = 600): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function compactNames(value: unknown, maxItems: number): string {
  if (!Array.isArray(value)) return "";
  return value
    .slice(0, maxItems)
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      return safeString(row.name ?? row.nome, 120);
    })
    .filter(Boolean)
    .join(", ");
}

function formatWorkspaceContext(contextBlob: unknown): string {
  if (!contextBlob || typeof contextBlob !== "object") return "";
  const ctx = contextBlob as WorkspaceProjectContext;
  const lines: string[] = [];

  const dna = safeString(ctx.dna, 900);
  const renderGoal = safeString(ctx.renderGoal, 500);
  const styleName = safeString(ctx.style?.name, 250);
  const materials = compactNames(ctx.materials, 12);
  const objects = compactNames(ctx.objects, 16);

  if (dna) lines.push(`DNA do projeto: ${dna}`);
  if (styleName) lines.push(`Estilo ativo: ${styleName}`);
  if (renderGoal) lines.push(`Objetivo do render: ${renderGoal}`);
  if (materials) lines.push(`Materiais ativos: ${materials}`);
  if (objects) lines.push(`Objetos principais: ${objects}`);

  return lines.join("\n");
}

function formatCopilotHistory(rows: Array<{ projectSnapshot: unknown; createdAt: Date }>): string {
  const exchanges = rows
    .map((row) => {
      if (!row.projectSnapshot || typeof row.projectSnapshot !== "object") return null;
      const snapshot = row.projectSnapshot as CopilotExchangeSnapshot;
      if (snapshot.type !== "copilot_exchange") return null;
      const question = safeString(snapshot.question, 500);
      const answer = safeString(snapshot.answer, 1000);
      if (!question && !answer) return null;
      return { question, answer, createdAt: row.createdAt };
    })
    .filter((row): row is { question: string; answer: string; createdAt: Date } => Boolean(row))
    .slice(0, 6)
    .reverse();

  if (exchanges.length === 0) return "";

  return exchanges
    .map((exchange, index) => {
      const stamp = exchange.createdAt.toISOString();
      return [
        `Troca ${index + 1} (${stamp})`,
        exchange.question ? `Usuário: ${exchange.question}` : "",
        exchange.answer ? `Copilot: ${exchange.answer}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

/**
 * Reuses the ARQDOR persistence that already exists:
 * - arqdor_workspace_projects.context_blob for Project DNA/live workspace context
 * - arq_aie_snapshots for previous copilot_exchange records
 *
 * No parallel memory store is created. Failures are non-blocking so Copilot can
 * still answer using the traditional project context assembled by arch.ts.
 */
export async function loadPersistedProjectMemory(
  tenantId: string,
  projectId?: string,
): Promise<string> {
  if (!tenantId || !projectId) return "";

  try {
    const [project] = await db
      .select({ id: archProjetosTable.id })
      .from(archProjetosTable)
      .where(and(
        eq(archProjetosTable.id, projectId),
        eq(archProjetosTable.tenantId, tenantId),
      ))
      .limit(1);

    if (!project) return "";

    const [workspaceRows, snapshotRows] = await Promise.all([
      db
        .select({ contextBlob: arqdorWorkspaceProjectsTable.contextBlob })
        .from(arqdorWorkspaceProjectsTable)
        .where(and(
          eq(arqdorWorkspaceProjectsTable.id, projectId),
          eq(arqdorWorkspaceProjectsTable.tenantId, tenantId),
        ))
        .limit(1),
      db
        .select({
          projectSnapshot: arqAieSnapshotsTable.projectSnapshot,
          createdAt: arqAieSnapshotsTable.createdAt,
        })
        .from(arqAieSnapshotsTable)
        .where(eq(arqAieSnapshotsTable.projetoId, projectId))
        .orderBy(desc(arqAieSnapshotsTable.createdAt))
        .limit(24),
    ]);

    const workspaceContext = formatWorkspaceContext(workspaceRows[0]?.contextBlob);
    const copilotHistory = formatCopilotHistory(snapshotRows);

    const sections: string[] = [];
    if (workspaceContext) {
      sections.push(`MEMÓRIA PERSISTIDA DO PROJETO\n${workspaceContext}`);
    }
    if (copilotHistory) {
      sections.push(`CONVERSAS ANTERIORES RELEVANTES DO COPILOT\n${copilotHistory}`);
    }

    return sections.join("\n\n");
  } catch {
    return "";
  }
}
