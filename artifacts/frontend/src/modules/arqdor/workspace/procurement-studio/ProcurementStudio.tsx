import React, { useState } from "react";
import RealProcurementWorkspace from "./RealProcurementWorkspace";
import SupplierRfqWorkspace from "./SupplierRfqWorkspace";

type ProcurementStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

export default function ProcurementStudio({ arqState, onNavigate }: ProcurementStudioProps) {
  const [view, setView] = useState<"quotes" | "purchases">("quotes");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto w-full max-w-[1760px] px-6 py-6">
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView("quotes")}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold ${view === "quotes" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
          >
            Cotações de fornecedores
          </button>
          <button
            type="button"
            onClick={() => setView("purchases")}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold ${view === "purchases" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
          >
            Compras, pedidos e recebimento
          </button>
        </div>

        {view === "quotes"
          ? <SupplierRfqWorkspace arqState={arqState} onNavigate={onNavigate} />
          : <RealProcurementWorkspace arqState={arqState} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}
