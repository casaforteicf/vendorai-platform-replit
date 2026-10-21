import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, ArrowRight, FolderOpen, Loader2, Plus, Sparkles } from "lucide-react";

type Project = { id: string; title: string; kind: string; brief: string; status: string; updatedAt: string };
type Kind = "web_app" | "mobile_app" | "website" | "book" | "ebook" | "course" | "agent" | "design" | "media";
const choices: Array<{ kind: Kind; label: string; description: string }> = [
  {kind:"web_app",label:"Aplicativo",description:"Web app ou SaaS"},
  {kind:"mobile_app",label:"App mobile",description:"Android e iOS"},
  {kind:"website",label:"Site",description:"Presença digital"},
  {kind:"book",label:"Livro",description:"Projeto editorial"},
  {kind:"ebook",label:"E-book",description:"Publicação digital"},
  {kind:"course",label:"Curso",description:"Educação online"},
  {kind:"agent",label:"Agente IA",description:"Assistentes e automações"},
  {kind:"design",label:"Design",description:"Identidade e materiais"},
  {kind:"media",label:"Mídia",description:"Vídeo e áudio"},
];
async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api" + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) throw new Error(response.status === 401 ? "Sessão expirada. Entre novamente." : response.status === 403 ? "Sem permissão para este projeto." : response.status === 404 ? "Projeto não encontrado." : `Não foi possível completar a operação (HTTP ${response.status}).`);
  return response.json() as Promise<T>;
}
const kindLabel = (kind: string) => choices.find(x => x.kind === kind)?.label ?? kind;
export default function VendiStudio() {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/vendi-studio/projects/:id");
  const projectId = params?.id;
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<Kind>("web_app");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) { setLoading(false); setError("Faça login para acessar os projetos."); return; }
    let live = true;
    setLoading(true); setError("");
    const url = projectId ? `/vendi-studio/projects/${encodeURIComponent(projectId)}` : "/vendi-studio/projects";
    api<{ project: Project; projects: Project[] }>(url, token)
      .then(data => { if (live) { if (projectId) setCurrent(data.project); else setProjects(data.projects ?? []); } })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : "Falha ao carregar."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [token, projectId]);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!token || !title.trim() || creating) return;
    setCreating(true); setError("");
    try {
      const { project } = await api<{project: Project}>("/vendi-studio/projects", token, {
        method: "POST", body: JSON.stringify({ title: title.trim(), kind, brief: brief.trim() }),
      });
      navigate(`/vendi-studio/projects/${encodeURIComponent(project.id)}`);
    } catch(e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o projeto."); }
    finally { setCreating(false); }
  }
  return <div className="min-h-screen bg-[#0e1114] text-zinc-100">
    <div className="mx-auto max-w-6xl px-5 py-7">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div><p className="text-xs uppercase tracking-[.22em] text-emerald-400">Vendor.ai</p><h1 className="text-2xl font-semibold">Vendi Studio</h1><p className="text-sm text-zinc-400">Crie, desenvolva e evolua seus projetos.</p></div>
        <button type="button" onClick={() => navigate("/tad")} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Voltar ao Início</button>
      </header>
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm">{error}</div>}
      {projectId ? <>
        <button type="button" onClick={() => navigate("/vendi-studio")} className="mb-5 flex items-center gap-2 text-sm text-zinc-300"><ArrowLeft size={16}/> Meus projetos</button>
        {loading ? <p role="status">Carregando projeto...</p> : current ? <section className="rounded-2xl border border-white/10 bg-white/5 p-7">
          <span className="text-xs uppercase text-emerald-400">{kindLabel(current.kind)} · {current.status}</span>
          <h2 className="mt-2 text-2xl font-semibold">{current.title}</h2>
          <p className="mt-4 whitespace-pre-wrap text-sm text-zinc-300">{current.brief || "Nenhum briefing informado."}</p>
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">Projeto salvo. O editor visual, os agentes e a publicação estão em implantação; nenhuma execução automática foi iniciada.</div>
        </section> : null}
      </> : <>
        <section className="mb-10 rounded-3xl border border-white/10 bg-gradient-to-br from-[#18251d] to-[#12151a] p-6 sm:p-9">
          <div className="mb-3 flex items-center gap-2 text-emerald-400"><Sparkles size={18}/> Criador de aplicativos com IA</div>
          <h2 className="mb-2 text-3xl font-semibold">O que vamos criar hoje?</h2>
          <p className="mb-6 text-sm text-zinc-400">Comece seu aplicativo, site, livro ou produto digital. O briefing será salvo no seu projeto.</p>
          <form onSubmit={create} className="space-y-4">
            <label className="block text-sm">Nome do projeto<input aria-label="Nome do projeto" required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Aplicativo de reservas do hotel" className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 outline-none focus:border-emerald-400"/></label>
            <label className="block text-sm">Descreva sua ideia<textarea aria-label="Descreva sua ideia" maxLength={20000} rows={3} value={brief} onChange={e=>setBrief(e.target.value)} placeholder="Quero um aplicativo que..." className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-black/30 px-4 py-3 outline-none focus:border-emerald-400"/></label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {choices.map(choice => <button key={choice.kind} type="button" aria-pressed={kind===choice.kind} onClick={()=>setKind(choice.kind)} className={`rounded-xl border p-3 text-left transition ${kind===choice.kind?"border-emerald-400 bg-emerald-500/10":"border-white/10 bg-white/5 hover:bg-white/10"}`}><span className="block text-sm font-medium">{choice.label}</span><span className="text-xs text-zinc-400">{choice.description}</span></button>)}
            </div>
            <button type="submit" disabled={creating || !title.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-black disabled:opacity-40">{creating?<Loader2 size={17} className="animate-spin"/>:<Plus size={17}/>} {creating?"Salvando...":"Criar projeto"} <ArrowRight size={17}/></button>
          </form>
        </section>
        <section><h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><FolderOpen size={20}/> Continue de onde parou</h2>
          {loading ? <p role="status">Carregando projetos...</p> : projects.length===0 ? <div className="rounded-xl border border-white/10 p-6 text-sm text-zinc-400">Nenhum projeto ainda. Crie o primeiro acima.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{projects.map(p=><button key={p.id} type="button" onClick={()=>navigate(`/vendi-studio/projects/${encodeURIComponent(p.id)}`)} className="rounded-xl border border-white/10 bg-white/5 p-5 text-left hover:border-emerald-500/50"><span className="text-xs text-emerald-400">{kindLabel(p.kind)} · {p.status}</span><h3 className="mt-2 font-semibold">{p.title}</h3><p className="mt-2 text-xs text-zinc-400">Atualizado em {new Date(p.updatedAt).toLocaleDateString("pt-BR")}</p><span className="mt-4 flex items-center gap-2 text-sm">Continuar <ArrowRight size={15}/></span></button>)}</div>}
        </section>
        <p className="mt-10 text-xs text-zinc-500">Funções como importar GitHub, anexos, voz, templates e publicação estarão disponíveis após conexão real e testes. Nenhum botão simulado.</p>
      </>}
    </div>
  </div>;
}
