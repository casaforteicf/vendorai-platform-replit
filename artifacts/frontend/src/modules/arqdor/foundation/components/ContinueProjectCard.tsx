import type { ArqdorProject } from "../types/arqdor.types";
import {
  formatProjectDate,
  getClientName,
  getNextStep,
  getProjectCover,
  getProjectTitle,
} from "../utils/project-formatters";
import { ArqButton } from "./ArqButton";
import { StatusBadge } from "./StatusBadge";

export function ContinueProjectCard({
  project,
  onContinue,
  onCreate,
}: {
  project?: ArqdorProject | null;
  onContinue?: () => void;
  onCreate?: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[32px] bg-slate-950 shadow-sm">
      <div className="grid min-h-[320px] lg:grid-cols-[1fr_0.85fr]">
        <div className="flex flex-col justify-between p-8 text-white">
          <div>
            <p className="text-sm font-medium text-violet-300">Continue exatamente de onde parou</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              {project ? getProjectTitle(project) : "Comece seu primeiro projeto"}
            </h2>
            <p className="mt-2 text-slate-300">
              {project ? getClientName(project) : "Crie um projeto para iniciar o ARQDOR Studio."}
            </p>

            {project ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <StatusBadge project={project} />
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
                  {formatProjectDate(project.updatedAt || project.updated_at)}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-8">
            <p className="mb-3 text-sm text-slate-300">
              Próxima etapa: <span className="font-semibold text-white">{getNextStep(project)}</span>
            </p>

            <ArqButton variant="secondary" onClick={project ? onContinue : onCreate}>
              {project ? "▶ Continuar projeto" : "Criar projeto"}
            </ArqButton>
          </div>
        </div>

        <div className="hidden bg-slate-900 lg:block">
          {getProjectCover(project) ? (
            <img src={getProjectCover(project)} alt={getProjectTitle(project)} className="h-full w-full object-cover opacity-90" />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl font-semibold text-white/10">ARQDOR</div>
          )}
        </div>
      </div>
    </section>
  );
}
