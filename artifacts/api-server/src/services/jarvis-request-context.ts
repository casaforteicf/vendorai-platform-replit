import { and, desc, eq } from "drizzle-orm";
import { db, dealsTable, leadsTable, propostasTable, tenantsTable, usersTable } from "@workspace/db";

function compact(value: string | null | undefined, max = 240) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function routeEntity(route?: string | null) {
  const clean = route?.split("?")[0]?.replace(/\/+$/, "") ?? "";
  const lead = clean.match(/^\/leads\/([^/]+)$/);
  if (lead?.[1] && lead[1] !== "import-config") return { kind: "lead" as const, id: lead[1] };

  const proposal = clean.match(/^\/propostas\/([^/]+)(?:\/print)?$/);
  if (proposal?.[1]) return { kind: "proposal" as const, id: proposal[1] };

  return null;
}

export async function loadJarvisRequestContext(input: {
  tenantId: string;
  userId?: string | null;
  route?: string | null;
}): Promise<string> {
  const { tenantId, userId, route } = input;
  const entity = routeEntity(route);

  const tenantPromise = db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      slug: tenantsTable.slug,
      vertical: tenantsTable.vertical,
      verticalSecundaria: tenantsTable.verticalSecundaria,
      planId: tenantsTable.planId,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  const userPromise = userId
    ? db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          platformRole: usersTable.platformRole,
          userFunction: usersTable.userFunction,
          permissions: usersTable.permissions,
          active: usersTable.active,
        })
        .from(usersTable)
        .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
        .limit(1)
    : Promise.resolve([]);

  const [tenantRows, userRows, entityContext] = await Promise.all([
    tenantPromise,
    userPromise,
    entity ? loadEntityContext(tenantId, entity) : Promise.resolve(""),
  ]);

  const tenant = tenantRows[0] ?? null;
  const user = userRows[0] ?? null;
  const lines = [
    "## Contexto executivo verificado no servidor",
    "Este bloco é derivado da sessão autenticada e de registros tenant-scoped. Ele tem precedência sobre nome, papel, permissões ou entidade enviados apenas pelo navegador.",
  ];

  if (tenant) {
    lines.push(
      `- tenant_id=${tenant.id} | tenant_nome=${compact(tenant.name, 160)} | tenant_slug=${tenant.slug} | vertical=${tenant.vertical ?? "não_definida"} | vertical_secundária=${tenant.verticalSecundaria ?? "não_definida"} | plano=${tenant.planId ?? "não_definido"}`,
    );
  } else {
    lines.push("- Tenant autenticado não pôde ser resolvido no cadastro. Não invente nome, vertical ou plano.");
  }

  if (user) {
    const firstName = compact(user.name, 100).split(/\s+/)[0] ?? "";
    const permissions = Array.isArray(user.permissions) ? user.permissions.slice(0, 30).join(",") : "padrão_do_papel";
    lines.push(
      `- usuário_id=${user.id} | nome=${compact(user.name, 120)} | primeiro_nome=${firstName} | papel=${user.platformRole} | função=${user.userFunction ?? "não_definida"} | ativo=${user.active ? "sim" : "não"} | permissões=${permissions}`,
    );
    lines.push("Use o primeiro nome apenas quando soar natural. Não repita o nome em toda resposta.");
  } else if (userId) {
    lines.push("- A identidade autenticada não pôde ser resolvida na tabela de usuários deste tenant. Não invente nome, função ou permissão.");
  }

  if (route) lines.push(`- rota_verificada_pelo_request=${compact(route, 300)}`);
  if (entityContext) lines.push("", entityContext);

  lines.push(
    "Ao responder sobre 'este cliente', 'esta proposta' ou 'aqui', priorize a entidade resolvida neste bloco. Cruze-a com o Estado operacional real do tenant, mas não associe Caso Vendor, agenda ou risco a esta entidade sem vínculo explícito por ID ou evidência suficiente.",
  );

  return lines.join("\n");
}

async function loadEntityContext(
  tenantId: string,
  entity: { kind: "lead" | "proposal"; id: string },
): Promise<string> {
  if (entity.kind === "lead") {
    const [leadRows, dealRows, proposalRows] = await Promise.all([
      db
        .select({
          id: leadsTable.id,
          nome: leadsTable.nome,
          empresa: leadsTable.empresa,
          status: leadsTable.status,
          objetivo: leadsTable.objetivo,
          urgencia: leadsTable.urgencia,
          dorPrincipal: leadsTable.dorPrincipal,
          proximaAcao: leadsTable.proximaAcao,
          assignedTo: leadsTable.assignedTo,
          tipo: leadsTable.tipo,
          naoLeadTipo: leadsTable.naoLeadTipo,
          iaAtiva: leadsTable.iaAtiva,
          updatedAt: leadsTable.updatedAt,
        })
        .from(leadsTable)
        .where(and(eq(leadsTable.id, entity.id), eq(leadsTable.tenantId, tenantId)))
        .limit(1),
      db
        .select({
          id: dealsTable.id,
          titulo: dealsTable.titulo,
          etapa: dealsTable.etapa,
          probabilidade: dealsTable.probabilidade,
          dataFechamentoPrevista: dealsTable.dataFechamentoPrevista,
          assignedTo: dealsTable.assignedTo,
          updatedAt: dealsTable.updatedAt,
        })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.leadId, entity.id)))
        .orderBy(desc(dealsTable.updatedAt))
        .limit(1),
      db
        .select({
          id: propostasTable.id,
          titulo: propostasTable.titulo,
          status: propostasTable.status,
          validadeAte: propostasTable.validadeAte,
          dealId: propostasTable.dealId,
          updatedAt: propostasTable.updatedAt,
        })
        .from(propostasTable)
        .where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.leadId, entity.id)))
        .orderBy(desc(propostasTable.updatedAt))
        .limit(1),
    ]);

    const lead = leadRows[0];
    if (!lead) return `### Entidade atual\nA rota aponta para lead=${entity.id}, mas esse registro não existe neste tenant. Não use dados de outro tenant nem invente o cliente.`;
    const deal = dealRows[0] ?? null;
    const proposal = proposalRows[0] ?? null;

    return [
      "### Entidade atual — cliente/lead",
      `- lead=${lead.id} | nome=${compact(lead.nome, 140)} | empresa=${compact(lead.empresa, 140) || "não_informada"} | status=${lead.status} | tipo=${lead.tipo} | não_lead=${lead.naoLeadTipo ?? "não"} | ia_ativa=${lead.iaAtiva ? "sim" : "não"} | responsável=${lead.assignedTo ?? "não_definido"} | atualizado=${lead.updatedAt.toISOString()}`,
      lead.objetivo ? `  Objetivo: ${compact(lead.objetivo)}` : null,
      lead.dorPrincipal ? `  Dor principal: ${compact(lead.dorPrincipal)}` : null,
      lead.urgencia ? `  Urgência informada: ${compact(lead.urgencia, 120)}` : null,
      lead.proximaAcao ? `  Próxima ação registrada: ${compact(lead.proximaAcao)}` : null,
      deal ? `- negócio=${deal.id} | título=${compact(deal.titulo, 160)} | etapa=${deal.etapa} | probabilidade=${deal.probabilidade ?? "não_informada"}% | fechamento_previsto=${deal.dataFechamentoPrevista?.toISOString() ?? "não_informado"} | responsável=${deal.assignedTo ?? "não_definido"}` : "- negócio_relacionado=nenhum_encontrado",
      proposal ? `- proposta=${proposal.id} | título=${compact(proposal.titulo, 160)} | status=${proposal.status} | validade=${proposal.validadeAte?.toISOString() ?? "não_informada"} | negócio=${proposal.dealId ?? "não_vinculado"}` : "- proposta_relacionada=nenhuma_encontrada",
    ].filter(Boolean).join("\n");
  }

  const proposalRows = await db
    .select({
      id: propostasTable.id,
      leadId: propostasTable.leadId,
      dealId: propostasTable.dealId,
      titulo: propostasTable.titulo,
      status: propostasTable.status,
      validadeAte: propostasTable.validadeAte,
      formaPagamento: propostasTable.formaPagamento,
      prazoEntrega: propostasTable.prazoEntrega,
      updatedAt: propostasTable.updatedAt,
    })
    .from(propostasTable)
    .where(and(eq(propostasTable.id, entity.id), eq(propostasTable.tenantId, tenantId)))
    .limit(1);

  const proposal = proposalRows[0];
  if (!proposal) return `### Entidade atual\nA rota aponta para proposta=${entity.id}, mas esse registro não existe neste tenant. Não use proposta de outro tenant.`;

  const [leadRows, dealRows] = await Promise.all([
    db
      .select({ id: leadsTable.id, nome: leadsTable.nome, empresa: leadsTable.empresa, status: leadsTable.status, proximaAcao: leadsTable.proximaAcao })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, proposal.leadId), eq(leadsTable.tenantId, tenantId)))
      .limit(1),
    proposal.dealId
      ? db
          .select({ id: dealsTable.id, titulo: dealsTable.titulo, etapa: dealsTable.etapa, probabilidade: dealsTable.probabilidade })
          .from(dealsTable)
          .where(and(eq(dealsTable.id, proposal.dealId), eq(dealsTable.tenantId, tenantId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const lead = leadRows[0] ?? null;
  const deal = dealRows[0] ?? null;
  return [
    "### Entidade atual — proposta",
    `- proposta=${proposal.id} | título=${compact(proposal.titulo, 180)} | status=${proposal.status} | validade=${proposal.validadeAte?.toISOString() ?? "não_informada"} | forma_pagamento=${proposal.formaPagamento ?? "não_informada"} | prazo_entrega=${compact(proposal.prazoEntrega, 120) || "não_informado"} | atualizado=${proposal.updatedAt.toISOString()}`,
    lead ? `- cliente=${lead.id} | nome=${compact(lead.nome, 140)} | empresa=${compact(lead.empresa, 140) || "não_informada"} | status=${lead.status}${lead.proximaAcao ? ` | próxima_ação=${compact(lead.proximaAcao, 180)}` : ""}` : `- cliente=${proposal.leadId} | detalhes_indisponíveis_no_tenant`,
    deal ? `- negócio=${deal.id} | título=${compact(deal.titulo, 160)} | etapa=${deal.etapa} | probabilidade=${deal.probabilidade ?? "não_informada"}%` : "- negócio_relacionado=nenhum_encontrado",
  ].join("\n");
}
