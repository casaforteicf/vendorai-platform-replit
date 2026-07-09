import React, { useEffect, useState } from "react";
import type { SpecObject, SpecObjectPayload } from "./specCatalogTypes";
import { money, statusClass, statusLabel } from "./specCatalogUtils";

export function SpecObjectEditorPanel({
  projectId,
  renderId,
  selectedObject,
  saving,
  sendingToBudget,
  onCreate,
  onSave,
  onSendToBudget,
}: {
  projectId: string;
  renderId?: string;
  selectedObject?: SpecObject | null;
  saving?: boolean;
  sendingToBudget?: boolean;
  onCreate: (payload: SpecObjectPayload) => Promise<unknown>;
  onSave: (id: string, payload: Partial<SpecObjectPayload>) => Promise<unknown>;
  onSendToBudget: (object: SpecObject) => Promise<unknown>;
}) {
  const [form, setForm] = useState<SpecObjectPayload>(emptyPayload(projectId, renderId));

  useEffect(() => {
    if (!selectedObject) {
      setForm(emptyPayload(projectId, renderId));
      return;
    }

    setForm({
      projectId: selectedObject.projectId,
      ambienteId: selectedObject.ambienteId,
      cenaId: selectedObject.cenaId,
      renderId: selectedObject.renderId,
      name: selectedObject.name,
      description: selectedObject.description,
      category: selectedObject.category,
      region: selectedObject.region,
      quantity: selectedObject.quantity,
      unit: selectedObject.unit,
      catalogProductId: selectedObject.catalogProductId,
      catalogMaterialId: selectedObject.catalogMaterialId,
      manufacturerId: selectedObject.manufacturerId,
      supplierId: selectedObject.supplierId,
      productName: selectedObject.productName,
      materialName: selectedObject.materialName,
      manufacturerName: selectedObject.manufacturerName,
      supplierName: selectedObject.supplierName,
      materialValue: selectedObject.materialValue,
      laborValue: selectedObject.laborValue,
      notes: selectedObject.notes,
      status: selectedObject.status,
    });
  }, [projectId, renderId, selectedObject]);

  const total = Number(form.quantity || 1) * (Number(form.materialValue || 0) + Number(form.laborValue || 0));

  function set<K extends keyof SpecObjectPayload>(key: K, value: SpecObjectPayload[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (selectedObject) {
      await onSave(selectedObject.id, form);
      return;
    }

    await onCreate({ ...form, projectId, renderId, status: "draft" });
  }

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Editor</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            {selectedObject ? "Editar SpecObject" : "Criar SpecObject"}
          </h2>
        </div>

        {selectedObject ? (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(selectedObject.status)}`}>
            {statusLabel(selectedObject.status)}
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="Nome" value={form.name} onChange={(value) => set("name", value)} />
        <Field label="Categoria" value={form.category || ""} onChange={(value) => set("category", value)} />
        <Field label="Região no render" value={form.region || ""} onChange={(value) => set("region", value)} />
        <Field label="Unidade" value={form.unit} onChange={(value) => set("unit", value)} />
        <NumberField label="Quantidade" value={form.quantity} onChange={(value) => set("quantity", value)} />
        <NumberField label="Valor material" value={form.materialValue} onChange={(value) => set("materialValue", value)} />
        <NumberField label="Valor mão de obra" value={form.laborValue} onChange={(value) => set("laborValue", value)} />
        <Field label="Produto" value={form.productName || ""} onChange={(value) => set("productName", value)} />
        <Field label="Material" value={form.materialName || ""} onChange={(value) => set("materialName", value)} />
        <Field label="Fabricante" value={form.manufacturerName || ""} onChange={(value) => set("manufacturerName", value)} />
        <Field label="Fornecedor" value={form.supplierName || ""} onChange={(value) => set("supplierName", value)} />
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observações</span>
        <textarea
          value={form.notes || ""}
          onChange={(event) => set("notes", event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </label>

      <div className="mt-5 rounded-3xl bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total do item</p>
        <p className="mt-1 text-3xl font-semibold text-slate-950">{money(total)}</p>
        <p className="mt-1 text-xs text-slate-500">Material + mão de obra × quantidade.</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Salvando..." : selectedObject ? "Salvar objeto" : "Criar objeto"}
        </button>

        <button
          type="button"
          disabled={!selectedObject || sendingToBudget}
          onClick={() => selectedObject ? onSendToBudget(selectedObject) : undefined}
          className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendingToBudget ? "Enviando..." : "Enviar para orçamento"}
        </button>
      </div>
    </section>
  );
}

function emptyPayload(projectId: string, renderId?: string): SpecObjectPayload {
  return {
    projectId,
    renderId,
    name: "Novo objeto especificável",
    category: "mobiliário",
    region: "região do render",
    quantity: 1,
    unit: "un",
    materialValue: 0,
    laborValue: 0,
    status: "draft",
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
