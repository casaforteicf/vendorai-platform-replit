import React from "react";
import type { ReceivingItem } from "./receivingTypes";
import { formatDate, receivingClass } from "./receivingUtils";

export function ReceivingInspector({ item }: { item: ReceivingItem }) {
  return (
    <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Recebimento</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">{item.code}</h3>
      <p className="mt-1 text-sm text-slate-500">{item.purchaseOrder} • {item.supplier}</p>

      <div className="mt-5">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${receivingClass(item.status)}`}>{item.status}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Info label="Ambiente" value={item.environment} />
        <Info label="Responsável" value={item.responsible} />
        <Info label="Previsto" value={formatDate(item.expectedDate)} />
        <Info label="Recebido" value={formatDate(item.receivedDate)} />
        <Info label="Qtd." value={`${item.quantity} ${item.unit}`} />
        <Info label="Fornecedor" value={item.supplier} />
      </div>

      <div className="mt-5 rounded-3xl bg-violet-50 p-4">
        <p className="text-sm font-semibold text-violet-950">Leitura IA</p>
        <p className="mt-1 text-xs leading-5 text-violet-700">{item.aiNote}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {["Conferir", "Fotos", "Aprovar", "Reservar"].map((action, index) => (
          <button key={action} type="button" className={[
            "rounded-2xl px-3 py-3 text-xs font-semibold transition",
            index === 2 ? "bg-slate-950 text-white hover:bg-violet-700" : "bg-slate-50 text-slate-700 hover:bg-violet-50 hover:text-violet-700",
          ].join(" ")}>
            {action}
          </button>
        ))}
      </div>
    </aside>
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
