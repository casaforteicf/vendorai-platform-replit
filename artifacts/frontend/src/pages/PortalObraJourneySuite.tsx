import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Search, Sparkles } from "lucide-react";

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(String(value).includes("T") ? String(value) : String(value) + "T12:00:00");
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function PortalBriefing({ briefing }: { briefing: any }) {
  if (!briefing) return <Empty text="Nenhum briefing publicado para este cliente." />;
  const groups = [
    ["Situação", briefing.situation_answers],
    ["Problemas", briefing.problem_answers],
    ["Implicações", briefing.implication_answers],
    ["Necessidades", briefing.need_answers],
  ] as const;
  return <div className="space-y-5">
    {briefing.ai_summary?.resumoCliente ? <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Resumo do briefing</p><p className="mt-2 text-sm leading-6 text-indigo-950">{briefing.ai_summary.resumoCliente}</p></div> : null}
    {groups.map(([title, rows]) => Array.isArray(rows) && rows.length ? <section key={title} className="overflow-hidden rounded-2xl border bg-white"><div className="bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800">{title}</div><div className="divide-y">{rows.map((row: any, index: number) => <div key={index} className="p-4"><p className="text-xs font-medium text-gray-500">{row.question}</p><p className="mt-1 text-sm text-gray-800">{row.answer || "—"}</p></div>)}</div></section> : null)}
    {briefing.free_notes ? <div className="rounded-2xl border bg-white p-5"><p className="text-sm font-semibold text-gray-800">Observações</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{briefing.free_notes}</p></div> : null}
    <p className="text-xs text-gray-400">Última atualização: {fmtDate(briefing.updated_at)}</p>
  </div>;
}

export function PortalAgenda({ agenda }: { agenda: any[] }) {
  if (!agenda?.length) return <Empty text="Nenhum compromisso publicado para este cliente." />;
  return <div className="space-y-3">{agenda.map((item) => <div key={item.id} className="rounded-2xl border bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">{item.titulo}</p><p className="mt-1 text-xs text-gray-500">{fmtDate(item.data_hora_inicio)} → {fmtDate(item.data_hora_fim)}</p>{item.local ? <p className="mt-1 text-xs text-gray-500">{item.local}</p> : null}</div><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">{item.status}</span></div>{item.observacoes ? <p className="mt-3 text-sm text-gray-600">{item.observacoes}</p> : null}{item.meet_link ? <a href={item.meet_link} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold text-indigo-600">Abrir reunião</a> : null}</div>)}</div>;
}

export function PortalNextActions({ actions, onNavigate }: { actions: any[]; onNavigate?: (tab: string) => void }) {
  if (!actions?.length) return null;
  return <div className="mb-8 rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center gap-2"><Sparkles className="h-5 w-5 text-indigo-600" /><h2 className="font-semibold text-gray-900">O que precisa da sua atenção</h2></div><div className="grid gap-3 md:grid-cols-2">{actions.slice(0, 6).map((item, index) => <button key={item.id ?? index} type="button" onClick={() => item.tab && onNavigate?.(item.tab)} className="rounded-xl border border-gray-200 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{item.kind ?? "Próxima ação"}</p><p className="mt-1 text-sm font-semibold text-gray-900">{item.title}</p>{item.detail ? <p className="mt-1 text-xs text-gray-500">{item.detail}</p> : null}</button>)}</div></div>;
}

export function PortalSearch({ data, onNavigate }: { data: any; onNavigate?: (tab: string) => void }) {
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const all: Array<{title:string; detail:string; tab:string}> = [];
    (data?.projectDocuments ?? []).forEach((x:any)=>all.push({title:x.titulo ?? "Documento",detail:x.categoria ?? "Documento",tab:"documentos"}));
    (data?.contracts ?? []).forEach((x:any)=>all.push({title:x.titulo ?? "Contrato",detail:"Contrato",tab:"contratos"}));
    (data?.manuals ?? []).forEach((x:any)=>all.push({title:x.titulo ?? "Manual",detail:"Manual/Garantia",tab:"manuais"}));
    (data?.etapas ?? []).forEach((x:any)=>all.push({title:x.nome,detail:"Etapa da obra",tab:"cronograma"}));
    (data?.agenda ?? []).forEach((x:any)=>all.push({title:x.titulo,detail:"Agenda",tab:"agenda"}));
    const proposal = data?.commercial?.proposal;
    if (proposal) all.push({title:proposal.title ?? "Proposta",detail:"Proposta comercial",tab:"propostas"});
    const needle = q.trim().toLowerCase();
    return needle ? all.filter(x => (x.title+" "+x.detail).toLowerCase().includes(needle)).slice(0, 20) : [];
  }, [q, data]);
  return <div className="relative"><div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2"><Search className="h-4 w-4 text-gray-400" /><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Buscar projeto, contrato, etapa, documento..." className="w-full bg-transparent text-sm outline-none" /></div>{q ? <div className="absolute left-0 right-0 z-20 mt-2 max-h-80 overflow-auto rounded-2xl border bg-white p-2 shadow-xl">{items.length ? items.map((item,index)=><button key={index} type="button" onClick={()=>{onNavigate?.(item.tab);setQ("");}} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-gray-50"><p className="text-sm font-medium text-gray-800">{item.title}</p><p className="text-xs text-gray-400">{item.detail}</p></button>) : <p className="p-4 text-center text-sm text-gray-400">Nenhum resultado.</p>}</div> : null}</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed bg-gray-50 py-10 text-center text-sm text-gray-400">{text}</div>;
}
