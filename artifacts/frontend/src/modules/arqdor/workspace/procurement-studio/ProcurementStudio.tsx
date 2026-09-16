import React from "react";
import RealProcurementWorkspace from "./RealProcurementWorkspace";

type ProcurementStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

export default function ProcurementStudio({ arqState, onNavigate }: ProcurementStudioProps) {
  return <RealProcurementWorkspace arqState={arqState} onNavigate={onNavigate} />;
}
