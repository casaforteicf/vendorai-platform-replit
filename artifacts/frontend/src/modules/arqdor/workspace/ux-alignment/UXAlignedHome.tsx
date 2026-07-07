import React from "react";
import { AIArchitectPanel } from "./AIArchitectPanel";
import { ProjectScorePanel } from "./ProjectScorePanel";
import { ProjectStoryTimeline } from "./ProjectStoryTimeline";

type UXAlignedHomeProps = {
  projectName?: string;
  clientName?: string;
  onCreateProject?: () => void;
};

export function UXAlignedHome({
  projectName = "Comece seu primeiro projeto",
  clientName = "ARQDOR Studio",
  onCreateProject,
}: UXAlignedHomeProps) {
  return (
    <div className="min-h-screen bg-[#f7f7f8] p-6 text-slate-950">
      <div className="mx-auto grid max-w-[1600px] gap-5 xl:grid-cols-[1fr_390px]">
        <main className="space-y-5">
          <section className="overflow-hidden rounded-[36px] bg-slate-950 shadow-sm">
            <div className="grid min-h-[380px] lg:grid-cols-[1fr_0.7fr]">
              <div className="flex flex-col justify-between p-8 text-white">
                <div>
                  <p className="text-sm font-medium text-violet-300">ARQDOR.ai Operating Workspace</p>
                  <h1 className="mt-4 text-4xl font-semibold tracking-tight">{projectName}</h1>
                  <p className="mt-2 text-slate-300">{clientName}</p>
                </div>

                <div>
                  <p className="mb-4 text-sm text-slate-300">
                    O ARQDOR organiza design, render, documentação, produção, orçamento e cliente no mesmo Projeto Inteligente.
                  </p>
                  <button
                    type="button"
                    onClick={onCreateProject}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-100"
                  >
                    Criar projeto inteligente
                  </button>
                </div>
              </div>

              <div className="hidden items-center justify-center bg-slate-900 lg:flex">
                <div className="text-6xl font-semibold text-white/10">ARQDOR</div>
              </div>
            </div>
          </section>

          <ProjectStoryTimeline />
        </main>

        <aside className="space-y-5">
          <AIArchitectPanel />
          <ProjectScorePanel />
        </aside>
      </div>
    </div>
  );
}
