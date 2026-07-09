import React, { useEffect, useState } from "react";
import type { BudgetItem, BudgetItemPayload } from "./budgetTypes";
import { money } from "./budgetUtils";

export function BudgetItemEditorPanel({
  selectedItem,
  saving,
  onCreate,
  onSave,
}: {
  selectedItem?: BudgetItem | null;
  saving?: boolean;
  onCreate: (payload: Omit<BudgetItemPayload, "budgetId" | "projectId">) => Promise<unknown>;
  onSave: (id: string, payload: Partial<BudgetItemPayload>) => Promise<unknown>;
}) {
  const [form, setForm] = useState<Omit<BudgetItemPayload, "budgetId" | "projectId">>(emptyItem());

  useEffect(() => {
    if (!selectedItem) {
      setForm(emptyItem());
      return;
    }

    setForm({
      specObjectId: selectedItem.specObjectId,
      ambienteId: selectedItem.ambienteId,
      renderId: selectedItem.renderId,
      item: selectedItem.item,
      description: selectedItem.description,
      type: selectedItem.type,
      quantity: selectedItem.quantity,
      unit: selectedItem.unit,
      materialValue: selectedItem.materialValue,
      laborValue: selectedItem.laborValue,
      supplierName: selectedItem.supplierName,
      manufacturerName: selectedItem.manufacturerName,
      productName: selectedItem.productName,
      materialName: selectedItem.materialName,
      visibleToClient: selectedItem.visibleToClient,
      sortOrder: selectedItem.sortOrder,
    });
  }, [selectedItem]);

  const total = Number(form.quantity || 1) * (Number(form.materialValue || 0) + Number(form.laborValue || 0));

  function set<K extends keyof Omit<BudgetItemPayload, "budgetId" | "projectId">>(key: K, value: Omit<BudgetItemPayload, "budgetId" | "projectId">[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (selectedItem) {
      await onSave(selectedItem.id, form);
      return;
    }

    await onCreate(form);
  }

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Editor</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">{selectedItem ? "Editar item" : "Adicionar item"}</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="Item" value={form.item} onChange={(value) => set("item", value)} />
        <Field label="Descrição" value={form.description || ""} onChange={(value) => set("description", value)} />
        <NumberField label="Quantidade" value={form.quantity} onChange={(value) => set("quantity", value)} />
        <Field label="Unidade" value={form.unit} onChange={(value) => set("unit", value)} />
        <NumberField label="Valor Material" value={form.materialValue} onChange={(value) => set("materialValue", value)} />
        <NumberField label="Valor Mão de Obra" value={form.laborValue} onChange={(value) => set("laborValue", value)} />
        <Field label="Produto" value={form.productName || ""} onChange={(value) => set("productName", value)} />
        <Field label="Material" value={form.materialName || ""} onChange={(value) => set("materialName", value)} />
        <Field label="Fabricante" value={form.manufacturerName || ""} onChange={(value) => set("manufacturerName", value)} />
        <Field label="Fornecedor" value={form.supplierName || ""} onChange={(value) => set("supplierName", value)} />
      </div>

      <label className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <input
          type="checkbox"
          checked={Boolean(form.visibleToClient)}
          onChange={(event) => set("visibleToClient", event.target.checked)}
        />
        <span className="text-sm font-medium text-slate-700">Mostrar este item na versão do cliente</span>
      </label>

      <div className="mt-5 rounded-3xl bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total do item</p>
        <p className="mt-1 text-3xl font-semibold text-slate-950">{money(total)}</p>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="mt-5 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Salvando..." : selectedItem ? "Salvar item" : "Adicionar item"}
      </button>
    </section>
  );
}

function emptyItem(): Omit<BudgetItemPayload, "budgetId" | "projectId"> {
  return {
    item: "Novo item",
    description: "",
    type: "product",
    quantity: 1,
    unit: "un",
    materialValue: 0,
    laborValue: 0,
    visibleToClient: true,
    sortOrder: 0,
  };
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
      />
    </label>
  );
}
