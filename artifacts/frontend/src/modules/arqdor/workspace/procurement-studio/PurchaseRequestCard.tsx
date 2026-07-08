import React from "react";
import type { PurchaseRequest } from "./procurementTypes";
import { currency, formatDate, priorityClass, statusClass } from "./procurementUtils";

type Props = {
  request: PurchaseRequest;
  selected?: boolean;
  onSelect: (request: PurchaseRequest) => void;
};

export function PurchaseRequestCard({ request, selected, onSelect }: Props) {
  return (
    <button type="button" onClick={() => onSelect(request)} className="text-left">
      <article className={[
        "rounded-[30px] border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-violet-300 ring-4 ring-violet-100" : "border-slate-100",
      ].join(" ")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-950">{request.code}</p>
            <p className="mt-1 text-sm text-slate-500">{request.itemName}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(request.status)}`}>
            {request.status}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Info label="Fornecedor" value={request.supplierSuggestion} />
          <Info label="Prazo alvo" value={formatDate(request.targetDate)} />
          <Info label="Valor estimado" value={currency(request.estimatedValue)} />
          <Info label="Qtd." value={`${request.quantity} ${request.unit}`} />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(request.priority)}`}>
            {request.priority}
          </span>
          <span className="text-xs font-semibold text-slate-500">{request.discipline}</span>
        </div>
      </article>
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
