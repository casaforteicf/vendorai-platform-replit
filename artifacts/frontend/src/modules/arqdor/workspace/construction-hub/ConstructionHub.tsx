import React from "react";
import ArqdorConstructionWorkspace from "./ArqdorConstructionWorkspace";

type Props = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

export default function ConstructionHub({ arqState, onNavigate }: Props) {
  return <ArqdorConstructionWorkspace arqState={arqState} onNavigate={onNavigate} />;
}
