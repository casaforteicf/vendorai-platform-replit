import { Router, type IRouter } from "express";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import {
  db,
  servicosPrestadoresTable,
  servicosTiposTable,
  servicosOrdensTable,
  leadsTable,
  dealsTable,
  type ServicoChecklistItem,
  type ServicoHistoricoItem,
} from "@workspace/db";
import { SERVICE_CATALOG, SERVICE_TEMPLATES } from "../lib/serviceCatalog";

const router: IRouter = Router();

function routeTenantId(req: any): string {
  return String(req.params.tenantId ?? req.params["tenantId"]);
}

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccess(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || tid(req) === tenantId;
}

function actor(req: Express.Request) {
  const user = (req as any).user ?? {};
  return {
    id: user.id ? String(user.id) : null,
    nome: user.name ?? user.nome ?? user.email ?? "Usuário",
  };
}

const MODELOS = [
  "geral",
  "producao",
  "expedicao",
  "entrega",
  "instalacao",
  "assistencia",
  "suporte",
  "vistoria",
  "manutencao",
] as const;

type ModeloExecucao = (typeof MODELOS)[number];

type ChecklistSeed = Omit<
  ServicoChecklistItem,
  "visibilidade" | "concluido" | "observacao" | "fotos" | "concluidoPorId" | "concluidoPorNome" | "concluidoEm"
>;

const CHECKLISTS: Record<ModeloExecucao, ChecklistSeed[]> = {
  geral: [
    { id: "contexto", titulo: "Conferir informações do negócio e da OS", obrigatorio: true, evidencia: "confirmation" },
    { id: "execucao", titulo: "Registrar o que foi executado", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "resultado", titulo: "Comprovar resultado final", obrigatorio: true, evidencia: "text_and_photo" },
    { id: "aceite", titulo: "Validar conclusão com o cliente/responsável", obrigatorio: true, evidencia: "text_or_photo" },
  ],
  producao: [
    { id: "pedido", titulo: "Conferir pedido, negócio e especificações", obrigatorio: true, evidencia: "confirmation" },
    { id: "materiais", titulo: "Conferir materiais, medidas e componentes", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "producao", titulo: "Registrar execução da produção", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "qualidade", titulo: "Executar controle de qualidade", obrigatorio: true, evidencia: "text_and_photo" },
    { id: "liberacao", titulo: "Liberar item para a próxima etapa", obrigatorio: true, evidencia: "confirmation" },
  ],
  expedicao: [
    { id: "itens", titulo: "Conferir itens e quantidades", obrigatorio: true, evidencia: "confirmation" },
    { id: "avarias", titulo: "Conferir avarias antes do carregamento", obrigatorio: true, evidencia: "photo" },
    { id: "embalagem", titulo: "Validar embalagem e identificação dos volumes", obrigatorio: true, evidencia: "photo" },
    { id: "carregamento", titulo: "Comprovar carregamento", obrigatorio: true, evidencia: "photo" },
    { id: "liberacao", titulo: "Liberar para entrega/transporte", obrigatorio: true, evidencia: "confirmation" },
  ],
  entrega: [
    { id: "rota", titulo: "Conferir endereço, contato e janela de entrega", obrigatorio: true, evidencia: "confirmation" },
    { id: "volumes", titulo: "Conferir volumes no destino", obrigatorio: true, evidencia: "photo" },
    { id: "entrega", titulo: "Comprovar entrega", obrigatorio: true, evidencia: "text_and_photo" },
    { id: "recebimento", titulo: "Identificar quem recebeu e registrar aceite", obrigatorio: true, evidencia: "text_or_photo" },
  ],
  instalacao: [
    { id: "projeto", titulo: "Conferir projeto, medidas e especificações", obrigatorio: true, evidencia: "confirmation" },
    { id: "antes", titulo: "Registrar condição do local antes da instalação", obrigatorio: true, evidencia: "photo" },
    { id: "instalacao", titulo: "Registrar execução da instalação", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "teste", titulo: "Testar funcionamento, regulagem e acabamento", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "depois", titulo: "Registrar fotos finais", obrigatorio: true, evidencia: "photo" },
    { id: "aceite", titulo: "Registrar aceite do cliente/responsável", obrigatorio: true, evidencia: "text_or_photo" },
  ],
  assistencia: [
    { id: "diagnostico", titulo: "Registrar diagnóstico e situação encontrada", obrigatorio: true, evidencia: "text_and_photo" },
    { id: "causa", titulo: "Identificar causa provável e impacto", obrigatorio: true, evidencia: "text" },
    { id: "correcao", titulo: "Registrar serviço/correção executada", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "teste", titulo: "Validar solução e funcionamento", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "final", titulo: "Comprovar condição final", obrigatorio: true, evidencia: "photo" },
    { id: "cliente", titulo: "Confirmar ciência do cliente", obrigatorio: true, evidencia: "text_or_photo" },
  ],
  suporte: [
    { id: "problema", titulo: "Registrar problema relatado e contexto", obrigatorio: true, evidencia: "text" },
    { id: "acao", titulo: "Registrar ação executada", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "validacao", titulo: "Validar solução", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "cliente", titulo: "Confirmar retorno ao cliente", obrigatorio: true, evidencia: "confirmation" },
  ],
  vistoria: [
    { id: "contexto", titulo: "Conferir projeto, escopo e critérios de vistoria", obrigatorio: true, evidencia: "confirmation" },
    { id: "inspecao", titulo: "Registrar inspeção e medições relevantes", obrigatorio: true, evidencia: "text_and_photo" },
    { id: "pendencias", titulo: "Registrar pendências ou não conformidades", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "parecer", titulo: "Emitir parecer da vistoria", obrigatorio: true, evidencia: "text" },
    { id: "aceite", titulo: "Registrar validação do responsável", obrigatorio: true, evidencia: "text_or_photo" },
  ],
  manutencao: [
    { id: "inspecao", titulo: "Inspecionar condição inicial", obrigatorio: true, evidencia: "text_and_photo" },
    { id: "itens", titulo: "Conferir itens previstos na manutenção", obrigatorio: true, evidencia: "confirmation" },
    { id: "servico", titulo: "Registrar manutenção executada", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "teste", titulo: "Executar teste final", obrigatorio: true, evidencia: "text_or_photo" },
    { id: "proxima", titulo: "Registrar recomendação ou próxima manutenção", obrigatorio: false, evidencia: "text" },
  ],
};

function buildChecklist(modelo: string): ServicoChecklistItem[] {
  const key = MODELOS.includes(modelo as ModeloExecucao) ? (modelo as ModeloExecucao) : "geral";
  return CHECKLISTS[key].map((item) => ({
    ...item,
    visibilidade: "interno",
    concluido: false,
    observacao: null,
    fotos: [],
    concluidoPorId: null,
    concluidoPorNome: null,
    concluidoEm: null,
  }));
}

function history(
  req: Express.Request,
  tipo: ServicoHistoricoItem["tipo"],
  mensagem: string,
  dados?: Record<string, unknown>,
): ServicoHistoricoItem {
  const a = actor(req);
  return {
    id: crypto.randomUUID(),
    tipo,
    mensagem,
    usuarioId: a.id,
    usuarioNome: a.nome,
    criadoEm: new Date().toISOString(),
    dados,
  };
}

function evidenceOk(item: ServicoChecklistItem, observacao: string, fotos: string[]) {
  switch (item.evidencia) {
    case "confirmation":
      return true;
    case "text":
      return observacao.trim().length > 0;
    case "photo":
      return fotos.length > 0;
    case "text_and_photo":
      return observacao.trim().length > 0 && fotos.length > 0;
    case "text_or_photo":
    default:
      return observacao.trim().length > 0 || fotos.length > 0;
  }
}

// ─── Prestadores ────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/servicos/prestadores", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(servicosPrestadoresTable.tenantId, tenantId), eq(servicosPrestadoresTable.ativo, true)];
  if (req.query.especialidade) {
    filters.push(eq(servicosPrestadoresTable.especialidade, req.query.especialidade as string));
  }

  const rows = await db
    .select()
    .from(servicosPrestadoresTable)
    .where(and(...filters))
    .orderBy(servicosPrestadoresTable.nome);

  return res.json(rows);
});

router.post("/tenants/:tenantId/servicos/prestadores", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(servicosPrestadoresTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/servicos/prestadores/:id", async (req, res) => {
  const tenantId = routeTenantId(req);
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(servicosPrestadoresTable)
    .set(req.body as any)
    .where(and(eq(servicosPrestadoresTable.id, id), eq(servicosPrestadoresTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Prestador not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/servicos/prestadores/:id", async (req, res) => {
  const tenantId = routeTenantId(req);
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(servicosPrestadoresTable)
    .set({ ativo: false })
    .where(and(eq(servicosPrestadoresTable.id, id), eq(servicosPrestadoresTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Prestador not found" });
  return res.json(row);
});

// ─── Tipos de Serviço ───────────────────────────────────────────────────────

router.get("/servicos/catalogo-modelo", (_req, res) => res.json(SERVICE_CATALOG));

router.post("/tenants/:tenantId/servicos/importar-catalogo", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const existentes = await db.select({ nome: servicosTiposTable.nome }).from(servicosTiposTable).where(eq(servicosTiposTable.tenantId, tenantId));
  const nomes = new Set(existentes.map((item) => item.nome.toLocaleLowerCase("pt-BR")));
  const novos = SERVICE_TEMPLATES.filter((item) => !nomes.has(item.nome.toLocaleLowerCase("pt-BR")));
  if (novos.length) {
    await db.insert(servicosTiposTable).values(novos.map((item) => ({ ...item, tenantId, ativo: true, vendeNoPracaAi: false })) as any);
  }
  return res.status(201).json({ adicionados: novos.length, existentes: SERVICE_TEMPLATES.length - novos.length, totalCatalogo: SERVICE_TEMPLATES.length });
});

router.get("/tenants/:tenantId/servicos/tipos", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(servicosTiposTable.tenantId, tenantId), eq(servicosTiposTable.ativo, true)];
  if (req.query.especialidade) {
    filters.push(eq(servicosTiposTable.especialidade, req.query.especialidade as string));
  }

  const rows = await db
    .select()
    .from(servicosTiposTable)
    .where(and(...filters))
    .orderBy(servicosTiposTable.nome);

  return res.json(rows);
});

router.post("/tenants/:tenantId/servicos/tipos", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .insert(servicosTiposTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/servicos/tipos/:id", async (req, res) => {
  const tenantId = routeTenantId(req);
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(servicosTiposTable)
    .set(req.body as any)
    .where(and(eq(servicosTiposTable.id, id), eq(servicosTiposTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Tipo de serviço not found" });
  return res.json(row);
});

// ─── Ordens de Serviço / Pipeline executável ────────────────────────────────

router.get("/tenants/:tenantId/servicos/ordens", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(servicosOrdensTable.tenantId, tenantId)];

  if (req.query.prestadorId) {
    filters.push(eq(servicosOrdensTable.prestadorId, req.query.prestadorId as string));
  }
  if (req.query.status) {
    filters.push(eq(servicosOrdensTable.status, req.query.status as string));
  }
  if (req.query.data) {
    const dayStart = new Date(`${req.query.data}T00:00:00`);
    const dayEnd = new Date(`${req.query.data}T23:59:59.999`);
    filters.push(gte(servicosOrdensTable.dataHoraVisita, dayStart));
    filters.push(lte(servicosOrdensTable.dataHoraVisita, dayEnd));
  }

  const ordens = await db
    .select()
    .from(servicosOrdensTable)
    .where(and(...filters))
    .orderBy(servicosOrdensTable.createdAt);

  const clienteIds = [...new Set(ordens.map((o) => o.clienteId))];
  const prestadorIds = [...new Set(ordens.map((o) => o.prestadorId).filter(Boolean) as string[])];
  const tipoIds = [...new Set(ordens.map((o) => o.tipoServicoId))];
  const negocioIds = [...new Set(ordens.map((o) => o.negocioId).filter(Boolean) as string[])];

  const [clientes, prestadores, tipos, negocios] = await Promise.all([
    clienteIds.length
      ? db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone })
          .from(leadsTable)
          .where(and(eq(leadsTable.tenantId, tenantId), inArray(leadsTable.id, clienteIds)))
      : Promise.resolve([]),
    prestadorIds.length
      ? db.select().from(servicosPrestadoresTable)
          .where(and(eq(servicosPrestadoresTable.tenantId, tenantId), inArray(servicosPrestadoresTable.id, prestadorIds)))
      : Promise.resolve([]),
    tipoIds.length
      ? db.select().from(servicosTiposTable)
          .where(and(eq(servicosTiposTable.tenantId, tenantId), inArray(servicosTiposTable.id, tipoIds)))
      : Promise.resolve([]),
    negocioIds.length
      ? db.select({
          id: dealsTable.id,
          titulo: dealsTable.titulo,
          valor: dealsTable.valor,
          etapa: dealsTable.etapa,
          leadId: dealsTable.leadId,
          dataFechamentoPrevista: dealsTable.dataFechamentoPrevista,
        }).from(dealsTable)
          .where(and(eq(dealsTable.tenantId, tenantId), inArray(dealsTable.id, negocioIds)))
      : Promise.resolve([]),
  ]);

  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));
  const prestadorMap = Object.fromEntries(prestadores.map((p) => [p.id, p]));
  const tipoMap = Object.fromEntries(tipos.map((t) => [t.id, t]));
  const negocioMap = Object.fromEntries(negocios.map((n) => [n.id, n]));

  return res.json(ordens.map((o) => ({
    ...o,
    cliente: clienteMap[o.clienteId] ?? null,
    prestador: o.prestadorId ? prestadorMap[o.prestadorId] ?? null : null,
    tipoServico: tipoMap[o.tipoServicoId] ?? null,
    negocio: o.negocioId ? negocioMap[o.negocioId] ?? null : null,
  })));
});

router.get("/tenants/:tenantId/servicos/ordens/:id/cliente-view", async (req, res) => {
  const tenantId = routeTenantId(req);
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [ordem] = await db.select().from(servicosOrdensTable)
    .where(and(eq(servicosOrdensTable.id, id), eq(servicosOrdensTable.tenantId, tenantId)));
  if (!ordem) return res.status(404).json({ error: "Ordem de serviço not found" });

  const itensVisiveis = (ordem.checklistExecucao ?? [])
    .filter((item) => item.visibilidade === "cliente" || item.visibilidade === "cliente_parceiro")
    .map((item) => ({
      id: item.id,
      titulo: item.titulo,
      descricao: item.descricao ?? null,
      concluido: item.concluido,
      observacao: item.observacao ?? null,
      fotos: item.fotos ?? [],
      concluidoPorNome: item.concluidoPorNome ?? null,
      concluidoEm: item.concluidoEm ?? null,
    }));

  return res.json({
    id: ordem.id,
    modeloExecucao: ordem.modeloExecucao,
    enderecoAtendimento: ordem.enderecoAtendimento,
    status: ordem.compartilharStatusCliente ? ordem.status : null,
    progresso: itensVisiveis.length
      ? {
          concluidos: itensVisiveis.filter((item) => item.concluido).length,
          total: itensVisiveis.length,
        }
      : null,
    atividades: itensVisiveis,
  });
});

router.post("/tenants/:tenantId/servicos/ordens", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const {
    clienteId,
    negocioId,
    tipoServicoId,
    modeloExecucao = "geral",
    enderecoAtendimento,
    prestadorId,
    observacoes,
    clienteAcompanha = true,
    compartilharStatusCliente = true,
  } = req.body as {
    clienteId: string;
    negocioId?: string;
    tipoServicoId: string;
    modeloExecucao?: ModeloExecucao;
    enderecoAtendimento: string;
    prestadorId?: string;
    observacoes?: string;
    clienteAcompanha?: boolean;
    compartilharStatusCliente?: boolean;
  };

  if (!clienteId || !tipoServicoId || !enderecoAtendimento) {
    return res.status(422).json({ error: "clienteId, tipoServicoId e enderecoAtendimento são obrigatórios" });
  }
  if (!MODELOS.includes(modeloExecucao as ModeloExecucao)) {
    return res.status(422).json({ error: "Modelo de execução inválido" });
  }

  const [tipoServico] = await db
    .select()
    .from(servicosTiposTable)
    .where(and(eq(servicosTiposTable.id, tipoServicoId), eq(servicosTiposTable.tenantId, tenantId)));

  if (!tipoServico) return res.status(404).json({ error: "Tipo de serviço not found" });

  if (negocioId) {
    const [negocio] = await db.select({ id: dealsTable.id, leadId: dealsTable.leadId })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, negocioId), eq(dealsTable.tenantId, tenantId)));
    if (!negocio) return res.status(404).json({ error: "Negócio não encontrado" });
    if (negocio.leadId && negocio.leadId !== clienteId) {
      return res.status(422).json({ error: "O negócio selecionado pertence a outro cliente" });
    }
  }

  const nascePronta = !tipoServico.requerVisitaTecnica && tipoServico.precoBase != null;
  const checklist = buildChecklist(modeloExecucao);
  const criacao = history(req, "criacao", `OS criada com modelo ${modeloExecucao}`, {
    modeloExecucao,
    negocioId: negocioId ?? null,
  });

  const [ordem] = await db
    .insert(servicosOrdensTable)
    .values({
      tenantId,
      clienteId,
      negocioId: negocioId ?? null,
      tipoServicoId,
      modeloExecucao,
      enderecoAtendimento,
      prestadorId: prestadorId ?? null,
      observacoes: observacoes ?? null,
      status: nascePronta ? "orcamento_enviado" : "orcamento_pendente",
      valorOrcado: nascePronta ? tipoServico.precoBase : null,
      checklistExecucao: checklist,
      historicoExecucao: [criacao],
      clienteAcompanha,
      compartilharStatusCliente,
      updatedAt: new Date(),
    } as any)
    .returning();

  return res.status(201).json(ordem);
});

router.patch("/tenants/:tenantId/servicos/ordens/:id", async (req, res) => {
  const tenantId = routeTenantId(req);
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [atual] = await db.select().from(servicosOrdensTable)
    .where(and(eq(servicosOrdensTable.id, id), eq(servicosOrdensTable.tenantId, tenantId)));
  if (!atual) return res.status(404).json({ error: "Ordem de serviço not found" });

  const allowed = [
    "prestadorId",
    "negocioId",
    "enderecoAtendimento",
    "dataHoraVisita",
    "valorOrcado",
    "valorFinal",
    "observacoes",
    "clienteAcompanha",
    "compartilharStatusCliente",
  ];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const historico = [
    ...(atual.historicoExecucao ?? []),
    history(req, "edicao", "Dados da ordem atualizados", { campos: Object.keys(patch) }),
  ];

  const [row] = await db
    .update(servicosOrdensTable)
    .set({ ...patch, historicoExecucao: historico, updatedAt: new Date() } as any)
    .where(and(eq(servicosOrdensTable.id, id), eq(servicosOrdensTable.tenantId, tenantId)))
    .returning();

  return res.json(row);
});

router.patch("/tenants/:tenantId/servicos/ordens/:id/status", async (req, res) => {
  const tenantId = routeTenantId(req);
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { status, motivo } = req.body as { status: string; motivo?: string };
  const statusValidos = [
    "orcamento_pendente",
    "orcamento_enviado",
    "aprovado",
    "agendado",
    "em_andamento",
    "aguardando_validacao",
    "concluido",
    "cancelado",
  ] as const;
  if (!statusValidos.includes(status as any)) {
    return res.status(422).json({ error: `status inválido. Valores: ${statusValidos.join(", ")}` });
  }

  const [atual] = await db.select().from(servicosOrdensTable)
    .where(and(eq(servicosOrdensTable.id, id), eq(servicosOrdensTable.tenantId, tenantId)));
  if (!atual) return res.status(404).json({ error: "Ordem de serviço not found" });

  if (status === "concluido") {
    const checklist = atual.checklistExecucao ?? [];
    const pendentes = checklist.filter((item) => item.obrigatorio && !item.concluido);
    if (pendentes.length) {
      return res.status(409).json({
        error: "Não é possível concluir: há passos obrigatórios pendentes.",
        pendentes: pendentes.map((item) => ({ id: item.id, titulo: item.titulo })),
      });
    }
  }

  const historico = [
    ...(atual.historicoExecucao ?? []),
    history(req, "status", `Pipeline: ${atual.status ?? "—"} → ${status}`, motivo ? { motivo } : undefined),
  ];

  const [row] = await db
    .update(servicosOrdensTable)
    .set({ status, historicoExecucao: historico, updatedAt: new Date() })
    .where(and(eq(servicosOrdensTable.id, id), eq(servicosOrdensTable.tenantId, tenantId)))
    .returning();

  return res.json(row);
});

router.patch("/tenants/:tenantId/servicos/ordens/:id/checklist/:itemId", async (req, res) => {
  const tenantId = routeTenantId(req);
  const id = req.params.id as string;
  const itemId = req.params.itemId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [ordem] = await db.select().from(servicosOrdensTable)
    .where(and(eq(servicosOrdensTable.id, id), eq(servicosOrdensTable.tenantId, tenantId)));
  if (!ordem) return res.status(404).json({ error: "Ordem de serviço not found" });

  const checklist = [...(ordem.checklistExecucao ?? [])];
  const index = checklist.findIndex((item) => item.id === itemId);
  if (index < 0) return res.status(404).json({ error: "Passo do checklist não encontrado" });

  const atual = checklist[index];
  const hasConcluido = Object.prototype.hasOwnProperty.call(req.body ?? {}, "concluido");
  const concluido = hasConcluido ? req.body.concluido !== false : atual.concluido;
  const observacao = String(req.body.observacao ?? atual.observacao ?? "").trim();
  const fotos = Array.isArray(req.body.fotos)
    ? req.body.fotos.filter((url: unknown) => typeof url === "string" && url.trim())
    : (atual.fotos ?? []);
  const visibilidade = ["interno", "cliente", "cliente_parceiro"].includes(String(req.body.visibilidade ?? ""))
    ? String(req.body.visibilidade)
    : (atual.visibilidade ?? "interno");

  if (hasConcluido && concluido && !evidenceOk(atual, observacao, fotos)) {
    const mensagens: Record<string, string> = {
      text: "Escreva o que foi feito antes de concluir este passo.",
      photo: "Adicione pelo menos uma foto antes de concluir este passo.",
      text_and_photo: "Este passo exige descrição e foto.",
      text_or_photo: "Adicione uma descrição ou foto para comprovar a execução.",
      confirmation: "Confirme a execução para concluir.",
    };
    return res.status(422).json({ error: mensagens[atual.evidencia] ?? "Evidência obrigatória ausente." });
  }

  const a = actor(req);
  checklist[index] = {
    ...atual,
    visibilidade: visibilidade as any,
    concluido,
    observacao: observacao || null,
    fotos,
    concluidoPorId: hasConcluido ? (concluido ? a.id : null) : atual.concluidoPorId,
    concluidoPorNome: hasConcluido ? (concluido ? a.nome : null) : atual.concluidoPorNome,
    concluidoEm: hasConcluido ? (concluido ? new Date().toISOString() : null) : atual.concluidoEm,
  };

  const required = checklist.filter((item) => item.obrigatorio);
  const allDone = required.length > 0 && required.every((item) => item.concluido);
  let nextStatus = ordem.status ?? "orcamento_pendente";

  if (hasConcluido) {
    if (concluido && ["aprovado", "agendado"].includes(nextStatus)) nextStatus = "em_andamento";
    if (allDone && nextStatus !== "cancelado") nextStatus = "concluido";
  }

  const historico = [
    ...(ordem.historicoExecucao ?? []),
    history(
      req,
      "checklist",
      hasConcluido
        ? `${concluido ? "Concluído" : "Reaberto"}: ${atual.titulo}`
        : `Compartilhamento atualizado: ${atual.titulo}`,
      { itemId, fotos: fotos.length, temObservacao: Boolean(observacao), visibilidade },
    ),
  ];

  if (nextStatus !== ordem.status) {
    historico.push(history(req, "status", `Pipeline automática: ${ordem.status ?? "—"} → ${nextStatus}`));
  }

  const [row] = await db
    .update(servicosOrdensTable)
    .set({
      checklistExecucao: checklist,
      historicoExecucao: historico,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(servicosOrdensTable.id, id), eq(servicosOrdensTable.tenantId, tenantId)))
    .returning();

  return res.json({
    ...row,
    progresso: {
      concluidos: required.filter((item) => item.concluido).length,
      total: required.length,
      percentual: required.length ? Math.round((required.filter((item) => item.concluido).length / required.length) * 100) : 100,
    },
  });
});

export default router;
