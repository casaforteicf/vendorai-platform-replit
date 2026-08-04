import { Router, type IRouter } from "express";
import { and, eq, desc, isNull, inArray } from "drizzle-orm";
import {
  db,
  fretesVeiculosTable,
  fretesCargasTable,
  fretesRotasTable,
  fretesLocalizacoesHistoricoTable,
  leadsTable,
  usersTable,
} from "@workspace/db";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { geocodeAddress, distanceKm, estimarValorFrete, estimarEtaMinutos } from "../lib/geocoding.js";

const router: IRouter = Router();

// Router separado — precisa ser registrado ANTES do middleware authenticate
// no routes/index.ts (mesmo padrão de publicSiteRouter, archPublicRouter
// etc), senão essas rotas ficam bloqueadas por exigir login igual as outras.
export const fretesPublicRouter: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}
function canAccess(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || tid(req) === tenantId;
}

/** Anexa etaMinutos calculado na hora, se tiver posição atual e destino conhecidos. */
function withEta<T extends { localizacaoLat: number | null; localizacaoLng: number | null; enderecoEntregaLat: number | null; enderecoEntregaLng: number | null; status: string }>(row: T) {
  if (
    row.status !== "coletado" && row.status !== "em_transito"
  ) return { ...row, etaMinutos: null };
  if (row.localizacaoLat == null || row.localizacaoLng == null || row.enderecoEntregaLat == null || row.enderecoEntregaLng == null) {
    return { ...row, etaMinutos: null };
  }
  const km = distanceKm(
    { lat: row.localizacaoLat, lng: row.localizacaoLng },
    { lat: row.enderecoEntregaLat, lng: row.enderecoEntregaLng },
  );
  return { ...row, etaMinutos: estimarEtaMinutos(km) };
}

// ─── Veículos ─────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/fretes/veiculos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(fretesVeiculosTable.tenantId, tenantId), eq(fretesVeiculosTable.ativo, true)];
  if (req.query.tipo) conditions.push(eq(fretesVeiculosTable.tipo, req.query.tipo as any));

  const rows = await db.select().from(fretesVeiculosTable)
    .where(and(...conditions))
    .orderBy(fretesVeiculosTable.placa);
  return res.json(rows);
});

router.post("/tenants/:tenantId/fretes/veiculos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.insert(fretesVeiculosTable)
    .values({ ...req.body, tenantId } as any)
    .returning();
  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/fretes/veiculos/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(fretesVeiculosTable)
    .set(req.body as any)
    .where(and(eq(fretesVeiculosTable.id, id), eq(fretesVeiculosTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Veículo not found" });
  return res.json(row);
});

// Soft delete — ativo = false
router.delete("/tenants/:tenantId/fretes/veiculos/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(fretesVeiculosTable)
    .set({ ativo: false })
    .where(and(eq(fretesVeiculosTable.id, id), eq(fretesVeiculosTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Veículo not found" });
  return res.json(row);
});

// ─── Fluxo estilo Uber: motorista aceita e compartilha localização ────────────

// Cargas aprovadas ainda sem motorista — a "fila de ofertas" que qualquer
// motorista do tenant pode ver e aceitar.
router.get("/tenants/:tenantId/fretes/cargas/disponiveis", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(fretesCargasTable)
    .where(and(
      eq(fretesCargasTable.tenantId, tenantId),
      eq(fretesCargasTable.status, "aprovado"),
      isNull(fretesCargasTable.motoristaId),
    ))
    .orderBy(desc(fretesCargasTable.createdAt));

  const clienteIds = [...new Set(rows.map((c) => c.clienteId))];
  const clientes = clienteIds.length
    ? await db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone }).from(leadsTable)
        .where(eq(leadsTable.tenantId, tenantId))
    : [];
  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));

  return res.json(rows.map((c) => ({ ...c, cliente: clienteMap[c.clienteId] ?? null })));
});

// Entregas do motorista logado (aceitas por ele, ainda em andamento).
router.get("/tenants/:tenantId/fretes/cargas/minhas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const motoristaId = (req as any).user?.sub as string;

  const rows = await db.select().from(fretesCargasTable)
    .where(and(eq(fretesCargasTable.tenantId, tenantId), eq(fretesCargasTable.motoristaId, motoristaId)))
    .orderBy(desc(fretesCargasTable.createdAt));

  const clienteIds = [...new Set(rows.map((c) => c.clienteId))];
  const clientes = clienteIds.length
    ? await db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone }).from(leadsTable)
        .where(eq(leadsTable.tenantId, tenantId))
    : [];
  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));

  return res.json(rows.map((c) => ({ ...c, cliente: clienteMap[c.clienteId] ?? null })));
});

// Aceitar carga — atômico: só passa se ninguém pegou primeiro (evita dois
// motoristas aceitando a mesma carga ao mesmo tempo).
router.post("/tenants/:tenantId/fretes/cargas/:id/aceitar", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const motoristaId = (req as any).user?.sub as string;

  const [row] = await db.update(fretesCargasTable)
    .set({ motoristaId, updatedAt: new Date() })
    .where(and(
      eq(fretesCargasTable.id, id),
      eq(fretesCargasTable.tenantId, tenantId),
      eq(fretesCargasTable.status, "aprovado"),
      isNull(fretesCargasTable.motoristaId),
    ))
    .returning();

  if (!row) {
    return res.status(409).json({ error: "Essa carga já foi aceita por outro motorista ou não está mais disponível." });
  }
  return res.json(row);
});

// Motorista atualiza a posição ao vivo enquanto está com a carga.
router.patch("/tenants/:tenantId/fretes/cargas/:id/localizacao", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const userId = (req as any).user?.sub as string;

  const { lat, lng } = req.body as { lat?: number; lng?: number };
  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(422).json({ error: "lat e lng são obrigatórios" });
  }

  const conditions = [eq(fretesCargasTable.id, id), eq(fretesCargasTable.tenantId, tenantId)];
  if (!isSuperAdmin(req)) conditions.push(eq(fretesCargasTable.motoristaId, userId));

  const [row] = await db.update(fretesCargasTable)
    .set({ localizacaoLat: lat, localizacaoLng: lng, localizacaoAtualizadaEm: new Date() })
    .where(and(...conditions))
    .returning();

  if (!row) return res.status(404).json({ error: "Carga não encontrada ou você não é o motorista responsável" });

  // Rastro do trajeto — cada atualização vira um ponto no histórico, além
  // de atualizar a posição atual acima.
  await db.insert(fretesLocalizacoesHistoricoTable).values({ tenantId, cargaId: id, lat, lng });

  return res.json(withEta(row));
});

// Rastro completo do trajeto — usado pra desenhar a linha percorrida no
// mapa, não só o ponto atual.
router.get("/tenants/:tenantId/fretes/cargas/:id/localizacao-historico", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const pontos = await db.select({ lat: fretesLocalizacoesHistoricoTable.lat, lng: fretesLocalizacoesHistoricoTable.lng, registradoEm: fretesLocalizacoesHistoricoTable.registradoEm })
    .from(fretesLocalizacoesHistoricoTable)
    .where(and(eq(fretesLocalizacoesHistoricoTable.cargaId, id), eq(fretesLocalizacoesHistoricoTable.tenantId, tenantId)))
    .orderBy(fretesLocalizacoesHistoricoTable.registradoEm);

  return res.json(pontos);
});

router.get("/tenants/:tenantId/fretes/cargas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(fretesCargasTable.tenantId, tenantId)];
  if (req.query.status) conditions.push(eq(fretesCargasTable.status, req.query.status as any));
  if (req.query.veiculoId) conditions.push(eq(fretesCargasTable.veiculoId, req.query.veiculoId as string));

  const cargas = await db.select().from(fretesCargasTable)
    .where(and(...conditions))
    .orderBy(desc(fretesCargasTable.createdAt));

  const clienteIds = [...new Set(cargas.map((c) => c.clienteId))];
  const veiculoIds = [...new Set(cargas.map((c) => c.veiculoId).filter(Boolean) as string[])];
  const motoristaIds = [...new Set(cargas.map((c) => c.motoristaId).filter(Boolean) as string[])];

  const [clientes, veiculos, motoristas] = await Promise.all([
    clienteIds.length
      ? db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone }).from(leadsTable)
          .where(eq(leadsTable.tenantId, tenantId))
      : Promise.resolve([]),
    veiculoIds.length
      ? db.select().from(fretesVeiculosTable).where(eq(fretesVeiculosTable.tenantId, tenantId))
      : Promise.resolve([]),
    motoristaIds.length
      ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
          .where(eq(usersTable.tenantId, tenantId))
      : Promise.resolve([]),
  ]);

  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));
  const veiculoMap = Object.fromEntries(veiculos.map((v) => [v.id, v]));
  const motoristaMap = Object.fromEntries(motoristas.map((m) => [m.id, m]));

  const result = cargas.map((c) => ({
    ...withEta(c),
    cliente: clienteMap[c.clienteId] ?? null,
    veiculo: c.veiculoId ? veiculoMap[c.veiculoId] ?? null : null,
    motorista: c.motoristaId ? motoristaMap[c.motoristaId] ?? null : null,
  }));

  return res.json(result);
});

router.post("/tenants/:tenantId/fretes/cargas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { clienteId, enderecoColeta, enderecoEntrega } = req.body as {
    clienteId: string;
    enderecoColeta: string;
    enderecoEntrega: string;
  };

  if (!clienteId || !enderecoColeta || !enderecoEntrega) {
    return res.status(422).json({ error: "clienteId, enderecoColeta e enderecoEntrega são obrigatórios" });
  }

  const body = { ...req.body, tenantId } as Record<string, unknown>;

  // Cotação automática — só entra em ação se ninguém já informou um valor.
  // Usa as coordenadas já marcadas no mapa quando existirem; senão,
  // geocodifica o texto do endereço (best-effort — se falhar, segue sem
  // preço sugerido, o despachante preenche na mão como já era antes).
  if (!body.valorCotado) {
    try {
      const coletaLatLng = (typeof body.enderecoColetaLat === "number" && typeof body.enderecoColetaLng === "number")
        ? { lat: body.enderecoColetaLat, lng: body.enderecoColetaLng }
        : await geocodeAddress(enderecoColeta);
      const entregaLatLng = (typeof body.enderecoEntregaLat === "number" && typeof body.enderecoEntregaLng === "number")
        ? { lat: body.enderecoEntregaLat, lng: body.enderecoEntregaLng }
        : await geocodeAddress(enderecoEntrega);

      if (coletaLatLng && entregaLatLng) {
        const km = distanceKm(coletaLatLng, entregaLatLng);
        const pesoKg = body.pesoKg ? Number(body.pesoKg) : null;
        body.valorCotado = String(estimarValorFrete(km, pesoKg));
        // Preenche as coordenadas também, se ainda não vieram — ajuda o
        // ETA a funcionar desde a primeira carga, sem precisar marcar no mapa.
        if (typeof body.enderecoColetaLat !== "number") { body.enderecoColetaLat = coletaLatLng.lat; body.enderecoColetaLng = coletaLatLng.lng; }
        if (typeof body.enderecoEntregaLat !== "number") { body.enderecoEntregaLat = entregaLatLng.lat; body.enderecoEntregaLng = entregaLatLng.lng; }
      }
    } catch (err) {
      req.log?.warn({ err }, "fretes: cotação automática falhou (não bloqueia criação)");
    }
  }

  const [carga] = await db.insert(fretesCargasTable)
    .values(body as any)
    .returning();

  return res.status(201).json(carga);
});

router.get("/tenants/:tenantId/fretes/cargas/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(fretesCargasTable)
    .where(and(eq(fretesCargasTable.id, id), eq(fretesCargasTable.tenantId, tenantId)));
  if (!row) return res.status(404).json({ error: "Carga not found" });
  return res.json(withEta(row));
});

router.patch("/tenants/:tenantId/fretes/cargas/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(fretesCargasTable)
    .set({ ...req.body, updatedAt: new Date() } as any)
    .where(and(eq(fretesCargasTable.id, id), eq(fretesCargasTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Carga not found" });
  return res.json(row);
});

router.patch("/tenants/:tenantId/fretes/cargas/:id/status", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { status } = req.body as { status: string };
  const statusValidos = ["cotacao_pendente", "cotado", "aprovado", "coletado", "em_transito", "entregue", "cancelado"] as const;
  if (!statusValidos.includes(status as any)) {
    return res.status(422).json({ error: `status inválido. Valores: ${statusValidos.join(", ")}` });
  }

  // Foto de prova é obrigatória de verdade — não só na tela. Aceita tanto a
  // foto já salva na carga (fluxo normal: PATCH da carga primeiro, depois
  // avança o status) quanto vinda junto nesse mesmo request.
  const photoField = status === "coletado" ? "fotosColetaUrls" : status === "entregue" ? "fotosEntregaUrls" : null;
  if (photoField) {
    const incomingPhotos = (req.body as any)[photoField];
    const hasIncomingPhotos = Array.isArray(incomingPhotos) && incomingPhotos.length > 0;
    if (!hasIncomingPhotos) {
      const [current] = await db.select({ photos: fretesCargasTable[photoField] }).from(fretesCargasTable)
        .where(and(eq(fretesCargasTable.id, id), eq(fretesCargasTable.tenantId, tenantId)));
      const hasStoredPhotos = Array.isArray(current?.photos) && current.photos.length > 0;
      if (!hasStoredPhotos) {
        const etapa = status === "coletado" ? "coleta" : "entrega";
        return res.status(422).json({ error: `É preciso enviar ao menos uma foto de prova da ${etapa} antes de avançar pra esse status.` });
      }
    }
  }

  const updates: Record<string, unknown> = { status, updatedAt: new Date() };
  if (photoField && Array.isArray((req.body as any)[photoField])) updates[photoField] = (req.body as any)[photoField];
  if (status === "coletado") updates.dataColetaReal = new Date();
  if (status === "entregue") updates.dataEntregaReal = new Date();

  const [row] = await db.update(fretesCargasTable)
    .set(updates)
    .where(and(eq(fretesCargasTable.id, id), eq(fretesCargasTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Carga not found" });

  // Notificação por WhatsApp — melhor esforço, nunca bloqueia a resposta.
  // Manda pro contato de entrega (é quem está esperando a carga chegar);
  // se não tiver, cai pro contato de coleta.
  const telefoneAviso = row.contatoEntregaTelefone || row.contatoColetaTelefone;
  const mensagensPorStatus: Partial<Record<string, string>> = {
    aprovado: `Seu frete foi aprovado e já está na fila pra um motorista aceitar. Endereço de entrega: ${row.enderecoEntrega}.`,
    coletado: `Sua carga foi coletada e está a caminho! Endereço de entrega: ${row.enderecoEntrega}.`,
    em_transito: `Sua carga está em trânsito.`,
    entregue: `Sua carga foi entregue! Se puder, avalie a entrega pelo link de acompanhamento.`,
    cancelado: `O frete pra ${row.enderecoEntrega} foi cancelado.`,
  };
  const mensagem = mensagensPorStatus[status];
  if (telefoneAviso && mensagem) {
    sendDirectWhatsAppMessage(tenantId, telefoneAviso, mensagem, req.log as any).catch((err) => {
      req.log?.warn({ err, cargaId: id, status }, "fretes: notificação de status falhou (não bloqueia)");
    });
  }

  return res.json(row);
});

// ─── Rastreio público (sem login) ──────────────────────────────────────────────
// O id da carga já é um UUID aleatório — funciona como o "token" do link,
// igual Uber/iFood: quem tem o link vê o rastreio, sem precisar de senha.
// Só expõe o necessário pro cliente acompanhar — nada de dado interno do tenant.

fretesPublicRouter.get("/public/fretes/:id", async (req, res) => {
  const id = req.params.id as string;
  const [row] = await db.select({
    status: fretesCargasTable.status,
    enderecoColeta: fretesCargasTable.enderecoColeta,
    enderecoEntrega: fretesCargasTable.enderecoEntrega,
    enderecoEntregaLat: fretesCargasTable.enderecoEntregaLat,
    enderecoEntregaLng: fretesCargasTable.enderecoEntregaLng,
    localizacaoLat: fretesCargasTable.localizacaoLat,
    localizacaoLng: fretesCargasTable.localizacaoLng,
    localizacaoAtualizadaEm: fretesCargasTable.localizacaoAtualizadaEm,
    dataEntregaPrevista: fretesCargasTable.dataEntregaPrevista,
    dataEntregaReal: fretesCargasTable.dataEntregaReal,
    motoristaId: fretesCargasTable.motoristaId,
    avaliacaoNota: fretesCargasTable.avaliacaoNota,
  }).from(fretesCargasTable).where(eq(fretesCargasTable.id, id));

  if (!row) return res.status(404).json({ error: "Entrega não encontrada" });

  let motoristaNome: string | null = null;
  if (row.motoristaId) {
    const [m] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.motoristaId));
    motoristaNome = m?.name ?? null;
  }

  const { motoristaId, ...safeRow } = row;
  return res.json({ ...withEta({ ...safeRow, motoristaId } as any), motoristaNome });
});

// Avaliação só é aceita depois de entregue, e só uma vez.
fretesPublicRouter.post("/public/fretes/:id/avaliar", async (req, res) => {
  const id = req.params.id as string;
  const { nota, comentario } = req.body as { nota?: number; comentario?: string };

  if (!nota || nota < 1 || nota > 5) {
    return res.status(422).json({ error: "nota deve ser um número de 1 a 5" });
  }

  const [existing] = await db.select({ status: fretesCargasTable.status, avaliacaoNota: fretesCargasTable.avaliacaoNota })
    .from(fretesCargasTable).where(eq(fretesCargasTable.id, id));
  if (!existing) return res.status(404).json({ error: "Entrega não encontrada" });
  if (existing.status !== "entregue") return res.status(422).json({ error: "Só é possível avaliar entregas já concluídas." });
  if (existing.avaliacaoNota) return res.status(409).json({ error: "Essa entrega já foi avaliada." });

  const [row] = await db.update(fretesCargasTable)
    .set({ avaliacaoNota: String(Math.round(nota)), avaliacaoComentario: comentario ?? null, avaliadoEm: new Date() })
    .where(eq(fretesCargasTable.id, id))
    .returning({ id: fretesCargasTable.id, avaliacaoNota: fretesCargasTable.avaliacaoNota });

  return res.json(row);
});

// ─── Rotas com múltiplas paradas ────────────────────────────────────────────────
// Agrupa várias cargas do mesmo motorista numa sequência, em vez de uma
// viagem por carga. A ordem é decidida por quem despacha (arrasta/reordena
// na tela) — não faz otimização automática de trajeto por enquanto.

router.get("/tenants/:tenantId/fretes/rotas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(fretesRotasTable.tenantId, tenantId)];
  if (req.query.status) conditions.push(eq(fretesRotasTable.status, req.query.status as any));

  const rotas = await db.select().from(fretesRotasTable).where(and(...conditions)).orderBy(desc(fretesRotasTable.createdAt));
  if (rotas.length === 0) return res.json([]);

  const rotaIds = rotas.map((r) => r.id);
  const cargas = await db.select().from(fretesCargasTable)
    .where(and(eq(fretesCargasTable.tenantId, tenantId), inArray(fretesCargasTable.rotaId, rotaIds)));

  const cargasPorRota = new Map<string, typeof cargas>();
  for (const c of cargas) {
    if (!c.rotaId) continue;
    const arr = cargasPorRota.get(c.rotaId) ?? [];
    arr.push(c);
    cargasPorRota.set(c.rotaId, arr);
  }

  return res.json(rotas.map((r) => ({
    ...r,
    cargas: (cargasPorRota.get(r.id) ?? []).sort((a, b) => Number(a.ordemNaRota ?? 0) - Number(b.ordemNaRota ?? 0)),
  })));
});

// Cria a rota e já vincula as cargas informadas, na ordem enviada.
router.post("/tenants/:tenantId/fretes/rotas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { nome, motoristaId, veiculoId, cargaIds } = req.body as {
    nome?: string; motoristaId?: string; veiculoId?: string; cargaIds?: string[];
  };
  if (!Array.isArray(cargaIds) || cargaIds.length < 2) {
    return res.status(422).json({ error: "Uma rota precisa de pelo menos 2 cargas — pra 1 carga só, use o fluxo normal." });
  }

  const [rota] = await db.insert(fretesRotasTable)
    .values({ tenantId, nome: nome ?? null, motoristaId: motoristaId ?? null, veiculoId: veiculoId ?? null })
    .returning();

  for (let i = 0; i < cargaIds.length; i++) {
    await db.update(fretesCargasTable)
      .set({ rotaId: rota.id, ordemNaRota: String(i + 1), motoristaId: motoristaId ?? undefined, veiculoId: veiculoId ?? undefined, updatedAt: new Date() })
      .where(and(eq(fretesCargasTable.id, cargaIds[i]!), eq(fretesCargasTable.tenantId, tenantId)));
  }

  return res.status(201).json(rota);
});

router.patch("/tenants/:tenantId/fretes/rotas/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { cargaIds, ...rotaUpdates } = req.body as { cargaIds?: string[]; [k: string]: unknown };

  const [row] = await db.update(fretesRotasTable)
    .set({ ...rotaUpdates, updatedAt: new Date() } as any)
    .where(and(eq(fretesRotasTable.id, id), eq(fretesRotasTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Rota not found" });

  // Reordenar as paradas — envia a lista de cargaIds na nova ordem desejada.
  if (Array.isArray(cargaIds)) {
    for (let i = 0; i < cargaIds.length; i++) {
      await db.update(fretesCargasTable)
        .set({ ordemNaRota: String(i + 1), updatedAt: new Date() })
        .where(and(eq(fretesCargasTable.id, cargaIds[i]!), eq(fretesCargasTable.tenantId, tenantId), eq(fretesCargasTable.rotaId, id)));
    }
  }

  return res.json(row);
});

export default router;
