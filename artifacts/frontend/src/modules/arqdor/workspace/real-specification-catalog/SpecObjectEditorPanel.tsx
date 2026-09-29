import React, { useEffect, useState } from "react";
import type { SpecObject, SpecObjectPayload } from "./specCatalogTypes";
import { money, statusClass, statusLabel } from "./specCatalogUtils";
import { CatalogoModal } from "@/pages/Propostas";
import { useAuth } from "@/contexts/AuthContext";
import { ordenarArvoreCategorias } from "@/lib/categoriaTree";
import { useListCategoriasProduto, getListCategoriasProdutoQueryKey } from "@workspace/api-client-react";

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
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [form, setForm] = useState<SpecObjectPayload>(emptyPayload(projectId, renderId));
  const { data: categoriasProduto = [] } = useListCategoriasProduto(tenantId, {
    query: {
      queryKey: getListCategoriasProdutoQueryKey(tenantId),
      enabled: !!tenantId,
      staleTime: 300_000,
    },
  });
  const categoriasOrdenadas = ordenarArvoreCategorias(categoriasProduto);

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
    <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Editor</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">
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
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Categoria</span>
          <select
            value={form.category || ""}
            onChange={(event) => set("category", event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
          >
            <option value="">Selecione...</option>
            {categoriasOrdenadas.map(({ categoria, profundidade }) => (
              <option key={categoria.id} value={categoria.nome}>
                {"— ".repeat(profundidade)}{categoria.nome}
              </option>
            ))}
          </select>
        </label>
        <Field label="Região no render" value={form.region || ""} onChange={(value) => set("region", value)} />
        <Field label="Unidade" value={form.unit} onChange={(value) => set("unit", value)} />
        <NumberField label="Quantidade" value={form.quantity} onChange={(value) => set("quantity", value)} />
        <NumberField label="Valor material" value={form.materialValue} onChange={(value) => set("materialValue", value)} />
        <NumberField label="Valor mão de obra" value={form.laborValue} onChange={(value) => set("laborValue", value)} />
        <div className="space-y-2">
          <Field label="Produto" value={form.productName || ""} onChange={(value) => set("productName", value)} />
          <button
            type="button"
            onClick={() => setCatalogEditorOpen(true)}
            className="text-xs font-semibold text-[var(--arq-accent)] hover:underline"
          >
            {form.catalogProductId ? "Editar cadastro mestre" : "Cadastrar no catálogo mestre"}
          </button>
        </div>
        <Field label="Material" value={form.materialName || ""} onChange={(value) => set("materialName", value)} />
        <Field label="Fabricante" value={form.manufacturerName || ""} onChange={(value) => set("manufacturerName", value)} />
        <Field label="Fornecedor" value={form.supplierName || ""} onChange={(value) => set("supplierName", value)} />
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Observações</span>
        <textarea
          value={form.notes || ""}
          onChange={(event) => set("notes", event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </label>

      <div className="mt-5 rounded-3xl bg-[var(--arq-card-soft)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Total do item</p>
        <p className="mt-1 text-3xl font-semibold text-[var(--arq-foreground)]">{money(total)}</p>
        <p className="mt-1 text-xs text-[var(--arq-muted)]">Material + mão de obra × quantidade.</p>
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
          className="rounded-2xl bg-[var(--arq-accent)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendingToBudget ? "Enviando..." : "Enviar para orçamento"}
        </button>
      </div>
      {tenantId ? (
        <CatalogoModal
          open={catalogEditorOpen}
          onClose={() => setCatalogEditorOpen(false)}
          tenantId={tenantId}
          initialProductId={form.catalogProductId || null}
          initialCreateDraft={
            form.catalogProductId
              ? null
              : {
                  nome: form.productName || form.name,
                  unidade: form.unit,
                  fornecedor: form.supplierName || "",
                  precoBase: Number(form.materialValue || 0),
                }
          }
          onProductSaved={(product) => {
            set("catalogProductId", product.id);
            set("productName", product.nome);
            set("unit", product.unidade || form.unit);
            if ((product as any).fornecedor) set("supplierName", (product as any).fornecedor);
            if ((product as any).categoriaNome) set("category", (product as any).categoriaNome);
            setCatalogEditorOpen(false);
          }}
        />
      ) : null}
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
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
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
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
      />
    </label>
  );
}
