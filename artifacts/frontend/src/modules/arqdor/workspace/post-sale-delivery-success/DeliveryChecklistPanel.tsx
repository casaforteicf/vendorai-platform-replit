import React, { useState } from "react";
import type { ChecklistCategory, DeliveryChecklistItem, DeliveryProject } from "./postSaleTypes";
import { checklistCategoryLabel } from "./postSaleUtils";

export function DeliveryChecklistPanel({
  delivery,
  checklist,
  saving,
  onAdd,
  onToggle,
}: {
  delivery?: DeliveryProject | null;
  checklist: DeliveryChecklistItem[];
  saving?: boolean;
  onAdd: (payload: any) => Promise<unknown>;
  onToggle: (item: DeliveryChecklistItem, done: boolean) => Promise<unknown>;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<ChecklistCategory>("quality");

  function add() {
    if (!delivery || !label.trim()) return;

    void onAdd({
      deliveryId: delivery.id,
      projectId: delivery.projectId,
      category,
      label,
      required: true,
      done: false,
    });

    setLabel("");
  }

  const grouped = checklist.reduce<Record<string, DeliveryChecklistItem[]>>((acc, item) => {
    acc[item.category] = acc[item.category] || [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Entrega</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Checklist final de entrega</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-[220px_1fr_auto]">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as ChecklistCategory)}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        >
          <option value="execution">Execução</option>
          <option value="quality">Qualidade</option>
          <option value="cleaning">Limpeza</option>
          <option value="documentation">Documentação</option>
          <option value="client-approval">Aprovação cliente</option>
          <option value="warranty">Garantia</option>
        </select>

        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Novo item do checklist..."
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
        />

        <button
          type="button"
          disabled={!delivery || saving}
          onClick={add}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(grouped).map(([key, list]) => (
          <div key={key} className="rounded-[28px] bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">{checklistCategoryLabel(key as ChecklistCategory)}</p>

            <div className="mt-3 space-y-2">
              {list.map((item) => (
                <label key={item.id} className="flex items-start gap-3 rounded-2xl bg-white p-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(event) => void onToggle(item, event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className={item.done ? "font-medium line-through text-slate-400" : "font-medium text-slate-800"}>
                      {item.label}
                    </span>
                    {item.required ? <span className="ml-2 text-xs font-semibold text-rose-500">obrigatório</span> : null}
                    {item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {!checklist.length ? (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Nenhum item criado. Inicie o pós-venda a partir da produção.
          </div>
        ) : null}
      </div>
    </section>
  );
}
