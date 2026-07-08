import type { DeliveryStatus, InventoryStatus, ReceivingStatus } from "./receivingTypes";

export function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function receivingClass(status: ReceivingStatus) {
  const classes: Record<ReceivingStatus, string> = {
    scheduled: "bg-slate-100 text-slate-700",
    in_transit: "bg-blue-50 text-blue-700",
    received: "bg-violet-50 text-violet-700",
    inspection: "bg-amber-50 text-amber-700",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-rose-50 text-rose-700",
  };
  return classes[status];
}

export function inventoryClass(status: InventoryStatus) {
  const classes: Record<InventoryStatus, string> = {
    available: "bg-emerald-50 text-emerald-700",
    reserved: "bg-violet-50 text-violet-700",
    low_stock: "bg-amber-50 text-amber-700",
    damaged: "bg-rose-50 text-rose-700",
    returned: "bg-slate-100 text-slate-700",
  };
  return classes[status];
}

export function deliveryClass(status: DeliveryStatus) {
  const classes: Record<DeliveryStatus, string> = {
    pending: "bg-slate-100 text-slate-700",
    scheduled: "bg-blue-50 text-blue-700",
    in_route: "bg-violet-50 text-violet-700",
    delivered: "bg-emerald-50 text-emerald-700",
    delayed: "bg-rose-50 text-rose-700",
  };
  return classes[status];
}
