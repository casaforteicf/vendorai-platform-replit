import React, { useState } from "react";
import ArqdorConstructionWorkspace from "./ArqdorConstructionWorkspace";
import AdvancedSchedulePanel from "./AdvancedSchedulePanel";
import CompleteSiteDiaryPanel from "./CompleteSiteDiaryPanel";
import RealConstructionFinancePanel from "./RealConstructionFinancePanel";
import RealConstructionQualityPanel from "./RealConstructionQualityPanel";
import RealProjectDecisionsPanel from "./RealProjectDecisionsPanel";
import ConstructionClientPortalButton from "./ConstructionClientPortalButton";
import ConstructionPortalSettings from "./ConstructionPortalSettings";

type Props = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

type Mode = "overview" | "planning" | "diary" | "finance" | "quality" | "decisions" | "portal";

type Tab = {
  id: Mode | "procurement";
  label: string;
  hint: string;
};

const TABS: Tab[] = [
  { id: "overview", label: "Visão Geral", hint: "Progresso, custos, compras, diários e medições" },
  { id: "planning", label: "Cronograma", hint: "Etapas, datas e avanço físico" },
  { id: "diary", label: "Diário & Fotos", hint: "Registro diário, equipes, materiais, ocorrências e mídia" },
  { id: "finance", label: "Financeiro", hint: "DRE, pagamentos, compromissos e saldo projetado" },
  { id: "procurement", label: "Compras", hint: "Solicitações, cotações e fornecedores" },
  { id: "quality", label: "Qualidade", hint: "Inspeções e não conformidades" },
  { id: "decisions", label: "Decisões", hint: "Pendências, responsáveis e aprovações" },
  { id: "portal", label: "Portal do Cliente", hint: "Controle exatamente o que o cliente pode visualizar" },
];

export default function ConstructionHub({ arqState, onNavigate }: Props) {
  const [mode, setMode] = useState<Mode>("overview");

  function openTab(tab: Tab) {
    if (tab.id === "procurement") {
      onNavigate?.("procurement");
      return;
    }
    setMode(tab.id);
  }

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      <div className="mx-auto w-full max-w-[1760px] px-5 pt-5 lg:px-8">
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">ARQDOR • Gestão da Obra</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Workspace único da obra</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Projeto, cronograma, diário, fotos, financeiro, compras, medições, qualidade e decisões usam a mesma obra vinculada ao projeto.
              </p>
            </div>
            <ConstructionClientPortalButton arqState={arqState} />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            {TABS.map((tab) => {
              const active = tab.id !== "procurement" && mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => openTab(tab)}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}
                >
                  <span className="block text-sm font-semibold">{tab.label}</span>
                  <span className={`mt-1 block text-[11px] leading-4 ${active ? "text-slate-300" : "text-slate-400"}`}>{tab.hint}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => onNavigate?.("cliente")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Projeto & Aprovações do Cliente
            </button>
            <button type="button" onClick={() => onNavigate?.("real-budget")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Orçamento Executivo
            </button>
            <button type="button" onClick={() => onNavigate?.("execution")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Produção & Execução
            </button>
          </div>
        </div>
      </div>

      {mode === "overview" ? (
        <ArqdorConstructionWorkspace arqState={arqState} onNavigate={onNavigate} />
      ) : mode === "planning" ? (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8"><AdvancedSchedulePanel arqState={arqState} /></div>
      ) : mode === "diary" ? (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8"><CompleteSiteDiaryPanel arqState={arqState} /></div>
      ) : mode === "finance" ? (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8"><RealConstructionFinancePanel arqState={arqState} /></div>
      ) : mode === "quality" ? (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8"><RealConstructionQualityPanel arqState={arqState} /></div>
      ) : mode === "decisions" ? (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8"><RealProjectDecisionsPanel arqState={arqState} onNavigate={onNavigate} /></div>
      ) : (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8"><ConstructionPortalSettings arqState={arqState} /></div>
      )}
    </div>
  );
}
