import { useMemo } from "react";
import type { BudgetDiscipline, BudgetItem } from "./BudgetContext";
import { calculateItemSubtotal, calculateItemTotal } from "./budgetData";

export function useBudgetEngine(items: BudgetItem[], discipline: BudgetDiscipline) {
  return useMemo(() => {
    const visibleItems = discipline === "geral" ? items : items.filter((item) => item.discipline === discipline);

    const subtotal = visibleItems.reduce((sum, item) => sum + calculateItemSubtotal(item), 0);
    const total = visibleItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const margin = total - subtotal;

    const approved = visibleItems.filter((item) => item.status === "aprovado" || item.status === "orcado").length;
    const pending = visibleItems.length - approved;

    const byDiscipline = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.discipline] = (acc[item.discipline] || 0) + calculateItemTotal(item);
      return acc;
    }, {});

    return {
      visibleItems,
      subtotal,
      total,
      margin,
      approved,
      pending,
      byDiscipline,
    };
  }, [items, discipline]);
}
