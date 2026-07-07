import React, { useMemo } from "react";
import { BudgetProvider } from "./BudgetContext";
import { BudgetCanvas } from "./BudgetCanvas";
import { BudgetHeader } from "./BudgetHeader";
import { BudgetSidebar } from "./BudgetSidebar";
import { createDefaultBudgetItems } from "./budgetData";

type BudgetEngineProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

function getProjects(arqState: any): any[] {
  const list = arqState?.projects || arqState?.projetos || arqState?.allProjects || [];
  return Array.isArray(list) ? list : [];
}

function getProject(arqState: any) {
  const projects = getProjects(arqState);
  return arqState?.currentProject || arqState?.selectedProject || arqState?.project || projects?.[0] || null;
}

function getProjectTitle(project: any): string {
  return project?.titulo || project?.title || project?.name || "Projeto";
}

export default function BudgetEngine({ arqState, onNavigate }: BudgetEngineProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const initialItems = useMemo(() => createDefaultBudgetItems(), []);

  return (
    <BudgetProvider initialItems={initialItems}>
      <div className="min-h-screen bg-[#f7f7f8] p-6 text-slate-950">
        <div className="mx-auto flex min-h-[780px] max-w-[1600px] overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-sm">
          <div className="w-[300px] shrink-0">
            <BudgetSidebar />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <BudgetHeader projectTitle={getProjectTitle(project)} onBackToProduction={() => onNavigate?.("office")} />

            <main className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f8] p-6">
              <BudgetCanvas />
            </main>
          </div>
        </div>
      </div>
    </BudgetProvider>
  );
}
