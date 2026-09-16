import React, { useState } from "react";
import ArqdorConstructionWorkspace from "./ArqdorConstructionWorkspace";
import AdvancedSchedulePanel from "./AdvancedSchedulePanel";

type Props = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

type Mode = "planning" | "operation";

export default function ConstructionHub({ arqState, onNavigate }: Props) {
  const [mode, setMode] = useState<Mode>("planning");

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      <div className="mx-auto w-full max-w-[1760px] px-5 pt-5 lg:px-8">
        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMode("planning")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "planning" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Planejamento físico-financeiro
          </button>
          <button
            type="button"
            onClick={() => setMode("operation")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "operation" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Operação da obra
          </button>
        </div>
      </div>

      {mode === "planning" ? (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8">
          <AdvancedSchedulePanel arqState={arqState} />
        </div>
      ) : (
        <ArqdorConstructionWorkspace arqState={arqState} onNavigate={onNavigate} />
      )}
    </div>
  );
}
