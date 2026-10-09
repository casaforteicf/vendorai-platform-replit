import { useEffect, useState } from "react";
import { ArqdorMepViewer } from "./ArqdorMepViewer";

/** Only mounts MEP views after server confirms the BIM workspace binding. */
export function ArqdorMepBoundView({ conceptId }: { conceptId: string }) {
  const [state,setState]=useState<{status:"loading"|"blocked"|"ready"|"error";workspaceId?:string;message?:string}>({status:"loading"});
  useEffect(()=>{
    const c=new AbortController();
    setState({status:"loading"});
    fetch(`/api/arch/concept-projects/${encodeURIComponent(conceptId)}/mep-binding`,{credentials:"include",signal:c.signal})
      .then(async r=>{
        if(r.status===409){setState({status:"blocked",message:"Vínculo com o modelo BIM ainda não validado; não é seguro editar instalações."});return;}
        if(!r.ok)throw new Error("Falha ao conferir vínculo BIM");
        const data=await r.json() as {workspaceProjectId?:string};
        if(!data.workspaceProjectId)throw new Error("Identificador BIM ausente");
        setState({status:"ready",workspaceId:data.workspaceProjectId});
      }).catch(()=>{if(!c.signal.aborted)setState({status:"error",message:"Não foi possível validar o vínculo com o projeto."});});
    return ()=>c.abort();
  },[conceptId]);
  if(state.status==="loading")return <p role="status">Verificando vínculo BIM…</p>;
  if(state.status!=="ready"||!state.workspaceId)return <p role="alert">{state.message}</p>;
  return <ArqdorMepViewer workspaceProjectId={state.workspaceId}/>;
}
