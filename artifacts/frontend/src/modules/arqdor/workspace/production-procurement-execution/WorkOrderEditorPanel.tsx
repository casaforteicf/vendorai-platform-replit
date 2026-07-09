import React, { useEffect, useState } from "react";
import type { WorkOrder, WorkOrderPayload, WorkOrderPriority, WorkOrderType } from "./productionTypes";
import { money } from "./productionUtils";

export function WorkOrderEditorPanel({
  projectId,
  proposalId,
  selectedOrder,
  saving,
  onCreate,
  onSave,
}: {
  projectId: string;
  proposalId?: string;
  selectedOrder?: WorkOrder | null;
  saving?: boolean;
  onCreate: (payload: WorkOrderPayload) => Promise<unknown>;
  onSave: (id: string, payload: Partial<WorkOrderPayload>) => Promise<unknown>;
}) {
  const [form, setForm] = useState<WorkOrderPayload>(emptyOrder(projectId, proposalId));

  useEffect(() => {
    if (!selectedOrder) {
      setForm(emptyOrder(projectId, proposalId));
      return;
    }

    setForm({
      projectId: selectedOrder.projectId,
      proposalId: selectedOrder.proposalId,
      proposalItemId: selectedOrder.proposalItemId,
      budgetItemId: selectedOrder.budgetItemId,
      specObjectId: selectedOrder.specObjectId,
      title: selectedOrder.title,
      description: selectedOrder.description,
      type: selectedOrder.type,
      priority: selectedOrder.priority,
      status: selectedOrder.status,
      item: selectedOrder.item,
      quantity: selectedOrder.quantity,
      unit: selectedOrder.unit,
      materialName: selectedOrder.materialName,
      productName: selectedOrder.productName,
      supplierName: selectedOrder.supplierName,
      manufacturerName: selectedOrder.manufacturerName,
      plannedStart: selectedOrder.plannedStart,
      plannedEnd: selectedOrder.plannedEnd,
      estimatedCost: selectedOrder.estimatedCost,
      actualCost: selectedOrder.actualCost,
      notes: selectedOrder.notes,
    });
  }, [projectId, proposalId, selectedOrder]);

  function set<K extends keyof WorkOrderPayload>(key: K, value: WorkOrderPayload[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (selectedOrder) {
      await onSave(selectedOrder.id, form);
      return;
    }

    await onCreate({ ...form, projectId, proposalId });
  }

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Editor</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">
        {selectedOrder ? "Editar ordem" : "Criar ordem"}
      </h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="Título" value={form.title} onChange={(value) => set("title", value)} />
        <Field label="Item" value={form.item || ""} onChange={(value) => set("item", value)} />

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tipo</span>
          <select
            value={form.type}
            onChange={(event) => set("type", event.target.value as WorkOrderType)}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
          >
            <option value="production">Produção</option>
            <option value="procurement">Compra</option>
            <option value="installation">Instalação</option>
            <option value="site-service">Serviço em obra</option>
            <option value="delivery">Entrega</option>
            <option value="quality-check">Qualidade</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Prioridade</span>
          <select
            value={form.priority}
            onChange={(event) => set("priority", event.target.value as WorkOrderPriority)}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
          >
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
        </label>

        <NumberField label="Quantidade" value={form.quantity} onChange={(value) => set("quantity", value)} />
        <Field label="Unidade" value={form.unit} onChange={(value) => set("unit", value)} />
        <Field label="Produto" value={form.productName || ""} onChange={(value) => set("productName", value)} />
        <Field label="Material" value={form.materialName || ""} onChange={(value) => set("materialName", value)} />
        <Field label="Fornecedor" value={form.supplierName || ""} onChange={(value) => set("supplierName", value)} />
        <Field label="Fabricante" value={form.manufacturerName || ""} onChange={(value) => set("manufacturerName", value)} />
        <DateField label="Início planejado" value={form.plannedStart || ""} onChange={(value) => set("plannedStart", value)} />
        <DateField label="Fim planejado" value={form.plannedEnd || ""} onChange={(value) => set("plannedEnd", value)} />
        <NumberField label="Custo previsto" value={form.estimatedCost || 0} onChange={(value) => set("estimatedCost", value)} />
        <NumberField label="Custo real" value={form.actualCost || 0} onChange={(value) => set("actualCost", value)} />
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Descrição / observações</span>
        <textarea
          value={form.description || ""}
          onChange={(event) => set("description", event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </label>

      <div className="mt-5 rounded-3xl bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Custo previsto</p>
        <p className="mt-1 text-3xl font-semibold text-slate-950">{money(form.estimatedCost)}</p>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={submit}
        className="mt-5 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Salvando..." : selectedOrder ? "Salvar ordem" : "Criar ordem"}
      </button>
    </section>
  );
}

function emptyOrder(projectId: string, proposalId?: string): WorkOrderPayload {
  return {
    projectId,
    proposalId,
    title: "Nova ordem de execução",
    description: "",
    type: "production",
    priority: "medium",
    status: "planned",
    item: "Item aprovado",
    quantity: 1,
    unit: "un",
    estimatedCost: 0,
    actualCost: 0,
  };
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
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

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
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

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        type="date"
        value={value ? value.slice(0, 10) : ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
      />
    </label>
  );
}
