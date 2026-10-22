import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  appActionRegistryTable,
  appUsersTable,
  db,
} from "@workspace/db";
import type { RuntimeViewer } from "./app_runtime_data_sources.js";

type JsonObject = Record<string, unknown>;

export type RuntimeActionContext = {
  tenantId: string;
  appInstanceId: string;
  viewer: RuntimeViewer;
};

type ActionExecutor = (
  input: unknown,
  context: RuntimeActionContext,
) => Promise<JsonObject>;

export type RuntimeActionResolution =
  | { actionKey: string; status: "ok"; data: JsonObject }
  | { actionKey: string; status: "not_found" }
  | { actionKey: string; status: "forbidden" }
  | { actionKey: string; status: "invalid_input" };

export type RuntimeActionDescriptor = {
  key: string;
  inputSchema: JsonObject;
  requiredPermissions: string[];
  riskLevel: "low";
};

class RuntimeActionInputError extends Error {}

const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(160).optional(),
    phone: z.string().trim().min(3).max(40).nullable().optional(),
    locale: z.string().trim().min(2).max(35).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar",
  });

function parseProfileUpdate(input: unknown) {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) throw new RuntimeActionInputError("ACTION_INPUT_INVALID");
  return parsed.data;
}

const ACTION_EXECUTORS: Record<string, ActionExecutor> = {
  "viewer.profile.update": async (input, { tenantId, viewer }) => {
    const data = parseProfileUpdate(input);
    const updates: {
      displayName?: string;
      phone?: string | null;
      locale?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (data.displayName !== undefined) updates.displayName = data.displayName;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.locale !== undefined) updates.locale = data.locale;

    const [updated] = await db
      .update(appUsersTable)
      .set(updates)
      .where(
        and(
          eq(appUsersTable.id, viewer.id),
          eq(appUsersTable.tenantId, tenantId),
          eq(appUsersTable.status, "active"),
        ),
      )
      .returning({
        id: appUsersTable.id,
        displayName: appUsersTable.displayName,
        email: appUsersTable.email,
        phone: appUsersTable.phone,
        locale: appUsersTable.locale,
      });

    if (!updated) throw new RuntimeActionInputError("ACTION_TARGET_UNAVAILABLE");
    return updated;
  },
};

export async function loadInteractiveRuntimeActions(
  actionKeys: string[],
  permissions: string[],
): Promise<Map<string, RuntimeActionDescriptor>> {
  const normalized = Array.from(
    new Set(
      actionKeys
        .filter((key) => /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(key))
        .map((key) => key.slice(0, 100)),
    ),
  ).slice(0, 30);
  if (normalized.length === 0) return new Map();

  const rows = await db
    .select({
      key: appActionRegistryTable.key,
      inputSchema: appActionRegistryTable.inputSchema,
      executorKey: appActionRegistryTable.executorKey,
      requiredPermissions: appActionRegistryTable.requiredPermissions,
      riskLevel: appActionRegistryTable.riskLevel,
    })
    .from(appActionRegistryTable)
    .where(
      and(
        inArray(appActionRegistryTable.key, normalized),
        eq(appActionRegistryTable.status, "active"),
      ),
    );

  const permissionSet = new Set(permissions);
  return new Map(
    rows.flatMap((row) => {
      if (
        row.riskLevel !== "low" ||
        !row.executorKey ||
        !ACTION_EXECUTORS[row.executorKey]
      ) {
        return [];
      }
      const requiredPermissions = row.requiredPermissions ?? [];
      if (!requiredPermissions.every((permission) => permissionSet.has(permission))) {
        return [];
      }
      return [[
        row.key,
        {
          key: row.key,
          inputSchema: (row.inputSchema ?? {}) as JsonObject,
          requiredPermissions,
          riskLevel: "low" as const,
        },
      ] as const];
    }),
  );
}

export async function executeRuntimeAction(
  actionKey: string,
  input: unknown,
  context: RuntimeActionContext,
): Promise<RuntimeActionResolution> {
  const [action] = await db
    .select({
      key: appActionRegistryTable.key,
      executorKey: appActionRegistryTable.executorKey,
      requiredPermissions: appActionRegistryTable.requiredPermissions,
      riskLevel: appActionRegistryTable.riskLevel,
    })
    .from(appActionRegistryTable)
    .where(
      and(
        eq(appActionRegistryTable.key, actionKey),
        eq(appActionRegistryTable.status, "active"),
      ),
    )
    .limit(1);

  if (!action?.executorKey) return { actionKey, status: "not_found" };
  if (action.riskLevel !== "low") return { actionKey, status: "forbidden" };

  const permissionSet = new Set(context.viewer.permissions);
  const requiredPermissions = action.requiredPermissions ?? [];
  if (!requiredPermissions.every((permission) => permissionSet.has(permission))) {
    return { actionKey, status: "forbidden" };
  }

  const executor = ACTION_EXECUTORS[action.executorKey];
  if (!executor) return { actionKey, status: "not_found" };

  try {
    const data = await executor(input, context);
    return { actionKey, status: "ok", data };
  } catch (error) {
    if (error instanceof RuntimeActionInputError) {
      return { actionKey, status: "invalid_input" };
    }
    throw error;
  }
}
