import { useMemo, useState } from "react";
import { ChevronRight, FolderOpen, Menu } from "lucide-react";

/** Visual aprovado da Tela 1 Cliente. Dados são recebidos somente após autorização pelo portal existente. */
export type ClientProject = {
  id: string; title: string; category?: string; location?: string; areaM2?: number;
  status: "Em desenvolvimento" | "Aguardando cotações" | "Em orçamento" | "Em contratação" | "Concluído";
  progress?: number; imageUrl?: string; updatedAt?: string;
};
export type ClientDashboardProps = {
  projects: ClientProject[];
  clientName: string;
  activeProjectId?: string;
  onOpenProject: (projectId: string) => void;
  onNavigate: (destination: "projetos" | "renders" | "orcamentos" | "cotacoes" | "propostas" | "contratacoes" | "profissionais" | "mensagens" | "ajuda" | "configuracoes") => void;
  onNewProject?: () => void;
  /** Tenant/servidor deve autorizar criação e fornecer handler real. */
  canCreateProject?: boolean;
  /** Opcional: eventos previamente autorizados pelo backend; nunca sintetizar atividade. */
  recentActivity?: Array<{id: string; title: string; when: string}>;
};
const nav = [
  ["projetos", "Meus projetos"],["renders","Render e ideias"],["orcamentos","Orçamentos"],
  ["cotacoes","Cotações"],["propostas","Propostas"],["contratacoes","Contratações"],
  ["profissionais","Profissionais"],["mensagens","Mensagens"],
  ["ajuda","Ajuda"],["configuracoes","Configurações"],
] as const;
const filters = ["Todos","Em desenvolvimento","Aguardando cotações","Em contratação","Concluído"] as const;
const statusColor: Record<ClientProject["status"],string> = {
  "Em desenvolvimento":"#00b48b","Aguardando cotações":"#1781eb","Em orçamento":"#f6b916",
  "Em contratação":"#943ced","Concluído":"#17684d"
};
export default function ApprovedClientDashboard(props: ClientDashboardProps) {
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<string>("Todos");
  const [sort,setSort]=useState<"recent"|"title">("recent");
  const [mobileNav,setMobileNav]=useState(false);
  const projects = props.projects;
  const filtered = useMemo(()=>projects.filter(p=>(filter==="Todos"||p.status===filter)
    && [p.title,p.location??"",p.category??""].some(v=>v.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))))
    .sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):String(b.updatedAt??"").localeCompare(String(a.updatedAt??""))),
    [projects,filter,query,sort]);
  const navigate=(key:typeof nav[number][0])=>{setMobileNav(false);props.onNavigate(key)};
  const open=(id:string)=>props.onOpenProject(id);
  const complete=projects.filter(p=>p.status==="Concluído").length;
  const average=projects.length?Math.round(projects.reduce((total,p)=>total+Math.max(0,Math.min(100,p.progress??0)),0)/projects.length):0;
  const next=projects.find(p=>p.status!=="Concluído");
  return <div className="arqc-root">
    <style>{`
      .arqc-root{min-height:100vh;min-width:0;background:#f8fafc;color:#091326;font-family:Inter,system-ui,sans-serif}
      .arqc-root *{box-sizing:border-box}.arqc-header{height:90px;background:linear-gradient(100deg,#002d22,#00170f);color:white;display:flex;align-items:center;gap:26px;padding:12px 22px}
      .arqc-logo{display:flex;align-items:center;gap:10px;min-width:400px}.arqc-logo img{width:98px;height:65px;object-fit:contain}.arqc-logo b{font-size:37px;letter-spacing:-1px}.arqc-logo small{display:block;font-size:9px;letter-spacing:1.5px}
      .arqc-search{height:48px;min-width:0;flex:1;background:#063f34;border:0;border-radius:9px;padding:0 16px;color:white}.arqc-search::placeholder{color:#b4cbc5}
      .arqc-account{display:flex;align-items:center;gap:12px;min-width:180px}.arqc-avatar{width:44px;height:44px;border-radius:50%;background:#05b98a;display:grid;place-items:center}
      .arqc-body{display:flex;min-width:0;min-height:calc(100vh - 90px)}.arqc-side{width:218px;flex-shrink:0;background:#00291f;color:white;padding:22px 12px;display:flex;flex-direction:column;gap:4px}
      .arqc-nav{width:100%;border:0;border-radius:8px;background:transparent;color:white;text-align:left;padding:14px 13px;cursor:pointer;font-size:14px}.arqc-nav.on{background:linear-gradient(90deg,#00ac89,#004b3d);font-weight:700}
      .arqc-main{min-width:0;flex:1;padding:24px 25px}.arqc-title{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}.arqc-title h1{font-size:36px;margin:0}.arqc-title p{margin:0;color:#667e9c}
      .arqc-button{border:0;border-radius:8px;background:linear-gradient(90deg,#00b48f,#00674e);color:white;padding:14px 22px;font-weight:700;cursor:pointer}
      .arqc-content{display:flex;gap:24px;align-items:flex-start;margin-top:26px}.arqc-projects{flex:1;min-width:0}.arqc-filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}.arqc-filter{border:1px solid #e5edf4;background:#f5f8fb;border-radius:8px;padding:12px 15px;cursor:pointer}.arqc-filter.on{background:#00a884;color:white}
      .arqc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.arqc-card{border:1px solid #e1e9f0;border-radius:9px;background:white;overflow:hidden;padding:0;text-align:left;cursor:pointer;color:inherit}
      .arqc-photo{height:155px;background:linear-gradient(145deg,#19483f,#a0b5ad);position:relative}.arqc-photo img{width:100%;height:100%;object-fit:cover}.arqc-status{position:absolute;top:12px;left:12px;background:white;border-radius:8px;padding:7px 9px;font-size:11px}
      .arqc-info{padding:14px 16px}.arqc-info strong{display:block;font-size:16px}.arqc-info p{font-size:12px;color:#667c9c;margin:7px 0}.arqc-track{height:7px;background:#e8eef2;overflow:hidden;border-radius:7px}.arqc-track i{height:100%;display:block;background:#0db58d}
      .arqc-aside{width:285px;flex-shrink:0}.arqc-panel{background:white;border:1px solid #e1eaf0;border-radius:9px;padding:16px;margin-bottom:14px}.arqc-panel h2{font-size:16px;margin:0 0 14px}.arqc-stats{display:flex;justify-content:space-between;text-align:center;gap:8px}.arqc-stats strong{font-size:26px;display:block}.arqc-stats small{color:#6d85aa;font-size:11px}
      .arqc-mobile{display:none}.arqc-vendi{position:fixed;right:20px;bottom:24px;border:0;border-radius:50%;height:56px;width:56px;background:#02ae85;color:white;box-shadow:0 5px 20px #002b2740}
      @media(max-width:1350px){.arqc-logo{min-width:260px}.arqc-logo b{font-size:28px}.arqc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:1050px){.arqc-aside{display:none}.arqc-header{gap:12px}.arqc-logo{min-width:auto}.arqc-logo img{width:50px}.arqc-logo b{font-size:22px}.arqc-logo small{font-size:6px}}
      @media(max-width:720px){.arqc-header{height:auto;min-height:68px;flex-wrap:wrap;padding:10px}.arqc-mobile{display:block;background:none;border:0;color:white}.arqc-search{order:5;flex-basis:100%;width:100%}.arqc-account{margin-left:auto;min-width:0}.arqc-account div:last-child{display:none}.arqc-body{position:relative;min-height:calc(100vh - 120px)}.arqc-side{display:none;position:absolute;inset:0 auto 0 0;z-index:20;width:min(255px,85vw);box-shadow:8px 0 24px #0004}.arqc-side.open{display:flex}.arqc-main{padding:18px 13px}.arqc-title h1{font-size:27px}.arqc-grid{grid-template-columns:minmax(0,1fr)}.arqc-filters{overflow-x:auto;flex-wrap:nowrap}.arqc-filter{white-space:nowrap}.arqc-button{width:100%}}
    `}</style>
    <header className="arqc-header"><button className="arqc-mobile" onClick={()=>setMobileNav(v=>!v)} aria-label="Alternar menu" aria-expanded={mobileNav}><Menu/></button>
      <div className="arqc-logo"><img src="/brand/arqdor-logo.png" alt="ARQDOR"/><div><b>ARQDOR</b><small>IDEIAS • PROJETOS • ORÇAMENTOS • NEGÓCIOS</small></div></div>
      <input className="arqc-search" placeholder="Buscar meus projetos..." aria-label="Buscar meus projetos" value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="arqc-account"><div className="arqc-avatar">{props.clientName.trim().slice(0,2).toUpperCase()||"CL"}</div><div>{props.clientName}<small style={{display:"block"}}>Cliente</small></div></div>
    </header>
    <div className="arqc-body"><nav className={"arqc-side"+(mobileNav?" open":"")} aria-label="Ambientes do cliente">
      {nav.map(([key,label],index)=><button key={key} className={"arqc-nav"+(index===0?" on":"")} onClick={()=>navigate(key)}>{label}</button>)}
    </nav><main className="arqc-main">
      <div className="arqc-title"><div><h1>Meus projetos</h1><p>Acompanhe suas ideias, orçamentos, cotações e contratações em um só lugar.</p></div>
        {props.canCreateProject&&props.onNewProject?<button className="arqc-button" onClick={props.onNewProject}>＋ Novo projeto</button>:null}</div>
      <div className="arqc-content"><section className="arqc-projects">
        <div className="arqc-filters">{filters.map(f=><button key={f} className={"arqc-filter"+(filter===f?" on":"")} onClick={()=>setFilter(f)}>{f} <span>{f==="Todos"?projects.length:projects.filter(p=>p.status===f).length}</span></button>)}
          <select aria-label="Ordenação" value={sort} onChange={e=>setSort(e.target.value as "recent"|"title")}><option value="recent">Mais recentes</option><option value="title">Nome</option></select></div>
        {filtered.length?<div className="arqc-grid">{filtered.map(p=><button key={p.id} className="arqc-card" onClick={()=>open(p.id)}>
          <div className="arqc-photo">{p.imageUrl?<img src={p.imageUrl} alt=""/>:null}<span className="arqc-status"><span style={{color:statusColor[p.status]}}>●</span> {p.status}</span></div>
          <div className="arqc-info"><strong>{p.title}</strong><p>{p.category||"Projeto"} {p.location?"· "+p.location:""}</p><p>{p.areaM2!=null?p.areaM2.toLocaleString("pt-BR")+" m²":"Área não informada"}</p><div className="arqc-track"><i style={{width:Math.max(0,Math.min(100,p.progress??0))+"%"}}/></div><p>{p.progress??0}% {p.updatedAt?" · Atualizado em "+new Date(p.updatedAt).toLocaleDateString("pt-BR"):""}</p></div>
        </button>)}</div>:<div style={{padding:35,textAlign:"center",background:"white",border:"1px solid #e1eaf0",borderRadius:9}}><FolderOpen size={28}/><p>{projects.length?"Nenhum projeto encontrado":"Nenhum projeto disponível para este acesso."}</p></div>}
      </section><aside className="arqc-aside"><div className="arqc-panel"><h2>Resumo geral</h2><div className="arqc-stats"><div><strong>{projects.length}</strong><small>Projetos</small></div><div><strong>{projects.filter(p=>p.status==="Aguardando cotações").length}</strong><small>Aguardando cotações</small></div><div><strong>{projects.filter(p=>p.status==="Em contratação").length}</strong><small>Em contratação</small></div></div></div>
      <div className="arqc-panel"><h2>Meu progresso</h2><div className="arqc-stats"><div><strong>{average}%</strong><small>Progresso médio</small></div><div><strong>{complete}</strong><small>Concluídos</small></div></div></div>
      <div className="arqc-panel"><h2>Atividade recente</h2>{props.recentActivity?.length?props.recentActivity.map(a=><p key={a.id} style={{fontSize:12}}>{a.title} <small>{a.when}</small></p>):<p style={{fontSize:12,color:"#657e99"}}>Sem atividade disponível.</p>}</div>
      <div className="arqc-panel"><h2>Meu próximo passo</h2>{next?<button className="arqc-filter" onClick={()=>open(next.id)}>{next.title} <ChevronRight size={14}/></button>:<p style={{fontSize:12}}>Nenhum projeto pendente.</p>}</div>
      </aside></div></main></div>
  </div>;
}
