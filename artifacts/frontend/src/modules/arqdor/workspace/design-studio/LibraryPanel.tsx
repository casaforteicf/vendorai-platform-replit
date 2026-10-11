import React, { useState } from "react";
import { FurnitureSidebar } from "./FurnitureSidebar";
import { ManufacturerLibrary } from "./ManufacturerLibrary";
import { MaterialSidebar } from "./MaterialSidebar";
import { DxfReferencePanel } from "./DxfReferencePanel";

type LibraryPanelProps = {
  onApply?: (payload: unknown) => void;
};

export function LibraryPanel({ onApply }: LibraryPanelProps) {
  const [tab, setTab] = useState<"materials" | "furniture" | "manufacturers" | "import">("materials");

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-100 p-4">
        <div className="grid grid-cols-4 gap-2 rounded-2xl bg-slate-50 p-1">
          {[
            ["materials", "Materiais"],
            ["furniture", "Móveis"],
            ["manufacturers", "Marcas"],
            ["import", "Importar"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key as typeof tab)}
              className={[
                "rounded-xl px-3 py-2 text-xs font-semibold transition",
                tab === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-violet-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "materials" ? <MaterialSidebar onSelect={onApply} /> : null}
        {tab === "furniture" ? <FurnitureSidebar onSelect={onApply} /> : null}
        {tab === "manufacturers" ? <ManufacturerLibrary onSelect={onApply} /> : null}
        {tab === "import" ? <DxfReferencePanel onApply={onApply} /> : null}
      </div>
    </div>
  );
}
