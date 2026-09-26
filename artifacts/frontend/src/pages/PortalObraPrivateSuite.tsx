import { useState } from "react";
import { CircleDollarSign, FileText, Headphones, MessageCircle, ShieldCheck, UserRound } from "lucide-react";

function money(value: any) {
  if (value == null || value === "") return "—";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function date(value: any) {
  if (!value) return "—";
  const raw = String(value);
  const d = new Date(raw.includes("T") ? raw : raw + "T12:00:00");
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("pt-BR");
}

export function portalSessionKey(token: string) {
  return `vendor_portal_client_session:${token}`;
}

export function PortalAuthGate({
  token,
  tenantName,
  obraName,
  allowRegistration,
  onAuthenticated,
}: {
  token: string;
  tenantName: string;
  obraName: string;
  allowRegistration: boolean;
  onAuthenticated: (sessionToken: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ nome: "", email: "", telefone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/portal/obra/${token}/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível acessar o portal.");
      localStorage.setItem(portalSessionKey(token), body.token);
      onAuthenticated(body.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao acessar o portal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-indigo-600 p-3 text-white"><ShieldCheck className="h-6 w-6" /></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-gray-400">Área privada do cliente</p><h1 className="text-xl font-semibold text-gray-900">{obraName}</h1><p className="text-sm text-gray-500">{tenantName}</p></div>
        </div>
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
          <button onClick={() => setMode("login")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === "login" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500"}`}>Entrar</button>
          <button disabled={!allowRegistration} onClick={() => setMode("register")} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40 ${mode === "register" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500"}`}>Criar conta</button>
        </div>
        <div className="space-y-3">
          {mode === "register" ? <><input className="w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /><input className="w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></> : null}
          <input type="email" className="w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input type="password" className="w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="Senha" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        {error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <button disabled={busy} onClick={submit} className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Aguarde..." : mode === "login" ? "Entrar no portal" : "Criar conta e entrar"}</button>
        {!allowRegistration ? <p className="mt-3 text-center text-xs text-gray-400">O cadastro é controlado pela empresa responsável pela obra.</p> : null}
      </div>
    </div>
  );
}

export function PortalExecutiveBalance({ balance }: { balance: any }) {
  if (!balance) return <Empty text="Balanço executivo não disponível." />;
  const delta = Number(balance.progressVariancePoints ?? 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric title="Planejado" value={`${Number(balance.plannedProgress ?? 0).toFixed(1)}%`} />
        <Metric title="Executado" value={`${Number(balance.actualProgress ?? 0).toFixed(1)}%`} />
        <Metric title="Desvio físico" value={`${delta >= 0 ? "+" : ""}${delta.toFixed(1)} p.p.`} danger={delta < -5} />
        <Metric title="Custo realizado" value={money(balance.actualCost)} />
      </div>
      <div className="overflow-x-auto rounded-2xl border">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400"><tr><th className="p-3">Etapa</th><th>Planejado</th><th>Executado</th><th>Desvio</th><th>Custo previsto</th><th>Período</th></tr></thead>
          <tbody>{(balance.stages ?? []).map((stage: any) => <tr key={stage.etapaId} className="border-t"><td className="p-3 font-medium text-gray-800">{stage.nome}</td><td>{Number(stage.plannedPercent).toFixed(0)}%</td><td>{Number(stage.actualPercent).toFixed(0)}%</td><td className={Number(stage.variancePoints) < -5 ? "font-semibold text-rose-600" : "text-emerald-700"}>{Number(stage.variancePoints) >= 0 ? "+" : ""}{Number(stage.variancePoints).toFixed(0)} p.p.</td><td>{money(stage.plannedCost)}</td><td>{date(stage.dataInicioPrevista)} → {date(stage.dataFimPrevista)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function PortalCommercial({ commercial }: { commercial: any }) {
  if (!commercial?.budget && !commercial?.proposal) return <Empty text="Nenhuma proposta ou orçamento comercial publicado ainda." />;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        {commercial.budget ? <Card icon={<CircleDollarSign className="h-5 w-5" />} title="Orçamento"><p className="text-lg font-semibold">{commercial.budget.title}</p><p className="mt-1 text-sm text-gray-500">Versão {commercial.budget.version} · {commercial.budget.status}</p><p className="mt-3 text-2xl font-bold text-gray-900">{money(commercial.budget.grand_total)}</p></Card> : null}
        {commercial.proposal ? <Card icon={<FileText className="h-5 w-5" />} title="Proposta"><p className="text-lg font-semibold">{commercial.proposal.title}</p><p className="mt-1 text-sm text-gray-500">Versão {commercial.proposal.version} · {commercial.proposal.status}</p><p className="mt-3 text-2xl font-bold text-gray-900">{money(commercial.proposal.grand_total)}</p>{commercial.proposal.expires_at ? <p className="mt-2 text-xs text-gray-400">Validade: {date(commercial.proposal.expires_at)}</p> : null}</Card> : null}
      </div>
      {commercial.proposalItems?.length ? <div className="overflow-hidden rounded-2xl border"><div className="bg-gray-50 px-4 py-3 text-xs font-semibold uppercase text-gray-400">Itens da proposta</div>{commercial.proposalItems.map((item: any) => <div key={item.id} className="flex items-center justify-between gap-3 border-t px-4 py-3"><div><p className="text-sm font-medium text-gray-800">{item.item}</p><p className="text-xs text-gray-400">{item.quantity} {item.unit} · {item.approval_status}</p></div><p className="text-sm font-semibold">{money(item.total)}</p></div>)}</div> : null}
    </div>
  );
}

export function PortalDocumentLibrary({ title, items }: { title: string; items: any[] }) {
  return items?.length ? <div className="divide-y overflow-hidden rounded-2xl border bg-white">{items.map((doc: any) => <a key={doc.id} href={doc.url ?? doc.documento_url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50"><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{doc.titulo ?? doc.descricao ?? doc.numero ?? title}</p><p className="text-xs text-gray-400">{doc.categoria ?? doc.fornecedor ?? ""}{doc.versao ? ` · v${doc.versao}` : ""}</p></div><span className="text-xs font-semibold text-indigo-600">Abrir</span></a>)}</div> : <Empty text={`Nenhum ${title.toLowerCase()} publicado ainda.`} />;
}

export function PortalSupportChat({ token, sessionToken, tickets, messages, onRefresh, mode = "both" }: { token: string; sessionToken: string; tickets: any[]; messages: any[]; onRefresh: () => void; mode?: "support" | "chat" | "both" }) {
  const [support, setSupport] = useState({ assunto: "", descricao: "", prioridade: "normal" });
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [sending, setSending] = useState(false);
  const auth = { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" };

  async function createTicket() {
    if (!support.assunto.trim() || !support.descricao.trim() || sending) return;
    setActionError(""); setSending(true);
    try {
      const r = await fetch(`/api/portal/obra/${token}/support`, { method: "POST", headers: auth, body: JSON.stringify(support) });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? "Não foi possível abrir o ticket.");
      }
      setSupport({ assunto: "", descricao: "", prioridade: "normal" }); onRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível abrir o ticket.");
    } finally { setSending(false); }
  }
  async function sendMessage() {
    if (!message.trim() || sending) return;
    setActionError(""); setSending(true);
    try {
      const r = await fetch(`/api/portal/obra/${token}/messages`, { method: "POST", headers: auth, body: JSON.stringify({ mensagem: message }) });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? "Não foi possível enviar a mensagem.");
      }
      setMessage(""); onRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
    } finally { setSending(false); }
  }

  return (
    <div className={`grid gap-6 ${mode === "both" ? "lg:grid-cols-2" : ""}`}>
      {actionError ? <div role="alert" className="lg:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{actionError}</div> : null}
      {mode !== "chat" ? <Card icon={<Headphones className="h-5 w-5" />} title="Solicitações de suporte">
        <div className="space-y-2"><input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Assunto" value={support.assunto} onChange={(e) => setSupport({ ...support, assunto: e.target.value })} /><textarea className="min-h-24 w-full rounded-xl border px-3 py-2 text-sm" placeholder="Descreva sua solicitação" value={support.descricao} onChange={(e) => setSupport({ ...support, descricao: e.target.value })} /><div className="flex gap-2"><select className="rounded-xl border px-3 py-2 text-sm" value={support.prioridade} onChange={(e) => setSupport({ ...support, prioridade: e.target.value })}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select><button type="button" onClick={createTicket} disabled={sending} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Abrir ticket</button></div></div>
        <div className="mt-4 space-y-2">{tickets?.map((ticket: any) => <div key={ticket.id} className="rounded-xl bg-gray-50 p-3"><div className="flex justify-between"><p className="text-sm font-semibold">{ticket.assunto}</p><span className="text-xs text-gray-500">{ticket.status}</span></div><p className="mt-1 text-xs text-gray-500">{ticket.prioridade} · {date(ticket.created_at)}</p></div>)}</div>
      </Card> : null}
      {mode !== "support" ? <Card icon={<MessageCircle className="h-5 w-5" />} title="Chat com a equipe">
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl bg-gray-50 p-3">{messages?.length ? messages.map((item: any) => <div key={item.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${item.autor_tipo === "cliente" ? "ml-auto bg-indigo-600 text-white" : "bg-white text-gray-700 shadow-sm"}`}><p>{item.mensagem}</p><p className={`mt-1 text-[10px] ${item.autor_tipo === "cliente" ? "text-indigo-200" : "text-gray-400"}`}>{item.autor_nome ?? (item.autor_tipo === "cliente" ? "Você" : "Equipe")} · {date(item.created_at)}</p></div>) : <p className="py-8 text-center text-sm text-gray-400">Nenhuma mensagem ainda.</p>}</div>
        <div className="mt-3 flex gap-2"><input className="flex-1 rounded-xl border px-3 py-2 text-sm" placeholder="Escreva uma mensagem..." value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }} /><button type="button" onClick={sendMessage} disabled={sending} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Enviar</button></div>
      </Card> : null}
    </div>
  );
}

function Metric({ title, value, danger }: { title: string; value: string; danger?: boolean }) {
  return <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-gray-500">{title}</p><p className={`mt-1 text-lg font-semibold ${danger ? "text-rose-600" : "text-gray-900"}`}>{value}</p></div>;
}
function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="rounded-2xl border bg-white p-5"><div className="mb-4 flex items-center gap-2 text-indigo-600">{icon}<h3 className="font-semibold text-gray-900">{title}</h3></div>{children}</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed bg-gray-50 py-10 text-center text-sm text-gray-400">{text}</div>;
}
