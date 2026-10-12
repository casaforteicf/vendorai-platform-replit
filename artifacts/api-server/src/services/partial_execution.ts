/**
 * LOTE 06: domínio puro para planejamento de execução parcial.
 * Persistência e autorização devem ser implementadas pela camada de serviço.
 * Todas as quantidades são expressas na unidade original do item contratado.
 */
export type ExecutionItem = Readonly<{
  itemId: string;
  contractedQuantity: number;
  groupId?: string | null;
  environmentId?: string | null;
}>;

export type ExecutionAllocation = Readonly<{
  lotId: string;
  itemId: string;
  quantity: number;
  status: "reserved" | "in_progress" | "completed" | "cancelled";
}>;

export type ExecutionRequestItem = Readonly<{ itemId: string; quantity: number }>;
export type ExecutionBalance = Readonly<{
  itemId: string;
  contracted: number;
  allocated: number;
  completed: number;
  available: number;
}>;

const PRECISION = 1e6;
function asUnits(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label}: quantidade inválida`);
  const units = Math.round(value * PRECISION);
  if (!Number.isSafeInteger(units) || Math.abs(units / PRECISION - value) > 1e-9) {
    throw new Error(`${label}: precisão máxima de 6 casas decimais`);
  }
  return units;
}

export function calculateExecutionBalances(
  contractedItems: readonly ExecutionItem[],
  allocations: readonly ExecutionAllocation[],
): ExecutionBalance[] {
  const items = new Map<string, { contracted: number; allocated: number; completed: number }>();
  for (const item of contractedItems) {
    if (!item.itemId || items.has(item.itemId)) throw new Error("Item contratado duplicado ou sem identificação");
    items.set(item.itemId, { contracted: asUnits(item.contractedQuantity, item.itemId), allocated: 0, completed: 0 });
  }
  for (const allocation of allocations) {
    const item = items.get(allocation.itemId);
    if (!item) throw new Error(`Item da execução não pertence ao contrato: ${allocation.itemId}`);
    const quantity = asUnits(allocation.quantity, allocation.itemId);
    if (quantity === 0) throw new Error("Alocação precisa ter quantidade positiva");
    if (allocation.status === "cancelled") continue;
    if (!["reserved", "in_progress", "completed"].includes(allocation.status)) throw new Error("Estado de execução inválido");
    item.allocated += quantity;
    if (allocation.status === "completed") item.completed += quantity;
    if (!Number.isSafeInteger(item.allocated) || item.allocated > item.contracted) {
      throw new Error(`Quantidade alocada excede a contratada: ${allocation.itemId}`);
    }
  }
  return [...items.entries()].map(([itemId, q]) => ({
    itemId,
    contracted: q.contracted / PRECISION,
    allocated: q.allocated / PRECISION,
    completed: q.completed / PRECISION,
    available: (q.contracted - q.allocated) / PRECISION,
  }));
}

/**
 * Valida o novo lote contra o snapshot de alocações existentes.
 * A gravação deve ocorrer em transação com lock nas linhas dos itens do contrato
 * e índice de idempotência (tenant_id, business_id, request_key).
 */
export function validateExecutionLot(
  contractedItems: readonly ExecutionItem[],
  existingAllocations: readonly ExecutionAllocation[],
  requestedItems: readonly ExecutionRequestItem[],
): { items: ExecutionRequestItem[]; balancesAfter: ExecutionBalance[] } {
  if (!requestedItems.length) throw new Error("Selecione ao menos um item para execução");
  const seen = new Set<string>();
  for (const item of requestedItems) {
    if (!item.itemId || seen.has(item.itemId)) throw new Error("Item repetido no mesmo lote");
    seen.add(item.itemId);
    if (asUnits(item.quantity, item.itemId) === 0) throw new Error("Quantidade do lote precisa ser positiva");
  }
  const proposed = requestedItems.map((item) => ({
    lotId: "__proposed__", itemId: item.itemId, quantity: item.quantity, status: "reserved" as const,
  }));
  return { items: requestedItems.map(({ itemId, quantity }) => ({ itemId, quantity })),
    balancesAfter: calculateExecutionBalances(contractedItems, [...existingAllocations, ...proposed]) };
}
