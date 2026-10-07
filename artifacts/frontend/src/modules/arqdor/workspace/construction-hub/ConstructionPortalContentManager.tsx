import { useEffect, useState } from "react";

function authToken() { return localStorage.getItem("vendorai_token") ?? ""; }
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.error ?? `Erro ${response.status}`);
  return data as T;
}

export default function ConstructionPortalContentManager({ tenantId, obraId }: { tenantId: string; obraId: string }) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [doc, setDoc] = useState({ categoria: "documento", titulo: "", url: "", versao: "", publicadoCliente: true });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/tenants/${tenantId}/obras/${obraId}/portal`;

  async function load() {
    if (!tenantId || !obraId) return;
    const [docs, support] = await Promise.all([
      request<any>(`${base}/documents`),
      request<any>(`${base}/support`),
    ]);
    setDocuments(docs.documents ?? []);
    setTickets(support.tickets ?? []);
    setMessages(support.messages ?? []);
  }

  useEffect(() => { void load(); }, [tenantId, obraId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addDocument() {
    if (!doc.titulo.trim() || !doc.url.trim()) return;
    setBusy(true);
    try {
      await request(`${base}/documents`, { method: "POST", body: JSON.stringify(doc) });
      setDoc({ categoria: "documento", titulo: "", url: "", versao: "", publicadoCliente: true });
      await load();
    } finally { setBusy(false); }
  }

  async function toggleDocument(item: any) {
    await request(`${base}/documents/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ publicadoCliente: !item.publicado_cliente }),
    });
    await load();
  }

  async function updateTicket(ticketId: string, status: string) {
    await request(`${base}/support/${ticketId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  async function sendTeamMessage() {
    if (!message.trim()) return;
    await request(`${base}/messages`, { method: "POST", body: JSON.stringify({ mensagem: message }) });
    setMessage("");
    await load();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Biblioteca do cliente</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Projetos, contratos, manuais e anexos</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-[170px_1fr_1.2fr_100px_auto]">
          <select className="rounded-xl border px-3 py-2 text-sm" value={doc.categoria} onChange={(e) => setDoc({ ...doc, categoria: e.target.value })}>
            <option value="projeto">Projeto</option><option value="contrato">Contrato</option><option value="manual">Manual</option><option value="garantia">Garantia</option><option value="documento">Documento</option>
          </select>
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Título" value={doc.titulo} onChange={(e) => setDoc({ ...doc, titulo: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="URL do arquivo" value={doc.url} onChange={(e) => setDoc({ ...doc, url: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Versão" value={doc.versao} onChange={(e) => setDoc({ ...doc, versao: e.target.value })} />
          <button disabled={busy} onClick={addDocument} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Adicionar</button>
        </div>
        <div className="mt-4 divide-y overflow-hidden rounded-2xl border">
          {documents.length ? documents.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div><p className="text-sm font-semibold text-slate-800">{item.titulo}</p><p className="text-xs text-slate-400">{item.categoria}{item.versao ? ` · v${item.versao}` : ""}</p></div>
              <div className="flex gap-2"><a href={item.url} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-600">Abrir</a><button onClick={() => void toggleDocument(item)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${item.publicado_cliente ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.publicado_cliente ? "Publicado" : "Oculto"}</button></div>
            </div>
          )) : <p className="p-5 text-center text-sm text-slate-400">Nenhum arquivo adicionado.</p>}
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Relacionamento</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Tickets e chat do cliente</h3>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">Solicitações</p>
            {tickets.length ? tickets.map((ticket) => <div key={ticket.id} className="rounded-2xl border p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{ticket.assunto}</p><p className="text-xs text-slate-400">{ticket.cliente_nome ?? ticket.cliente_email ?? "Cliente"} · {ticket.prioridade}</p></div><select className="rounded-lg border px-2 py-1 text-xs" value={ticket.status} onChange={(e) => void updateTicket(ticket.id, e.target.value)}><option value="aberto">Aberto</option><option value="em_atendimento">Em atendimento</option><option value="aguardando_cliente">Aguardando cliente</option><option value="resolvido">Resolvido</option><option value="fechado">Fechado</option></select></div><p className="mt-2 text-sm text-slate-600">{ticket.descricao}</p></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-400">Nenhum ticket.</p>}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Chat</p>
            <div className="mt-2 max-h-72 space-y-2 overflow-auto rounded-2xl bg-slate-50 p-3">{messages.length ? messages.map((item) => <div key={item.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${item.autor_tipo === "equipe" ? "ml-auto bg-violet-600 text-white" : "bg-white text-slate-700"}`}><p>{item.mensagem}</p><p className="mt-1 text-[10px] opacity-60">{item.autor_nome ?? item.autor_tipo}</p></div>) : <p className="py-8 text-center text-sm text-slate-400">Nenhuma mensagem.</p>}</div>
            <div className="mt-2 flex gap-2"><input className="flex-1 rounded-xl border px-3 py-2 text-sm" placeholder="Responder ao cliente..." value={message} onChange={(e) => setMessage(e.target.value)} /><button onClick={sendTeamMessage} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Enviar</button></div>
          </div>
        </div>
      </section>
    </div>
  );
}
