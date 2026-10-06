import React, { useEffect, useMemo, useState } from "react";
import type { SpecApproval, SpecApprovalContext, SpecApprovalDecision, SpecObject, SpecObjectPayload } from "./specCatalogTypes";
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
  approvals,
  approving,
  onDecision,
  onCreate,
  onSave,
  onSendToBudget,
}: {
  projectId: string;
  renderId?: string;
  selectedObject?: SpecObject | null;
  saving?: boolean;
  sendingToBudget?: boolean;
  approvals?: SpecApproval[];
  approving?: boolean;
  onDecision?: (context: SpecApprovalContext, decision: SpecApprovalDecision, note?: string | null) => Promise<unknown>;
  onCreate: (payload: SpecObjectPayload) => Promise<unknown>;
  onSave: (id: string, payload: Partial<SpecObjectPayload>) => Promise<unknown>;
  onSendToBudget: (object: SpecObject) => Promise<unknown>;
}) {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [catalogEditorOpen, setCatalogEditorOpen] = useState(false);
  const [approvalContext, setApprovalContext] = useState<SpecApprovalContext>("technical");
  const [approvalNote, setApprovalNote] = useState("");
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
      sourceObjectId: selectedObject.sourceObjectId,
      sourceType: selectedObject.sourceType,
      projectRevision: selectedObject.projectRevision,
      name: selectedObject.name,
      description: selectedObject.description,
      category: selectedObject.category,
      region: selectedObject.region,
      quantity: selectedObject.quantity,
      unit: selectedObject.unit,
      quantitySource: selectedObject.quantitySource,
      widthMm: selectedObject.widthMm,
      heightMm: selectedObject.heightMm,
      depthMm: selectedObject.depthMm,
      lengthMm: selectedObject.lengthMm,
      areaM2: selectedObject.areaM2,
      perimeterM: selectedObject.perimeterM,
      volumeM3: selectedObject.volumeM3,
      measurementSource: selectedObject.measurementSource,
      measurementRevision: selectedObject.measurementRevision,
      wasteFactor: selectedObject.wasteFactor,
      purchaseQuantity: selectedObject.purchaseQuantity,
      packageYield: selectedObject.packageYield,
      purchaseMode: selectedObject.purchaseMode,
      purchaseUnit: selectedObject.purchaseUnit,
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

  const suggestedPurchaseQuantity = useMemo(() => {
    const base = Number(form.quantity || 0);
    const waste = Math.max(0, Number(form.wasteFactor || 0));
    const grossTechnicalQuantity = base * (1 + waste / 100);
    const purchaseMode = form.purchaseMode || "same_unit";
    const yieldPerPurchaseUnit = Number(form.packageYield || 0);

    if (purchaseMode !== "same_unit" && yieldPerPurchaseUnit > 0) {
      return Math.ceil(grossTechnicalQuantity / yieldPerPurchaseUnit);
    }
    return grossTechnicalQuantity;
  }, [form.packageYield, form.purchaseMode, form.quantity, form.wasteFactor]);

  const total = Number(form.quantity || 1) * (Number(form.materialValue || 0) + Number(form.laborValue || 0));

  function set<K extends keyof SpecObjectPayload>(key: K, value: SpecObjectPayload[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    const payload = {
      ...form,
      purchaseQuantity: form.purchaseQuantity ?? suggestedPurchaseQuantity,
    };
    if (selectedObject) {
      await onSave(selectedObject.id, payload);
      return;
    }
    await onCreate({ ...payload, projectId, renderId, status: "draft" });
  }

  return (
    <section className="rounded-3xl border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Especificação técnica</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">
            {selectedObject ? selectedObject.name : "Novo item"}
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
            className="mt-2 w-full rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-3 py-2.5 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
          >
            <option value="">Selecione...</option>
            {categoriasOrdenadas.map(({ categoria, profundidade }) => (
              <option key={categoria.id} value={categoria.nome}>{"— ".repeat(profundidade)}{categoria.nome}</option>
            ))}
          </select>
        </label>
        <Field label="Ambiente / localização" value={form.region || ""} onChange={(value) => set("region", value)} />
        <Field label="Descrição" value={form.description || ""} onChange={(value) => set("description", value)} />
      </div>

      <details open className="mt-5 rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-4">
        <summary className="cursor-pointer text-sm font-semibold">Medidas e quantitativo</summary>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <NumberField label="Largura (mm)" value={form.widthMm} onChange={(value) => set("widthMm", value)} />
          <NumberField label="Altura (mm)" value={form.heightMm} onChange={(value) => set("heightMm", value)} />
          <NumberField label="Profundidade (mm)" value={form.depthMm} onChange={(value) => set("depthMm", value)} />
          <NumberField label="Comprimento (mm)" value={form.lengthMm} onChange={(value) => set("lengthMm", value)} />
          <NumberField label="Área (m²)" value={form.areaM2} onChange={(value) => set("areaM2", value)} />
          <NumberField label="Perímetro (m)" value={form.perimeterM} onChange={(value) => set("perimeterM", value)} />
          <NumberField label="Volume (m³)" value={form.volumeM3} onChange={(value) => set("volumeM3", value)} />
          <NumberField label="Quantidade" value={form.quantity} onChange={(value) => set("quantity", value ?? 0)} />
          <Field label="Unidade" value={form.unit} onChange={(value) => set("unit", value)} />
          <SelectField
            label="Origem da medida"
            value={form.measurementSource || "pending"}
            onChange={(value) => set("measurementSource", value as SpecObjectPayload["measurementSource"])}
            options={[
              ["pending", "Pendente"],
              ["project", "Projeto"],
              ["field", "Medição em obra"],
              ["confirmed", "Confirmada"],
              ["manual", "Manual"],
              ["ai_estimate", "Estimativa IA"],
            ]}
          />
          <SelectField
            label="Origem da quantidade"
            value={form.quantitySource || "pending"}
            onChange={(value) => set("quantitySource", value as SpecObjectPayload["quantitySource"])}
            options={[
              ["pending", "Pendente"],
              ["project", "Projeto"],
              ["catalog", "Catálogo"],
              ["confirmed", "Confirmada"],
              ["manual", "Manual"],
              ["ai_estimate", "Estimativa IA"],
            ]}
          />
          <Field label="Revisão da medida" value={form.measurementRevision || ""} onChange={(value) => set("measurementRevision", value)} />
        </div>
      </details>

      <details className="mt-3 rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-4">
        <summary className="cursor-pointer text-sm font-semibold">Produto, material e fornecedor</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Field label="Produto" value={form.productName || ""} onChange={(value) => set("productName", value)} />
            <button type="button" onClick={() => setCatalogEditorOpen(true)} className="text-xs font-semibold text-[var(--arq-accent)] hover:underline">
              {form.catalogProductId ? "Editar cadastro mestre" : "Cadastrar no catálogo mestre"}
            </button>
          </div>
          <Field label="Material" value={form.materialName || ""} onChange={(value) => set("materialName", value)} />
          <Field label="Fabricante" value={form.manufacturerName || ""} onChange={(value) => set("manufacturerName", value)} />
          <Field label="Fornecedor" value={form.supplierName || ""} onChange={(value) => set("supplierName", value)} />
        </div>
      </details>

      <details className="mt-3 rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-4">
        <summary className="cursor-pointer text-sm font-semibold">Compra e valores</summary>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <SelectField
            label="Modelo de compra"
            value={form.purchaseMode || "same_unit"}
            onChange={(value) => {
              const mode = value as NonNullable<SpecObjectPayload["purchaseMode"]>;
              set("purchaseMode", mode);
              if (mode === "package" && (!form.purchaseUnit || form.purchaseUnit === form.unit)) set("purchaseUnit", "caixa");
              if (mode === "slab" && (!form.purchaseUnit || form.purchaseUnit === form.unit)) set("purchaseUnit", "chapa");
              if (mode === "piece" && (!form.purchaseUnit || form.purchaseUnit === form.unit)) set("purchaseUnit", "peça");
              if (mode === "kit" && (!form.purchaseUnit || form.purchaseUnit === form.unit)) set("purchaseUnit", "kit");
              if (mode === "same_unit") set("purchaseUnit", form.unit);
              set("purchaseQuantity", null);
            }}
            options={[
              ["same_unit", "Mesma unidade do projeto"],
              ["package", "Caixa / embalagem"],
              ["slab", "Chapa"],
              ["piece", "Peça"],
              ["kit", "Kit / conjunto"],
            ]}
          />
          <NumberField label="Perda (%)" value={form.wasteFactor} onChange={(value) => set("wasteFactor", value)} />
          <NumberField
            label={form.purchaseMode === "slab" ? "Rendimento por chapa" : form.purchaseMode === "package" ? "Rendimento por caixa" : form.purchaseMode === "kit" ? "Rendimento por kit" : "Rendimento por unidade"}
            value={form.packageYield}
            onChange={(value) => {
              set("packageYield", value);
              set("purchaseQuantity", null);
            }}
          />
          <Field label="Unidade de compra" value={form.purchaseUnit || form.unit} onChange={(value) => set("purchaseUnit", value)} />
          <NumberField
            label={form.purchaseMode === "same_unit" ? "Qtd. de compra" : "Unidades de compra"}
            value={form.purchaseQuantity ?? suggestedPurchaseQuantity}
            onChange={(value) => set("purchaseQuantity", value)}
          />
          <NumberField label="Valor material" value={form.materialValue} onChange={(value) => set("materialValue", value ?? 0)} />
          <NumberField label="Valor mão de obra" value={form.laborValue} onChange={(value) => set("laborValue", value ?? 0)} />
          <div className="rounded-xl bg-[var(--arq-card)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Total</p>
            <p className="mt-1 text-lg font-semibold">{money(total)}</p>
          </div>
        </div>
      </details>

      {selectedObject ? (
        <details className="mt-3 rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card-soft)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Aprovações</summary>
          <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
            <SelectField
              label="Contexto"
              value={approvalContext}
              onChange={(value) => setApprovalContext(value as SpecApprovalContext)}
              options={[
                ["technical", "Técnica"],
                ["architect", "Arquiteto"],
                ["client", "Cliente"],
                ["fabrication", "Fabricação"],
                ["installation", "Instalação"],
              ]}
            />
            <Field label="Observação da decisão" value={approvalNote} onChange={setApprovalNote} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={approving || !onDecision}
              onClick={() => void onDecision?.(approvalContext, "approved", approvalNote || null)}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Aprovar
            </button>
            <button
              type="button"
              disabled={approving || !onDecision}
              onClick={() => void onDecision?.(approvalContext, "revision_requested", approvalNote || null)}
              className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Solicitar revisão
            </button>
            <button
              type="button"
              disabled={approving || !onDecision}
              onClick={() => void onDecision?.(approvalContext, "rejected", approvalNote || null)}
              className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Reprovar
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {(approvals || []).slice(0, 8).map((approval) => (
              <div key={approval.id} className="rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {approval.context === "technical" ? "Técnica" : approval.context === "architect" ? "Arquiteto" : approval.context === "client" ? "Cliente" : approval.context === "fabrication" ? "Fabricação" : "Instalação"}
                    {" · "}
                    {approval.decision === "approved" ? "Aprovado" : approval.decision === "rejected" ? "Reprovado" : "Revisão solicitada"}
                  </span>
                  <span className="text-[var(--arq-muted)]">
                    {approval.createdAt ? new Date(approval.createdAt).toLocaleString("pt-BR") : ""}
                  </span>
                </div>
                <p className="mt-1 text-[var(--arq-muted)]">
                  {approval.actorName || "Usuário"}
                  {approval.projectRevision ? ` · revisão ${approval.projectRevision}` : ""}
                  {approval.note ? ` · ${approval.note}` : ""}
                </p>
              </div>
            ))}
            {!(approvals || []).length ? (
              <p className="text-xs text-[var(--arq-muted)]">Nenhuma decisão registrada para este item.</p>
            ) : null}
          </div>
        </details>
      ) : null}

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Observações</span>
        <textarea
          value={form.notes || ""}
          onChange={(event) => set("notes", event.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-3 py-2.5 text-sm leading-6 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />
      </label>

      <div className="mt-5 grid gap-2 md:grid-cols-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Salvando..." : selectedObject ? "Salvar" : "Criar item"}
        </button>
        <button
          type="button"
          disabled={!selectedObject || sendingToBudget || selectedObject?.technicalApprovalStatus !== "approved"}
          onClick={() => selectedObject ? onSendToBudget(selectedObject) : undefined}
          className="rounded-xl bg-[var(--arq-accent)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendingToBudget
            ? "Enviando..."
            : selectedObject && selectedObject.technicalApprovalStatus !== "approved"
              ? "Aprovação técnica necessária"
              : "Enviar ao orçamento"}
        </button>
      </div>

      {tenantId ? (
        <CatalogoModal
          open={catalogEditorOpen}
          onClose={() => setCatalogEditorOpen(false)}
          tenantId={tenantId}
          initialProductId={form.catalogProductId || null}
          initialCreateDraft={form.catalogProductId ? null : {
            nome: form.productName || form.name,
            unidade: form.unit,
            fornecedor: form.supplierName || "",
            precoBase: Number(form.materialValue || 0),
          }}
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
    sourceType: renderId ? "render" : "manual",
    name: "Novo item",
    category: "",
    region: "",
    quantity: 1,
    unit: "un",
    quantitySource: "manual",
    measurementSource: "pending",
    wasteFactor: 0,
    purchaseMode: "same_unit",
    purchaseUnit: "un",
    materialValue: 0,
    laborValue: 0,
    status: "draft",
  };
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-3 py-2.5 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
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
  value?: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{label}</span>
      <input
        type="number"
        step="any"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className="mt-2 w-full rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-3 py-2.5 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-3 py-2.5 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
      >
        {options.map(([optionValue, labelText]) => <option key={optionValue} value={optionValue}>{labelText}</option>)}
      </select>
    </label>
  );
}
