import React from "react";
import { InfoCard } from "./InfoCard";
import type { SpecObject } from "./specificationTypes";
import { statusBadgeClass, statusLabel } from "./specificationUtils";

type ObjectCardProps = {
  object: SpecObject;
  selected?: boolean;
  onSelect: (object: SpecObject) => void;
};

export function ObjectCard({ object, selected, onSelect }: ObjectCardProps) {
  return (
    <button type="button" onClick={() => onSelect(object)} className="text-left">
      <article
        className={[
          "rounded-[30px] border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
          selected ? "border-violet-300 ring-4 ring-violet-100" : "border-slate-100",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-950">{object.name}</p>
            <p className="mt-1 text-sm text-slate-500">{object.environment} • {object.category}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(object.status)}`}>
            {statusLabel(object.status)}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <InfoCard label="Fornecedor" value={object.supplier} />
          <InfoCard label="Preço" value={object.price} />
          <InfoCard label="Prazo" value={object.deadline} />
          <InfoCard label="Compatível" value={`${object.compatibility}%`} />
        </div>

        <div className="mt-4 rounded-3xl bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">{object.material}</p>
          <p className="mt-1 text-xs text-slate-500">{object.finish} • {object.dimensions}</p>
        </div>
      </article>
    </button>
  );
}
