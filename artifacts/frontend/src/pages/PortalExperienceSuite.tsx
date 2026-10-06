import { useMemo, useState } from "react";
import { Bot, CalendarDays, CheckCircle2, Clock, FileText, Send, ShieldCheck } from "lucide-react";

export type PortalPublishedItem = {
  id: string;
  kind: string;
  title: string;
  description?: string | null;
  content?: any;
  visibility?: string;
  version?: string | null;
  due_at?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  requires_action?: boolean;
  action_type?: string | null;
  allow_download?: boolean;
  sort_order?: number;
  published_at?: string | null;
  created_at?: string | null;
};

export type PortalItemResponse = {
  id: string;
  item_id: string;
  action: string;
  comment?: string | null;
  payload?: any;
  created_at?: string | null;
};

function dt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function money(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : String(value);
}

function ActionPanel({
  token,
  sessionToken,
  item,
  response,
  onRefresh,
}: {
  token: string;
  sessionToken: string;
  item: PortalPublishedItem;
  response?: PortalItemResponse;
  onRefresh: () => void;
}) {
  const [comment, setComment] = useState("");
  const [form, setForm] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fields = Array.isArray(item.content?.fields) ? item.content.fields : [];

  if (response) {
    return <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Resposta registrada</div>
      <p className="mt-1 text-xs">{response.action}{response.comment ? ` · ${response.comment}` : ""}{response.created_at ? ` · ${dt(response.created_at)}` : ""}</p>
    </div>;
  }

  async function respond(action: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/portal/obra/${token}/items/${item.id}/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({ action, comment, payload: form }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Não foi possível registrar sua resposta.");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar sua resposta.");
    } finally { setBusy(false); }
  }

  return <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
    {fields.length > 0 ? <div className="mb-4 grid gap-3 md:grid-cols-2">
      {fields.map((field: any, index: number) => {
        const key = String(field.key ?? `field_${index}`);
        const label = String(field.label ?? field.title ?? key);
        if (field.type === "select" && Array.isArray(field.options)) {
          return <label key={key} className="text-xs font-medium text-gray-600">{label}
            <select className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
              <option value="">Selecione</option>{field.options.map((o: any) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
            </select>
          </label>;
        }
        return <label key={key} className="text-xs font-medium text-gray-600">{label}
          <input className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" type={field.type === "date" ? "date" : "text"} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        </label>;
      })}
    </div> : null}
    <textarea className="w-full rounded-lg border bg-white px-3 py-2 text-sm" rows={2} placeholder="Comentário (opcional)" value={comment} onChange={(e) => setComment(e.target.value)} />
    {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      {item.kind === "briefing" ? <button disabled={busy} onClick={() => respond("briefing_submitted")} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Enviar briefing</button> : null}
      {["agenda"].includes(item.kind) ? <button disabled={busy} onClick={() => respond("confirmed")} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Confirmar</button> : null}
      {["assinatura","aceite","entrega"].includes(item.kind) ? <button disabled={busy} onClick={() => respond("accepted")} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Registrar aceite</button> : null}
      {["aditivo","alteracao"].includes(item.kind) ? <>
        <button disabled={busy} onClick={() => respond("approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Aprovar</button>
        <button disabled={busy} onClick={() => respond("rejected")} className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 disabled:opacity-50">Solicitar revisão</button>
      </> : null}
      {!["briefing","agenda","assinatura","aceite","entrega","aditivo","alteracao"].includes(item.kind) ? <button disabled={busy} onClick={() => respond("acknowledged")} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Marcar como visto</button> : null}
    </div>
  </div>;
}

export function PortalItemsSection({
  token,
  sessionToken,
  items,
  responses,
  kinds,
  emptyText,
  onRefresh,
}: {
  token: string;
  sessionToken: string;
  items: PortalPublishedItem[];
  responses: PortalItemResponse[];
  kinds: string[];
  emptyText: string;
  onRefresh: () => void;
}) {
  const filtered = useMemo(() => items.filter((item) => kinds.includes(item.kind)), [items, kinds]);
  if (!filtered.length) return <div className="rounded-2xl border border-dashed bg-gray-50 py-10 text-center text-sm text-gray-400">{emptyText}</div>;

  return <div className="space-y-3">{filtered.map((item) => {
    const response = responses.find((r) => r.item_id === item.id);
    const files = Array.isArray(item.content?.files) ? item.content.files : [];
    const amount = money(item.content?.amount ?? item.content?.value);
    const scheduleImpact = item.content?.scheduleImpactDays ?? item.content?.schedule_impact_days;
    return <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
            {item.version ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">v{item.version}</span> : null}
            {item.requires_action && !response ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Ação necessária</span> : null}
          </div>
          {item.description ? <p className="mt-1 text-sm leading-6 text-gray-600">{item.description}</p> : null}
        </div>
        <div className="text-right text-xs text-gray-400">
          {item.due_at ? <p className="flex items-center gap-1"><Clock className="h-3 w-3" />Até {dt(item.due_at)}</p> : null}
          {item.starts_at ? <p className="mt-1 flex items-center gap-1"><CalendarDays className="h-3 w-3" />{dt(item.starts_at)}</p> : null}
        </div>
      </div>

      {(amount || scheduleImpact != null || item.content?.status || item.content?.nextAction) ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {amount ? <div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] uppercase text-gray-400">Valor</p><p className="text-sm font-semibold text-gray-800">{amount}</p></div> : null}
        {scheduleImpact != null ? <div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] uppercase text-gray-400">Impacto no prazo</p><p className="text-sm font-semibold text-gray-800">{Number(scheduleImpact)} dia(s)</p></div> : null}
        {item.content?.status ? <div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] uppercase text-gray-400">Status</p><p className="text-sm font-semibold text-gray-800">{String(item.content.status)}</p></div> : null}
        {item.content?.nextAction ? <div className="rounded-xl bg-gray-50 p-3"><p className="text-[10px] uppercase text-gray-400">Próxima ação</p><p className="text-sm font-semibold text-gray-800">{String(item.content.nextAction)}</p></div> : null}
      </div> : null}

      {item.content?.body ? <div className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">{String(item.content.body)}</div> : null}

      {files.length ? <div className="mt-4 flex flex-wrap gap-2">{files.map((file: any, index: number) => {
        const href = String(file.url ?? "");
        if (!href) return null;
        return <a key={href + index} href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"><FileText className="h-3.5 w-3.5" />{String(file.name ?? file.title ?? `Arquivo ${index + 1}`)}</a>;
      })}</div> : null}

      {item.requires_action ? <ActionPanel token={token} sessionToken={sessionToken} item={item} response={response} onRefresh={onRefresh} /> : null}
    </article>;
  })}</div>;
}

export function PortalTimeline({ items }: { items: PortalPublishedItem[] }) {
  const timeline = items
    .filter((item) => ["timeline","notificacao","agenda","entrega","aditivo","alteracao"].includes(item.kind))
    .slice()
    .sort((a,b) => String(b.starts_at ?? b.published_at ?? b.created_at ?? "").localeCompare(String(a.starts_at ?? a.published_at ?? a.created_at ?? "")));
  if (!timeline.length) return <div className="rounded-2xl border border-dashed bg-gray-50 py-10 text-center text-sm text-gray-400">Nenhum evento publicado na linha do tempo.</div>;
  return <div className="relative space-y-0 border-l-2 border-indigo-100 pl-6">{timeline.map((item) => <div key={item.id} className="relative pb-6">
    <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-indigo-600 bg-white" />
    <p className="text-xs font-medium text-indigo-600">{dt(item.starts_at ?? item.published_at ?? item.created_at) ?? "Atualização"}</p>
    <h3 className="mt-1 text-sm font-semibold text-gray-900">{item.title}</h3>
    {item.description ? <p className="mt-1 text-sm text-gray-600">{item.description}</p> : null}
  </div>)}</div>;
}

export function PortalVendi({
  token,
  sessionToken,
}: {
  token: string;
  sessionToken: string;
}) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Array<{ q: string; a: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask() {
    if (!question.trim() || busy) return;
    const q = question.trim();
    setQuestion(""); setBusy(true); setError("");
    try {
      const r = await fetch(`/api/portal/obra/${token}/vendi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({ question: q }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Não foi possível consultar o Vendi.");
      setHistory((current) => [...current, { q, a: String(body.answer ?? "") }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível consultar o Vendi.");
      setQuestion(q);
    } finally { setBusy(false); }
  }

  return <div className="rounded-2xl border bg-white p-5">
    <div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-indigo-600 p-2 text-white"><Bot className="h-5 w-5" /></div><div><h3 className="font-semibold text-gray-900">Vendi</h3><p className="text-xs text-gray-500">Responde somente com informações publicadas neste portal.</p></div></div>
    <div className="mb-4 max-h-[420px] space-y-3 overflow-auto rounded-xl bg-gray-50 p-3">
      {!history.length ? <div className="py-8 text-center text-sm text-gray-400"><ShieldCheck className="mx-auto mb-2 h-6 w-6" />Pergunte sobre etapas, documentos, agenda, pendências ou informações publicadas da obra.</div> : history.map((item, index) => <div key={index} className="space-y-2">
        <div className="ml-auto max-w-[85%] rounded-2xl bg-indigo-600 px-3 py-2 text-sm text-white">{item.q}</div>
        <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl bg-white px-3 py-2 text-sm leading-6 text-gray-700 shadow-sm">{item.a}</div>
      </div>)}
    </div>
    {error ? <p className="mb-2 text-xs font-medium text-rose-600">{error}</p> : null}
    <div className="flex gap-2"><input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void ask(); }} placeholder="Pergunte ao Vendi..." className="flex-1 rounded-xl border px-3 py-2.5 text-sm" /><button disabled={busy} onClick={() => void ask()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />{busy ? "..." : "Enviar"}</button></div>
  </div>;
}
