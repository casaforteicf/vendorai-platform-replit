import type { ArqdorProject } from "../types/arqdor.types";
import { EmptyState } from "./EmptyState";
import { ProjectCard } from "./ProjectCard";

export function ProjectGrid({
  projects,
  onOpen,
  onCreate,
}: {
  projects: ArqdorProject[];
  onOpen?: (project: ArqdorProject) => void;
  onCreate?: () => void;
}) {
  if (!projects.length) {
    return (
      <EmptyState
        title="Comece seu primeiro projeto no ARQDOR."
        description="Crie um projeto para organizar ambientes, renders, especificações e entregas."
        actionLabel="Criar projeto"
        onAction={onCreate}
      />
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} onOpen={onOpen} />
      ))}
    </div>
  );
}
