import React, { useMemo } from "react";
import { DisciplineSidebar } from "./DisciplineSidebar";
import { DocumentationCanvas } from "./DocumentationCanvas";
import { DocumentationHeader } from "./DocumentationHeader";
import { DocumentationStudioProvider } from "./DocumentationStudioContext";

type DocumentationStudioProps = {
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

export default function DocumentationStudio({ arqState, onNavigate }: DocumentationStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);

  return (
    <DocumentationStudioProvider>
      <div className="min-h-screen bg-[#f7f7f8] p-6 text-slate-950">
        <div className="mx-auto flex min-h-[780px] max-w-[1600px] overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-sm">
          <div className="w-[300px] shrink-0">
            <DisciplineSidebar />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <DocumentationHeader projectTitle={getProjectTitle(project)} onBackToStudio={() => onNavigate?.("render")} />

            <main className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f8] p-6">
              <DocumentationCanvas />
            </main>
          </div>
        </div>
      </div>
    </DocumentationStudioProvider>
  );
}
