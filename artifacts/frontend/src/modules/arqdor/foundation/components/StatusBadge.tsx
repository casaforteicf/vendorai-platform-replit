import type { ArqdorProject } from "../types/arqdor.types";
import { getProjectStatus, getProjectStatusClass } from "../utils/project-formatters";

export function StatusBadge({ project }: { project?: ArqdorProject | null }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getProjectStatusClass(project)}`}>
      {getProjectStatus(project)}
    </span>
  );
}
