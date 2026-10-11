import React, { useMemo, useState } from "react";
import { DxfReferenceCanvas, isDxfReferencePayload, type StudioDxfLayer } from "./DxfReferenceCanvas";
import { InteriorStartPanel } from "./InteriorStartPanel";
import { CabinetDraftPanel } from "./CabinetDraftPanel";
import type {CabinetDraft} from "../../shared/parametric-cabinet-core";
import { FurniturePlacementPanel } from "./FurniturePlacementPanel";
import type { InteriorEnvironment } from "./interior-environment";
import { DesignHeader } from "./DesignHeader";
import { StudioProvider, useStudio } from "./StudioContext";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { AIChatPanel } from "./AIChatPanel";
import { LibraryPanel } from "./LibraryPanel";

type DesignStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

function getProjects(arqState: any): any[] {
  const list = arqState?.projects || arqState?.projetos || arqState?.allProjects || [];
  return Array.isArray(list) ? list : [];
}

function getProject(arqState: any) {
  const projects = getProjects(arqState);
  return arqState?.currentProject || arqState?.selectedProject || arqState?.project || projects?.[0] || null;
}

function getTitle(project: any) {
  return project?.titulo || project?.title || project?.name || "Projeto";
}

function getEnvironment(project: any) {
  const env = project?.ambientes?.[0];
  return env?.nome || env?.name || env?.titulo || "Ambiente principal";
}

function StudioTools() {
  const { mode, setMode, selectedTool, setSelectedTool } = useStudio();

  const tools = [
    ["select", "↖", "Selecionar"],
    ["material", "◐", "Materiais"],
    ["light", "☼", "Luz"],
    ["decor", "✦", "Decorar"],
  ];

  return (
    <div className="flex h-full flex-col items-center gap-3 py-4">
      {tools.map(([key, icon, label]) => (
        <button
          key={key}
          title={label}
          type="button"
          onClick={() => setSelectedTool(key)}
          className={[
            "flex h-11 w-11 items-center justify-center rounded-2xl text-lg transition",
            selectedTool === key
              ? "bg-slate-950 text-white"
              : "bg-slate-50 text-slate-500 hover:bg-violet-50 hover:text-violet-700",
          ].join(" ")}
        >
          {icon}
        </button>
      ))}

      <div className="mt-auto flex flex-col gap-3">
        {[
          ["design", "D"],
          ["materials", "M"],
          ["ai", "IA"],
          ["versions", "V"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key as any)}
            className={[
              "flex h-10 w-10 items-center justify-center rounded-xl text-xs font-semibold transition",
              mode === key
                ? "bg-violet-600 text-white"
                : "bg-white text-slate-500 hover:bg-violet-50 hover:text-violet-700",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CanvasPlaceholder() {
  return (
    <div className="flex h-full min-h-[460px] items-center justify-center rounded-[28px] bg-slate-900">
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-white/10 text-2xl text-white/60">
          ARQ
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-white">Design Studio</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-300">
          O render principal aparecerá aqui. Nas próximas partes entram canvas, zoom, seleção visual,
          materiais, IA contextual e timeline de versões.
        </p>
      </div>
    </div>
  );
}

function RightPanel() {
  const { mode, setRightPanelOpen } = useStudio();

  const title: Record<string, string> = {
    design: "Painel inteligente",
    materials: "Materiais",
    ai: "IA contextual",
    versions: "Versões",
  };

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-violet-600">ARQDOR</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{title[mode]}</h3>
        </div>
        <button
          type="button"
          onClick={() => setRightPanelOpen(false)}
          className="rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
        >
          Fechar
        </button>
      </div>

      <div className="space-y-3">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Próxima ação</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Selecione um objeto no render para editar materiais, iluminação ou gerar uma nova versão.
          </p>
        </div>

        <div className="rounded-3xl bg-violet-50 p-4">
          <p className="text-sm font-semibold text-violet-900">Sugestão IA</p>
          <p className="mt-1 text-sm leading-6 text-violet-700">
            Quando houver render ativo, a IA vai sugerir melhorias discretas baseadas no briefing.
          </p>
        </div>
      </div>
    </div>
  );
}

function BottomTimeline() {
  return (
    <div className="flex h-full items-center gap-3 overflow-x-auto px-4">
      {["Vista principal", "Ilha", "Bancada", "Jantar", "Noturna"].map((item, index) => (
        <div
          key={item}
          className="flex h-24 min-w-[160px] items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-sm font-medium text-slate-600"
        >
          {index + 1}. {item}
        </div>
      ))}
      <button
        type="button"
        className="flex h-24 min-w-[140px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm font-semibold text-violet-700"
      >
        + Nova vista
      </button>
    </div>
  );
}

function DesignStudioInner({ arqState, onNavigate }: DesignStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const { mode, setRightPanelOpen } = useStudio();
  const [dxfLayers,setDxfLayers]=useState<StudioDxfLayer[]>([]);
  const [interior,setInterior]=useState<InteriorEnvironment|null>(null);
  const [cabinetDraft,setCabinetDraft]=useState<CabinetDraft|null>(null);
  const onLibraryApply=(payload:unknown)=>{
    if(!isDxfReferencePayload(payload))return;
    const reference=payload.reference;
    if(reference.entities.length===0)return;
    setDxfLayers(current=>[...current,{id:`dxf-${Date.now()}-${Math.random().toString(36).slice(2)}`,fileName:payload.fileName,reference,visible:true}]);
  };

  const projectId=String(project?.id??project?.projectId??"");
  const rooms=Array.isArray(project?.ambientes)?project.ambientes.filter((r:any)=>r?.id):[];
  const [showImport,setShowImport]=useState(false);
  return (
    <div className="min-h-screen bg-[#f7f7f8] p-6 text-slate-950">
      <WorkspaceLayout
        header={
          <DesignHeader
            projectTitle={getTitle(project)}
            environmentName={getEnvironment(project)}
            versionLabel="Studio de criação"
            onNextStep={() => onNavigate?.("documentacao")}
          />
        }
        leftPanel={<StudioTools />}
        canvas={!interior&&!showImport ? <InteriorStartPanel projectId={projectId||null} rooms={rooms} onStart={value=>{setCabinetDraft(null);setInterior(value);}} onImport={()=>{setShowImport(true);setRightPanelOpen(true);}}/> : dxfLayers.length ? <DxfReferenceCanvas layers={dxfLayers} onRemove={id=>setDxfLayers(current=>current.filter(l=>l.id!==id))} onToggle={id=>setDxfLayers(current=>current.map(l=>l.id===id?{...l,visible:!l.visible}:l))}/> : <div className="flex h-full flex-col gap-3"><div className="rounded-xl border bg-white p-3 text-sm"><strong>{interior?.name??"Importação"}</strong> · {interior?.source==="preproject"?"Vinculado ao Pré-Projeto":interior?.source==="new-room"?"Novo ambiente":"Referência"} · rascunho sem salvamento <button type="button" className="ml-3 text-violet-700 underline" onClick={()=>{setCabinetDraft(null);setInterior(null);setShowImport(false);}}>Trocar ambiente</button></div>{interior&&<CabinetDraftPanel environment={interior} onDraft={setCabinetDraft}/>} {interior&&<FurniturePlacementPanel environment={interior} draft={cabinetDraft}/>} {interior?.walls.length ? <svg viewBox="-.5 -.5 6 5" className="min-h-64 flex-1 rounded-xl bg-white" aria-label="Paredes do ambiente"><g fill="none" stroke="#334155" strokeWidth=".06">{interior.walls.map(w=><line key={w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}/>)}</g></svg>:<CanvasPlaceholder/>}</div>}
        rightPanel={
          (mode === "materials" || showImport)
            ? <LibraryPanel onApply={payload=>{onLibraryApply(payload);if(isDxfReferencePayload(payload))setShowImport(false);}} />
            : <AIChatPanel projectTitle={getTitle(project)} environmentName={getEnvironment(project)} onClose={() => setRightPanelOpen(false)} />
        }
        bottomPanel={<BottomTimeline />}
      />

      <button
        type="button"
        onClick={() => setRightPanelOpen(true)}
        className="fixed bottom-6 right-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-violet-700"
      >
        Abrir painel
      </button>
    </div>
  );
}

export default function DesignStudio(props: DesignStudioProps) {
  return (
    <StudioProvider>
      <DesignStudioInner {...props} />
    </StudioProvider>
  );
}
