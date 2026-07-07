import React from "react";
import { AIArchitectPanel } from "./AIArchitectPanel";
import { ObjectIntelligencePanel } from "./ObjectIntelligencePanel";
import { ProjectScorePanel } from "./ProjectScorePanel";
import { ProjectStoryTimeline } from "./ProjectStoryTimeline";
import { UXAlignmentProvider } from "./UXAlignmentContext";
import { WorkflowNavigator } from "./WorkflowNavigator";

type AlignedStudioShellProps = {
  children?: React.ReactNode;
  title?: string;
  subtitle?: string;
};

export default function AlignedStudioShell({
  children,
  title = "Sala de Estar",
  subtitle = "Residência Quinta do Lago",
}: AlignedStudioShellProps) {
  return (
    <UXAlignmentProvider>
      <div className="min-h-screen bg-[#f7f7f8] p-6 text-slate-950">
        <div className="mx-auto grid max-w-[1700px] gap-5 xl:grid-cols-[1fr_390px]">
          <main className="min-w-0 space-y-5">
            <header className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm text-slate-500">{subtitle}</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
                </div>
                <WorkflowNavigator />
              </div>
            </header>

            <section className="overflow-hidden rounded-[32px] border border-slate-100 bg-white p-4 shadow-sm">
              {children || <RenderPlaceholder />}
            </section>

            <ProjectStoryTimeline />
          </main>

          <aside className="space-y-5">
            <AIArchitectPanel />
            <ProjectScorePanel />
            <ObjectIntelligencePanel />
          </aside>
        </div>
      </div>
    </UXAlignmentProvider>
  );
}

function RenderPlaceholder() {
  return (
    <div className="flex min-h-[620px] items-center justify-center rounded-[28px] bg-slate-950">
      <div className="max-w-lg text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-white/10 text-2xl text-white/60">
          ARQ
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-white">Render protagonista</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Esta Sprint corretiva reorganiza o Studio para destacar render, IA, score, objeto inteligente e história do projeto.
        </p>
      </div>
    </div>
  );
}
