import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveBudget,
  createBudget,
  createBudgetFromSpecObjects,
  createBudgetItem,
  deleteBudgetItem,
  fetchBudget,
  markBudgetSent,
  updateBudget,
  updateBudgetItem,
} from "./budgetApi";
import type { Budget, BudgetItem, BudgetItemPayload, BudgetPayload } from "./budgetTypes";
import { calculateBudgetTotals } from "./budgetUtils";

export function useRealBudgetEngine(projectId: string, projectTitle: string, clientName: string) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<BudgetItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => calculateBudgetTotals(items, budget), [budget, items]);

  const loadBudget = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    const result = await fetchBudget(projectId);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setBudget(result.data?.budget || null);
    setItems(result.data?.items || []);
    setSelectedItem((current) => {
      const list = result.data?.items || [];
      if (current && list.some((item) => item.id === current.id)) return current;
      return list[0] || null;
    });
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void loadBudget();
  }, [loadBudget]);

  const ensureBudget = useCallback(async () => {
    if (budget) return budget;

    const payload: BudgetPayload = {
      projectId,
      title: `Orçamento — ${projectTitle}`,
      clientName,
      status: "draft",
      discountType: "fixed",
      discountValue: 0,
      clientNotes: "Orçamento preliminar sujeito à validação técnica e comercial.",
      internalNotes: "Versão interna com valores de material e mão de obra separados.",
    };

    const result = await createBudget(payload);

    if (result.error) {
      setError(result.error);
      return null;
    }

    const created = result.data?.budget || null;
    setBudget(created);
    setItems(result.data?.items || []);
    return created;
  }, [budget, clientName, projectId, projectTitle]);

  const generateFromSpecObjects = useCallback(async () => {
    if (!projectId) return null;

    setGenerating(true);
    setError(null);

    const result = await createBudgetFromSpecObjects({
      projectId,
      title: `Orçamento — ${projectTitle}`,
      clientName,
    });

    if (result.error) {
      setError(result.error);
      setGenerating(false);
      return null;
    }

    setBudget(result.data?.budget || null);
    setItems(result.data?.items || []);
    setSelectedItem(result.data?.items?.[0] || null);
    setGenerating(false);
    await loadBudget();
    return result.data || null;
  }, [clientName, loadBudget, projectId, projectTitle]);

  const saveBudget = useCallback(
    async (payload: Partial<BudgetPayload>) => {
      const current = await ensureBudget();
      if (!current) return null;

      setSaving(true);
      setError(null);

      const result = await updateBudget(current.id, payload);

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      if (result.data) setBudget(result.data);
      setSaving(false);
      await loadBudget();
      return result.data || null;
    },
    [ensureBudget, loadBudget],
  );

  const addItem = useCallback(
    async (payload: Omit<BudgetItemPayload, "budgetId" | "projectId">) => {
      const current = await ensureBudget();
      if (!current) return null;

      setSaving(true);
      setError(null);

      const result = await createBudgetItem({
        ...payload,
        budgetId: current.id,
        projectId,
      });

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      if (result.data) {
        setItems((list) => [...list, result.data as BudgetItem]);
        setSelectedItem(result.data);
      }

      setSaving(false);
      await loadBudget();
      return result.data || null;
    },
    [ensureBudget, loadBudget, projectId],
  );

  const saveItem = useCallback(
    async (id: string, payload: Partial<BudgetItemPayload>) => {
      setSaving(true);
      setError(null);

      const result = await updateBudgetItem(id, payload);

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      if (result.data) {
        setItems((list) => list.map((item) => (item.id === id ? result.data as BudgetItem : item)));
        setSelectedItem(result.data);
      }

      setSaving(false);
      await loadBudget();
      return result.data || null;
    },
    [loadBudget],
  );

  const removeItem = useCallback(
    async (id: string) => {
      setSaving(true);
      setError(null);

      const result = await deleteBudgetItem(id);

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      setItems((list) => list.filter((item) => item.id !== id));
      setSelectedItem((current) => (current?.id === id ? null : current));
      setSaving(false);
      await loadBudget();
      return result.data || null;
    },
    [loadBudget],
  );

  const sendBudget = useCallback(async () => {
    if (!budget) return null;

    setSending(true);
    setError(null);

    const result = await markBudgetSent(budget.id);

    if (result.error) {
      setError(result.error);
      setSending(false);
      return null;
    }

    if (result.data) setBudget(result.data);
    setSending(false);
    await loadBudget();
    return result.data || null;
  }, [budget, loadBudget]);

  const approveCurrentBudget = useCallback(async () => {
    if (!budget) return null;

    setApproving(true);
    setError(null);

    const result = await approveBudget(budget.id);

    if (result.error) {
      setError(result.error);
      setApproving(false);
      return null;
    }

    if (result.data) setBudget(result.data);
    setApproving(false);
    await loadBudget();
    return result.data || null;
  }, [budget, loadBudget]);

  return {
    budget,
    items,
    selectedItem,
    setSelectedItem,
    totals,
    loading,
    saving,
    generating,
    sending,
    approving,
    error,
    reload: loadBudget,
    ensureBudget,
    generateFromSpecObjects,
    saveBudget,
    addItem,
    saveItem,
    removeItem,
    sendBudget,
    approveCurrentBudget,
  };
}
