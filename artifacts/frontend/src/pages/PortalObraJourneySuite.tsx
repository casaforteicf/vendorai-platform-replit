import { useMemo, useState } from "react";
import { Bot, CheckCircle2, FileText, Search, Sparkles } from "lucide-react";

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

export function PortalPostSale({
  token,
  sessionToken,
  postSale,
  onRefresh,
}: {
  token: string;
  sessionToken: string;
  postSale: any;
  onRefresh: () => void;
}) {
  const [accepting, setAccepting] = useState("");
  const [nps, setNps] = useState<number>(10);
  const [score, setScore] = useState<number>(5);
  const [comment, setComment] = useState("");
  const [busySurvey, setBusySurvey] = useState(false);
  const [error, setError] = useState("");

  if (!postSale?.delivery) return <Empty text="A entrega e o pós-venda ainda não foram iniciados para este projeto." />;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;

  async function acceptTerm(termId: string) {
    setAccepting(termId); setError("");
    try {
      const r = await fetch(`/api/portal/obra/${token}/post-sale/terms/${termId}/accept`, { method: "POST", headers });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Não foi possível aceitar o termo.");
      onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao aceitar o termo."); }
    finally { setAccepting(""); }
  }

  async function submitSurvey() {
    setBusySurvey(true); setError("");
    try {
      const r = await fetch(`/api/portal/obra/${token}/post-sale/satisfaction`, {
        method: "POST", headers, body: JSON.stringify({ nps, satisfactionScore: score, comment }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Não foi possível enviar sua avaliação.");
      onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao enviar avaliação."); }
    finally { setBusySurvey(false); }
  }

  const checklist = postSale.checklist ?? [];
  const completed = checklist.filter((item: any) => item.done).length;
  const terms = postSale.terms ?? [];
  const docs = postSale.documents ?? [];
  const survey = postSale.survey ?? null;

  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label="Status da entrega" value={String(postSale.delivery.status ?? "Em andamento")} />
      <Metric label="Checklist" value={`${completed}/${checklist.length} concluídos`} />
      <Metric label="Data de entrega" value={postSale.delivery.delivery_date ? new Date(postSale.delivery.delivery_date+"T12:00:00").toLocaleDateString("pt-BR") : "A definir"} />
    </div>

    {checklist.length ? <div className="rounded-2xl border bg-white p-5"><p className="mb-3 text-sm font-semibold text-gray-900">Checklist de entrega</p><div className="space-y-2">{checklist.map((item: any) => <div key={item.id} className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-3"><CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${item.done ? "text-emerald-600" : "text-gray-300"}`} /><div><p className="text-sm font-medium text-gray-800">{item.label}</p>{item.notes ? <p className="mt-1 text-xs text-gray-500">{item.notes}</p> : null}</div></div>)}</div></div> : null}

    {terms.length ? <div className="rounded-2xl border bg-white p-5"><p className="mb-3 text-sm font-semibold text-gray-900">Termos e aceite</p><div className="space-y-3">{terms.map((term: any) => <div key={term.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">{term.title}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{term.content}</p></div>{term.accepted ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Aceito {term.accepted_at ? "em "+new Date(term.accepted_at).toLocaleDateString("pt-BR") : ""}</span> : <button disabled={accepting===term.id} onClick={()=>acceptTerm(term.id)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{accepting===term.id ? "Registrando..." : "Aceitar digitalmente"}</button>}</div></div>)}</div></div> : null}

    {docs.length ? <div className="rounded-2xl border bg-white p-5"><p className="mb-3 text-sm font-semibold text-gray-900">Dossiê final e garantias</p><div className="divide-y">{docs.map((doc:any)=><a key={doc.id} href={doc.file_url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3"><FileText className="h-4 w-4 shrink-0 text-indigo-500"/><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{doc.title}</p><p className="text-xs text-gray-400">{doc.type}</p></div></div><span className="text-xs font-semibold text-indigo-600">Abrir</span></a>)}</div></div> : null}

    <div className="rounded-2xl border bg-white p-5">
      <p className="text-sm font-semibold text-gray-900">Satisfação</p>
      {survey?.status === "answered" ? <div className="mt-3 rounded-xl bg-emerald-50 p-4"><p className="text-sm font-medium text-emerald-800">Obrigado pela avaliação.</p><p className="mt-1 text-xs text-emerald-700">NPS {survey.nps}/10 · satisfação {survey.satisfaction_score}/5</p></div> : <div className="mt-4 space-y-4"><div><label className="text-xs font-medium text-gray-500">De 0 a 10, quanto recomendaria nossa empresa?</label><input type="range" min={0} max={10} value={nps} onChange={(e)=>setNps(Number(e.target.value))} className="mt-2 w-full"/><p className="text-right text-sm font-semibold">{nps}/10</p></div><div><label className="text-xs font-medium text-gray-500">Satisfação geral</label><select value={score} onChange={(e)=>setScore(Number(e.target.value))} className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"><option value={5}>5 — Excelente</option><option value={4}>4 — Muito bom</option><option value={3}>3 — Bom</option><option value={2}>2 — Regular</option><option value={1}>1 — Ruim</option></select></div><textarea value={comment} onChange={(e)=>setComment(e.target.value)} rows={3} placeholder="Comentário opcional" className="w-full rounded-xl border px-3 py-2 text-sm"/><button disabled={busySurvey} onClick={submitSurvey} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busySurvey ? "Enviando..." : "Enviar avaliação"}</button></div>}
    </div>
    {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
  </div>;
}

export function PortalVendi({ data, onNavigate }: { data: any; onNavigate?: (tab: string) => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("Posso explicar o andamento, próxima etapa, agenda, orçamento, documentos, proposta, entrega e pendências publicadas neste portal.");

  function ask() {
    const q = question.trim().toLowerCase();
    if (!q) return;
    const resumo = data?.resumo;
    const agenda = data?.agenda ?? [];
    const nextEvent = agenda.find((x:any)=>new Date(x.data_hora_inicio).getTime() >= Date.now());
    if (/etapa|andamento|progresso|obra/.test(q)) {
      setAnswer(`O progresso publicado é de ${Math.round(Number(resumo?.progressoGeral ?? 0))}%. ${resumo?.etapaAtual?.nome ? "A etapa atual é "+resumo.etapaAtual.nome+"." : ""} ${resumo?.proximasEtapas?.[0]?.nome ? "A próxima etapa é "+resumo.proximasEtapas[0].nome+"." : ""}`);
    } else if (/agenda|visita|reuni|quando|próximo evento/.test(q)) {
      setAnswer(nextEvent ? `Seu próximo compromisso publicado é “${nextEvent.titulo}”, em ${fmtDate(nextEvent.data_hora_inicio)}${nextEvent.local ? ", no local "+nextEvent.local : ""}.` : "Não há compromisso futuro publicado no portal.");
    } else if (/pend|aprova|decis/.test(q)) {
      const d = data?.decisions ?? [];
      setAnswer(d.length ? `Há ${d.length} decisão(ões) aguardando você. A mais urgente é “${d[0].title}”.` : "Não há decisões pendentes publicadas para você.");
    } else if (/orçamento|orcamento|valor|preço|preco/.test(q)) {
      const o = data?.orcamento;
      setAnswer(o ? `Existe um orçamento versão ${o.versao}, com status “${o.status}”. Abra a aba Orçamento para ver apenas os valores autorizados para este portal.` : "Nenhum orçamento está publicado para este portal.");
      onNavigate?.("orcamento");
    } else if (/proposta/.test(q)) {
      const p = data?.commercial?.proposal;
      setAnswer(p ? `A proposta publicada é “${p.title}”, versão ${p.version}, status “${p.status}”.` : "Nenhuma proposta comercial está publicada.");
      onNavigate?.("propostas");
    } else if (/contrato/.test(q)) {
      setAnswer(`Há ${(data?.contracts ?? []).length} contrato(s)/termo(s) publicado(s) para você.`);
      onNavigate?.("contratos");
    } else if (/document|projeto|arquivo|planta/.test(q)) {
      setAnswer(`Há ${(data?.projectDocuments ?? []).length} arquivo(s) técnico(s) publicado(s). Use a busca ou a aba Projetos/Anexos.`);
      onNavigate?.("projetos");
    } else if (/entrega|garantia|pós|pos-venda|aceite/.test(q)) {
      const ps = data?.postSale;
      setAnswer(ps?.delivery ? `O pós-venda está com status “${ps.delivery.status}”. O checklist tem ${(ps.checklist ?? []).filter((x:any)=>x.done).length} de ${(ps.checklist ?? []).length} itens concluídos.` : "A etapa de entrega/pós-venda ainda não foi iniciada.");
      onNavigate?.("entrega");
    } else {
      setAnswer("Só respondo com informações autorizadas deste portal. Tente perguntar sobre andamento, próxima etapa, agenda, orçamento, proposta, contratos, documentos, entrega ou pendências.");
    }
    setQuestion("");
  }

  return <div className="rounded-2xl border border-indigo-100 bg-white p-5"><div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-600 p-2 text-white"><Bot className="h-5 w-5"/></div><div><p className="text-sm font-semibold text-gray-900">Vendi</p><p className="text-xs text-gray-500">Assistente do seu projeto — vê somente o que foi publicado para você.</p></div></div><div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">{answer}</div><div className="mt-3 flex gap-2"><input value={question} onChange={(e)=>setQuestion(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter") ask();}} placeholder="Ex.: qual é a próxima etapa?" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"/><button onClick={ask} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Perguntar</button></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-sm font-semibold text-gray-900">{value}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed bg-gray-50 py-10 text-center text-sm text-gray-400">{text}</div>;
}
