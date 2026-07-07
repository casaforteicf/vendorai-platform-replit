import React from "react";
import { useDocumentationStudio } from "./DocumentationStudioContext";
import type { DocumentationItem } from "./documentationData";

const statusClass: Record<DocumentationItem["status"], string> = {
  pendente: "bg-amber-50 text-amber-700",
  gerado: "bg-blue-50 text-blue-700",
  revisao: "bg-violet-50 text-violet-700",
  aprovado: "bg-emerald-50 text-emerald-700",
};

const statusLabel: Record<DocumentationItem["status"], string> = {
  pendente: "Pendente",
  gerado: "Gerado",
  revisao: "Revisão",
  aprovado: "Aprovado",
};

export function DocumentItemCard({ item }: { item: DocumentationItem }) {
  const { selectedItems, toggleSelectedItem } = useDocumentationStudio();
  const selected = selectedItems.includes(item.id);

  return (
    <button
      type="button"
      onClick={() => toggleSelectedItem(item.id)}
      className={[
        "rounded-[28px] border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-violet-300 ring-4 ring-violet-100" : "border-slate-100",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{item.title}</p>
          <p className="mt-1 text-xs capitalize text-slate-500">{item.type}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass[item.status]}`}>
          {statusLabel[item.status]}
        </span>
      </div>

      <div className="mt-5 flex h-32 items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-400">
        Prévia técnica
      </div>
    </button>
  );
}
