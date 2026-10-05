import React, { useMemo } from "react";
import { SmartSpecModule } from "../modules/SmartSpecModule";
import { getProject } from "./specificationUtils";

type SpecificationStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

export default function SpecificationStudio({ arqState, onNavigate }: SpecificationStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const projectId =
    project?.id ??
    arqState?.projectId ??
    arqState?.project?.id ??
    arqState?.currentProject?.id ??
    null;

  return (
    <div className="h-full min-h-0 bg-[#f7f7f8]">
      <SmartSpecModule projectId={projectId} onOpenRender={() => onNavigate?.("renders")} />
    </div>
  );
}
