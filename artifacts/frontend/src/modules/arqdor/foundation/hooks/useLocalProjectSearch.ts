import { useMemo } from "react";
import type { ArqdorProject } from "../types/arqdor.types";
import { getClientName, getProjectTitle } from "../utils/project-formatters";

export function useLocalProjectSearch(projects: ArqdorProject[], query: string) {
  return useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;

    return projects.filter((project) => {
      const title = getProjectTitle(project).toLowerCase();
      const client = getClientName(project).toLowerCase();
      const status = String(project.status || "").toLowerCase();
      const type = String(project.tipoObra || "").toLowerCase();

      return (
        title.includes(normalized) ||
        client.includes(normalized) ||
        status.includes(normalized) ||
        type.includes(normalized)
      );
    });
  }, [projects, query]);
}
