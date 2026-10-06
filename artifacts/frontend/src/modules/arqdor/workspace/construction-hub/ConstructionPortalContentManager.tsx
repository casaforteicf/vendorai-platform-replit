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
  const [items, setItems] = useState<any[]>([]);
  const [portalUsers, setPortalUsers] = useState<any[]>([]);
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [briefingQuestions, setBriefingQuestions] = useState("");
  const [item, setItem] = useState({
    kind: "briefing", title: "", description: "", visibility: "interno",
    version: "", dueAt: "", startsAt: "", endsAt: "", requiresAction: false,
    actionType: "", amount: "", scheduleImpactDays: "", nextAction: "", body: "",
  });
  const [tickets, setTickets] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [doc, setDoc] = useState({ categoria: "documento", titulo: "", url: "", versao: "", visibility: "interno", allowDownload: true });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/tenants/${tenantId}/obras/${obraId}/portal`;

  async function load() {
    if (!tenantId || !obraId) return;
    const [docs, support, publishedItems, users, budget] = await Promise.all([
      request<any>(`${base}/documents`),
      request<any>(`${base}/support`),
      request<any>(`${base}/items`),
      request<any>(`${base}/users`),
      request<any>(`${base}/budget-items`),
    ]);
    setDocuments(docs.documents ?? []);
    setItems(publishedItems.items ?? []);
    setPortalUsers(users.users ?? []);
    setBudgetItems(budget.items ?? []);
    setTickets(support.tickets ?? []);
    setMessages(support.messages ?? []);
  }

  useEffect(() => { void load(); }, [tenantId, obraId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addPortalItem() {
    if (!item.title.trim()) return;
    setBusy(true);
    try {
      const content: Record<string, any> = {};
      if (item.body.trim()) content.body = item.body.trim();
      if (item.amount !== "") content.amount = Number(item.amount);
      if (item.scheduleImpactDays !== "") content.scheduleImpactDays = Number(item.scheduleImpactDays);
      if (item.nextAction.trim()) content.nextAction = item.nextAction.trim();
      if (item.kind === "briefing" && briefingQuestions.trim()) {
        content.fields = briefingQuestions.split("\n").map((line) => line.trim()).filter(Boolean).map((label, index) => ({
          key: `q${index + 1}`,
          label,
          type: "text",
          required: true,
        }));
      }
      await request(`${base}/items`, {
        method: "POST",
        body: JSON.stringify({
          kind: item.kind, title: item.title, description: item.description || null,
          visibility: item.visibility, version: item.version || null,
          dueAt: item.dueAt || null, startsAt: item.startsAt || null, endsAt: item.endsAt || null,
          requiresAction: item.requiresAction, actionType: item.actionType || null, content,
        }),
      });
      setBriefingQuestions("");
      setItem({
        kind: "briefing", title: "", description: "", visibility: "interno",
        version: "", dueAt: "", startsAt: "", endsAt: "", requiresAction: false,
        actionType: "", amount: "", scheduleImpactDays: "", nextAction: "", body: "",
      });
      await load();
    } finally { setBusy(false); }
  }

  async function setItemVisibility(portalItem: any, visibility: string) {
    await request(`${base}/items/${portalItem.id}`, { method: "PATCH", body: JSON.stringify({ visibility }) });
    await load();
  }
  async function updateBudgetItem(budgetItem: any, patch: Record<string, any>) {
    await request(`${base}/budget-items/${budgetItem.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function updatePortalUser(user: any, patch: Record<string, any>) {
    await request(`${base}/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function addDocument() {
    if (!doc.titulo.trim() || !doc.url.trim()) return;
    setBusy(true);
    try {
      await request(`${base}/documents`, { method: "POST", body: JSON.stringify({ ...doc, publicadoCliente: doc.visibility === "publicado" }) });
      setDoc({ categoria: "documento", titulo: "", url: "", versao: "", visibility: "interno", allowDownload: true });
      await load();
    } finally { setBusy(false); }
  }

  async function setDocumentVisibility(item: any, visibility: string) {
    await request(`${base}/documents/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ visibility, publicadoCliente: visibility === "publicado" }),
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
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Central de publicação</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Conteúdo do Portal do Cliente</h3>
        <p className="mt-1 text-xs text-slate-500">Crie conteúdos e controle o ciclo Interno → Compartilhável → Publicado → Arquivado.</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          <select className="rounded-xl border px-3 py-2 text-sm" value={item.kind} onChange={(e) => setItem({ ...item, kind: e.target.value })}>
            <option value="briefing">Briefing</option><option value="pendencia">Pendência do cliente</option><option value="timeline">Linha do tempo</option><option value="agenda">Agenda</option><option value="aditivo">Aditivo</option><option value="alteracao">Alteração</option><option value="assinatura">Assinatura / aceite</option><option value="entrega">Entrega</option><option value="pos_venda">Pós-venda</option><option value="notificacao">Notificação</option>
          </select>
          <input className="rounded-xl border px-3 py-2 text-sm lg:col-span-2" placeholder="Título" value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} />
          <select className="rounded-xl border px-3 py-2 text-sm" value={item.visibility} onChange={(e) => setItem({ ...item, visibility: e.target.value })}><option value="interno">Interno</option><option value="compartilhavel">Compartilhável</option><option value="publicado">Publicado</option><option value="arquivado">Arquivado</option></select>
          <textarea className="rounded-xl border px-3 py-2 text-sm lg:col-span-4" rows={2} placeholder="Descrição para o cliente" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} />
          <textarea className="rounded-xl border px-3 py-2 text-sm lg:col-span-4" rows={3} placeholder="Conteúdo / instruções / resumo" value={item.body} onChange={(e) => setItem({ ...item, body: e.target.value })} />
          {item.kind === "briefing" ? <textarea className="rounded-xl border px-3 py-2 text-sm lg:col-span-4" rows={5} placeholder={"Uma pergunta por linha. Ex.:\nQual o objetivo principal da obra?\nQuais ambientes são prioridade?\nHá referências de estilo?"} value={briefingQuestions} onChange={(e) => setBriefingQuestions(e.target.value)} /> : null}
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Versão (ex.: R2)" value={item.version} onChange={(e) => setItem({ ...item, version: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" type="datetime-local" value={item.startsAt} onChange={(e) => setItem({ ...item, startsAt: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" type="datetime-local" value={item.dueAt} onChange={(e) => setItem({ ...item, dueAt: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Próxima ação" value={item.nextAction} onChange={(e) => setItem({ ...item, nextAction: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" inputMode="decimal" placeholder="Valor (se aplicável)" value={item.amount} onChange={(e) => setItem({ ...item, amount: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" inputMode="numeric" placeholder="Impacto prazo (dias)" value={item.scheduleImpactDays} onChange={(e) => setItem({ ...item, scheduleImpactDays: e.target.value })} />
          <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={item.requiresAction} onChange={(e) => setItem({ ...item, requiresAction: e.target.checked })} />Exige ação do cliente</label>
          <select className="rounded-xl border px-3 py-2 text-sm" value={item.actionType} onChange={(e) => setItem({ ...item, actionType: e.target.value })}><option value="">Ação automática pelo tipo</option><option value="approve_reject">Aprovar / revisar</option><option value="confirm">Confirmar</option><option value="accept">Aceitar</option><option value="complete">Preencher</option></select>
        </div>
        <div className="mt-3 flex justify-end"><button disabled={busy || !item.title.trim()} onClick={() => void addPortalItem()} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Adicionar conteúdo</button></div>
        <div className="mt-5 divide-y overflow-hidden rounded-2xl border">
          {items.length ? items.map((portalItem) => <div key={portalItem.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{portalItem.title}</p><p className="text-xs text-slate-400">{portalItem.kind}{portalItem.version ? ` · ${portalItem.version}` : ""}{portalItem.requires_action ? " · exige ação" : ""}</p></div>
            <div className="flex flex-wrap gap-2">{["interno","compartilhavel","publicado","arquivado"].map((visibility) => <button key={visibility} onClick={() => void setItemVisibility(portalItem, visibility)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${portalItem.visibility === visibility ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}>{visibility}</button>)}</div>
          </div>) : <p className="p-5 text-center text-sm text-slate-400">Nenhum conteúdo adicional criado.</p>}
        </div>
      </section>
      <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Visibilidade do orçamento</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Escolha exatamente o que o cliente vê</h3>
        <p className="mt-1 text-xs text-slate-500">Custos internos e BDI nunca são enviados ao portal. Você controla item, quantidade, preço unitário comercial e total.</p>
        <div className="mt-4 divide-y overflow-hidden rounded-2xl border">
          {budgetItems.length ? budgetItems.map((budgetItem) => <div key={budgetItem.id} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{budgetItem.nome}</p><p className="text-xs text-slate-400">{budgetItem.etapa_nome} · {budgetItem.quantidade} {budgetItem.unidade}</p></div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void updateBudgetItem(budgetItem, { visibleToClient: !budgetItem.visible_to_client })} className={`rounded-full px-3 py-1 text-[11px] font-semibold ${budgetItem.visible_to_client ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{budgetItem.visible_to_client ? "Item visível" : "Item oculto"}</button>
              <button disabled={!budgetItem.visible_to_client} onClick={() => void updateBudgetItem(budgetItem, { showQuantity: !budgetItem.show_quantity })} className={`rounded-full px-3 py-1 text-[11px] font-semibold ${budgetItem.show_quantity ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-400"} disabled:opacity-40`}>Quantidade</button>
              <button disabled={!budgetItem.visible_to_client} onClick={() => void updateBudgetItem(budgetItem, { showUnitPrice: !budgetItem.show_unit_price })} className={`rounded-full px-3 py-1 text-[11px] font-semibold ${budgetItem.show_unit_price ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-400"} disabled:opacity-40`}>Preço unitário</button>
              <button disabled={!budgetItem.visible_to_client} onClick={() => void updateBudgetItem(budgetItem, { showTotal: !budgetItem.show_total })} className={`rounded-full px-3 py-1 text-[11px] font-semibold ${budgetItem.show_total ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-400"} disabled:opacity-40`}>Total</button>
            </div>
          </div>) : <p className="p-5 text-center text-sm text-slate-400">Nenhum orçamento enviado ou aprovado encontrado para esta obra.</p>}
        </div>
      </section>
      <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Acessos do cliente</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Pessoas, perfis e permissões</h3>
        <p className="mt-1 text-xs text-slate-500">Cada pessoa pode ter uma visão diferente do mesmo portal. Revogar o acesso encerra as sessões ativas.</p>
        <div className="mt-4 space-y-3">
          {portalUsers.length ? portalUsers.map((portalUser) => {
            const permissions = portalUser.permissions && typeof portalUser.permissions === "object" ? portalUser.permissions : {};
            const permissionOptions = [
              ["showSchedule","Cronograma"],["showBudget","Orçamento"],["showProposals","Propostas"],
              ["showFinancialSummary","Financeiro"],["showDocuments","Documentos"],["showContracts","Contratos"],
              ["showProjectGallery","Projetos/Renders"],["showChat","Chat"],["showSupport","Suporte"],["showVendi","Vendi"],
            ] as const;
            return <div key={portalUser.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-sm font-semibold text-slate-900">{portalUser.nome}</p><p className="text-xs text-slate-400">{portalUser.email}{portalUser.ultimo_login_em ? ` · último acesso ${new Date(portalUser.ultimo_login_em).toLocaleDateString("pt-BR")}` : ""}</p></div>
                <div className="flex flex-wrap gap-2">
                  <select className="rounded-lg border px-2 py-1.5 text-xs" value={portalUser.access_role ?? "proprietario"} onChange={(e) => void updatePortalUser(portalUser, { accessRole: e.target.value })}>
                    <option value="proprietario">Proprietário</option><option value="conjuge">Cônjuge</option><option value="arquiteto">Arquiteto</option><option value="engenheiro">Engenheiro</option><option value="financeiro">Financeiro</option><option value="fornecedor">Fornecedor</option><option value="representante">Representante</option>
                  </select>
                  <button onClick={() => void updatePortalUser(portalUser, { status: portalUser.status === "ativo" ? "revogado" : "ativo" })} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${portalUser.status === "ativo" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{portalUser.status === "ativo" ? "Ativo" : "Revogado"}</button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {permissionOptions.map(([key,label]) => {
                  const allowed = permissions[key] !== false;
                  return <button key={key} onClick={() => void updatePortalUser(portalUser, { permissions: { ...permissions, [key]: !allowed } })} className={`rounded-full px-3 py-1 text-[11px] font-semibold ${allowed ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-400 line-through"}`}>{label}</button>;
                })}
              </div>
              <label className="mt-3 flex max-w-sm items-center gap-2 text-xs text-slate-500">Expira em
                <input type="datetime-local" className="rounded-lg border px-2 py-1.5 text-xs" value={portalUser.access_expires_at ? String(portalUser.access_expires_at).slice(0,16) : ""} onChange={(e) => void updatePortalUser(portalUser, { accessExpiresAt: e.target.value || null })} />
              </label>
            </div>;
          }) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-400">Ainda não há usuários cadastrados neste portal.</p>}
        </div>
      </section>
      <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Biblioteca do cliente</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Projetos, contratos, manuais e anexos</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-[170px_1fr_1.2fr_100px_140px_auto]">
          <select className="rounded-xl border px-3 py-2 text-sm" value={doc.categoria} onChange={(e) => setDoc({ ...doc, categoria: e.target.value })}>
            <option value="projeto">Projeto</option><option value="contrato">Contrato próprio</option><option value="contrato_terceiro">Contrato de terceiro</option><option value="art_rrt">ART / RRT</option><option value="alvara">Alvará / licença</option><option value="laudo">Laudo</option><option value="ata">Ata</option><option value="manual">Manual</option><option value="garantia">Garantia</option><option value="documento">Documento</option>
          </select>
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Título" value={doc.titulo} onChange={(e) => setDoc({ ...doc, titulo: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="URL do arquivo" value={doc.url} onChange={(e) => setDoc({ ...doc, url: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Versão" value={doc.versao} onChange={(e) => setDoc({ ...doc, versao: e.target.value })} />
          <select className="rounded-xl border px-3 py-2 text-sm" value={doc.visibility} onChange={(e) => setDoc({ ...doc, visibility: e.target.value })}><option value="interno">Interno</option><option value="compartilhavel">Compartilhável</option><option value="publicado">Publicado</option><option value="arquivado">Arquivado</option></select>
          <button disabled={busy} onClick={addDocument} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Adicionar</button>
        </div>
        <div className="mt-4 divide-y overflow-hidden rounded-2xl border">
          {documents.length ? documents.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div><p className="text-sm font-semibold text-slate-800">{item.titulo}</p><p className="text-xs text-slate-400">{item.categoria}{item.versao ? ` · v${item.versao}` : ""}</p></div>
              <div className="flex flex-wrap gap-2"><a href={item.url} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-600">Abrir</a>{["interno","compartilhavel","publicado","arquivado"].map((visibility) => <button key={visibility} onClick={() => void setDocumentVisibility(item, visibility)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${(item.visibility ?? (item.publicado_cliente ? "publicado" : "interno")) === visibility ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}>{visibility}</button>)}</div>
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

[executed on device: vmi3624448 (5bc1259f-2bcf-417a-b2e2-7864f48f2673)]