import { and, asc, eq, inArray } from "drizzle-orm";
import {
  appDataSourceRegistryTable,
  categoriasProdutoTable,
  db,
  leadsTable,
  produtosCatalogoTable,
} from "@workspace/db";
import { listUnifiedPurchaseHistory } from "./customer_purchase_identity.js";

type JsonObject = Record<string, unknown>;

export type RuntimeViewer = {
  id: string;
  tenantId: string;
  leadId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  locale: string | null;
  roleKey: string;
  permissions: string[];
};

export type RuntimeDataSourceContext = {
  tenantId: string;
  appInstanceId: string;
  viewer: RuntimeViewer;
};

type DataSourceExecutor = (
  context: RuntimeDataSourceContext,
) => Promise<JsonObject | null>;

type RuntimeDataSourceOk = {
  sourceKey: string;
  status: "ok";
  data: JsonObject | null;
};

type RuntimeDataSourceDenied = {
  sourceKey: string;
  status: "forbidden" | "not_found";
};

export type RuntimeDataSourceResolution =
  | RuntimeDataSourceOk
  | RuntimeDataSourceDenied;

const SOURCE_KEY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const MAX_SOURCE_KEYS = 20;
const MAX_BINDING_VALUE_LENGTH = 1000;
const MAX_FLATTEN_DEPTH = 4;
const MAX_FLATTENED_BINDINGS = 200;

const DATA_SOURCE_EXECUTORS: Record<string, DataSourceExecutor> = {
  "viewer.profile": async ({ viewer }) => ({
    id: viewer.id,
    displayName: viewer.displayName,
    email: viewer.email,
    phone: viewer.phone,
    locale: viewer.locale,
    roleKey: viewer.roleKey,
    permissions: viewer.permissions,
  }),

  "viewer.linked_contact.summary": async ({ tenantId, viewer }) => {
    if (!viewer.leadId) return null;
    const [contact] = await db
      .select({
        id: leadsTable.id,
        name: leadsTable.nome,
        email: leadsTable.email,
        phone: leadsTable.telefone,
        company: leadsTable.empresa,
        nonLeadKind: leadsTable.naoLeadTipo,
      })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.id, viewer.leadId),
          eq(leadsTable.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!contact) return null;
    return {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      contactKind: contact.nonLeadKind ?? "lead",
    };
  },

  "catalog.products": async ({ tenantId }) => {
    const rows = await db
      .select({
        id: produtosCatalogoTable.id,
        name: produtosCatalogoTable.nome,
        sku: produtosCatalogoTable.sku,
        brand: produtosCatalogoTable.marca,
        description: produtosCatalogoTable.descricao,
        unit: produtosCatalogoTable.unidade,
        imageUrl: produtosCatalogoTable.imagemUrl,
        images: produtosCatalogoTable.imagens,
        basePrice: produtosCatalogoTable.precoBase,
        promotionalPrice: produtosCatalogoTable.precoPromocional,
        promotionEndsAt: produtosCatalogoTable.promocaoAtivaAte,
        controlsStock: produtosCatalogoTable.controlaEstoque,
        stockQuantity: produtosCatalogoTable.estoqueQuantidade,
        categoryId: produtosCatalogoTable.categoriaId,
        categoryName: categoriasProdutoTable.nome,
        highlighted: produtosCatalogoTable.destaque,
        deliveryDays: produtosCatalogoTable.prazoEntregaDias,
      })
      .from(produtosCatalogoTable)
      .leftJoin(
        categoriasProdutoTable,
        eq(produtosCatalogoTable.categoriaId, categoriasProdutoTable.id),
      )
      .where(
        and(
          eq(produtosCatalogoTable.tenantId, tenantId),
          eq(produtosCatalogoTable.ativo, true),
        ),
      )
      .orderBy(asc(categoriasProdutoTable.nome), asc(produtosCatalogoTable.nome))
      .limit(200);

    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      brand: row.brand,
      description: row.description,
      unit: row.unit,
      imageUrl: row.imageUrl ?? row.images?.[0] ?? null,
      images: row.images ?? [],
      basePrice: row.basePrice,
      promotionalPrice: row.promotionalPrice,
      promotionEndsAt: row.promotionEndsAt?.toISOString() ?? null,
      controlsStock: row.controlsStock,
      stockQuantity: row.stockQuantity,
      available: !row.controlsStock || (row.stockQuantity ?? 0) > 0,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      highlighted: row.highlighted,
      deliveryDays: row.deliveryDays,
    }));

    const categories = Array.from(
      new Map(
        items
          .filter((item) => item.categoryId && item.categoryName)
          .map((item) => [item.categoryId as string, { id: item.categoryId, name: item.categoryName }]),
      ).values(),
    );

    return {
      items,
      categories,
      total: items.length,
      sourceOfTruth: "vendorai.catalog",
    };
  },

  "commerce.orders": async ({ tenantId, appInstanceId, viewer }) => {
    return listUnifiedPurchaseHistory({
      tenantId,
      appInstanceId,
      appUserId: viewer.id,
    });
  },
};

export function normalizeRuntimeDataSourceKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(
          (item) =>
            item.length > 0 &&
            item.length <= 100 &&
            SOURCE_KEY_PATTERN.test(item),
        ),
    ),
  ).slice(0, MAX_SOURCE_KEYS);
}

export async function resolveRuntimeDataSources(
  sourceKeys: string[],
  context: RuntimeDataSourceContext,
): Promise<RuntimeDataSourceResolution[]> {
  const normalizedKeys = normalizeRuntimeDataSourceKeys(sourceKeys);
  if (normalizedKeys.length === 0) return [];

  const rows = await db
    .select({
      key: appDataSourceRegistryTable.key,
      executorKey: appDataSourceRegistryTable.executorKey,
      requiredPermissions: appDataSourceRegistryTable.requiredPermissions,
    })
    .from(appDataSourceRegistryTable)
    .where(
      and(
        inArray(appDataSourceRegistryTable.key, normalizedKeys),
        eq(appDataSourceRegistryTable.status, "active"),
      ),
    );

  const registry = new Map(rows.map((row) => [row.key, row]));
  const permissionSet = new Set(context.viewer.permissions);

  return Promise.all(
    normalizedKeys.map(async (sourceKey): Promise<RuntimeDataSourceResolution> => {
      const source = registry.get(sourceKey);
      if (!source) return { sourceKey, status: "not_found" };

      const requiredPermissions = source.requiredPermissions ?? [];
      if (
        !requiredPermissions.every((permission) =>
          permissionSet.has(permission),
        )
      ) {
        return { sourceKey, status: "forbidden" };
      }

      const executor = DATA_SOURCE_EXECUTORS[source.executorKey];
      if (!executor) return { sourceKey, status: "not_found" };

      const data = await executor(context);
      return { sourceKey, status: "ok", data };
    }),
  );
}

export async function resolveRuntimeDataSource(
  sourceKey: string,
  context: RuntimeDataSourceContext,
): Promise<RuntimeDataSourceResolution> {
  const [resolution] = await resolveRuntimeDataSources([sourceKey], context);
  return resolution ?? { sourceKey, status: "not_found" };
}

function flattenPrimitiveBindings(
  value: unknown,
  prefix: string,
  output: Record<string, string>,
  depth = 0,
): void {
  if (
    Object.keys(output).length >= MAX_FLATTENED_BINDINGS ||
    depth > MAX_FLATTEN_DEPTH
  ) {
    return;
  }

  if (value === null || value === undefined) {
    output[prefix] = "";
    return;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    output[prefix] = String(value).slice(0, MAX_BINDING_VALUE_LENGTH);
    return;
  }

  if (Array.isArray(value) || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as JsonObject)) {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) continue;
    flattenPrimitiveBindings(child, `${prefix}.${key}`, output, depth + 1);
  }
}

export function runtimeDataSourceBindings(
  resolutions: RuntimeDataSourceResolution[],
): Record<string, string> {
  const bindings: Record<string, string> = {};
  for (const resolution of resolutions) {
    if (resolution.status !== "ok" || resolution.data === null) continue;
    flattenPrimitiveBindings(
      resolution.data,
      `data.${resolution.sourceKey}`,
      bindings,
    );
  }
  return bindings;
}
