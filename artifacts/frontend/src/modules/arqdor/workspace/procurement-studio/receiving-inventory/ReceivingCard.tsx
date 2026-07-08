import React from "react";
import type { ReceivingItem } from "./receivingTypes";
import { formatDate, receivingClass } from "./receivingUtils";

export function ReceivingCard({ item, selected, onSelect }: { item: ReceivingItem; selected?: boolean; onSelect: (item: ReceivingItem) => void }) {
  return (
    <button type="button" onClick={() => onSelect(item)} className="text-left">
      <article className={[
        "rounded-[30px] border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-violet-300 ring-4 ring-violet-100" : "border-slate-100",
      ].join(" ")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-950">{item.code}</p>
            <p className="mt-1 text-sm text-slate-500">{item.itemName}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${receivingClass(item.status)}`}>{item.status}</span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Info label="Fornecedor" value={item.supplier} />
          <Info label="Entrega prevista" value={formatDate(item.expectedDate)} />
          <Info label="Recebido" value={formatDate(item.receivedDate)} />
          <Info label="Qtd." value={`${item.quantity} ${item.unit}`} />
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
