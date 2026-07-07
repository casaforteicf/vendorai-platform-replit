import type { ArqdorProject } from "../types/arqdor.types";
import {
  formatProjectDate,
  getClientName,
  getNextStep,
  getProjectArea,
  getProjectProgress,
  getProjectTitle,
} from "../utils/project-formatters";
import { ArqCard } from "./ArqCard";
import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";

export function ProjectCard({
  project,
  onOpen,
}: {
  project: ArqdorProject;
  onOpen?: (project: ArqdorProject) => void;
}) {
  const progress = getProjectProgress(project);

  return (
    <button type="button" onClick={() => onOpen?.(project)} className="text-left">
      <ArqCard className="h-full p-5 transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-950">{getProjectTitle(project)}</h3>
            <p className="mt-1 truncate text-sm text-slate-500">{getClientName(project)}</p>
          </div>
          <StatusBadge project={project} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Área</p>
            <p className="font-medium text-slate-700">{getProjectArea(project)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Atualizado</p>
            <p className="font-medium text-slate-700">{formatProjectDate(project.updatedAt || project.updated_at)}</p>
          </div>
        </div>

        <div className="mt-5">
          <ProgressBar value={progress} />
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Próxima etapa</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{getNextStep(project)}</p>
        </div>
      </ArqCard>
    </button>
  );
}
