import { Router, type IRouter } from "express";
import { and, eq, desc, gte, lte } from "drizzle-orm";
import {
  db,
  veiculosEstoqueTable,
  veiculosTestDrivesTable,
  leadsTable,
  produtosCatalogoTable,
  categoriasProdutoTable,
  type VeiculosEstoque,
} from "@workspace/db";
import { captureLeadFeatureSnapshot } from "../lib/mlFeatureStore.js";

const router: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}
function canAccess(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || tid(req) === tenantId;
}

/**
 * Estoque de Veículos é a fonte única de verdade — essa função mantém o
 * catálogo genérico (o que o Praça.ai de fato exibe) em sincronia. Um
 * veículo só fica visível no Praça.ai quando está 'disponivel' E com
 * vistoria confirmada (mesma regra que já trava o próprio anúncio interno).
 * Fora disso, o produto vinculado é desativado (não apagado — preserva
 * histórico de pedidos/avaliações já feitos em cima dele).
 */
async function syncVeiculoToProdutoCatalogo(veiculo: VeiculosEstoque): Promise<void> {
  const publicavel = veiculo.status === "disponivel" && veiculo.vistoriaRealizada;

  if (!publicavel) {
    if (veiculo.produtoCatalogoId) {
      await db.update(produtosCatalogoTable)
        .set({ ativo: false })
        .where(eq(produtosCatalogoTable.id, veiculo.produtoCatalogoId));
    }
    return;
  }

  let [categoria] = await db.select().from(categoriasProdutoTable)
    .where(and(eq(categoriasProdutoTable.tenantId, veiculo.tenantId), eq(categoriasProdutoTable.nome, "Veículos")));
  if (!categoria) {
    [categoria] = await db.insert(categoriasProdutoTable)
      .values({ tenantId: veiculo.tenantId, nome: "Veículos" })
      .returning();
  }

  const nome = `${veiculo.marca} ${veiculo.modelo}${veiculo.anoModelo ? ` ${veiculo.anoModelo}` : ""}`.trim();
  const todasFotos = [
    ...(veiculo.fotos ?? []),
    ...(veiculo.fotosDetalhes ?? []).map((f) => f.url),
  ];
  const detalhes = [
    veiculo.km != null ? `${veiculo.km.toLocaleString("pt-BR")} km` : null,
    veiculo.combustivel ?? null,
    veiculo.cambio ?? null,
    veiculo.cor ?? null,
    veiculo.anoFabricacao ? `${veiculo.anoFabricacao}/${veiculo.anoModelo ?? veiculo.anoFabricacao}` : null,
  ].filter(Boolean).join(" · ");
  const descricao = [detalhes, veiculo.descricao].filter(Boolean).join("\n\n");

  const payload = {
    tenantId: veiculo.tenantId,
    nome,
    descricao: descricao || null,
    categoriaId: categoria!.id,
    marca: veiculo.marca,
    precoBase: String(veiculo.valorPromocional ?? veiculo.valor),
    ...(veiculo.valorPromocional ? { precoPromocional: String(veiculo.valorPromocional) } : {}),
    imagemUrl: todasFotos[0] ?? null,
    imagens: todasFotos,
    videoUrl: veiculo.videos?.[0] ?? null,
    ativo: true,
    destaque: veiculo.destaque,
  };

  if (veiculo.produtoCatalogoId) {
    await db.update(produtosCatalogoTable).set(payload).where(eq(produtosCatalogoTable.id, veiculo.produtoCatalogoId));
  } else {
    const [produto] = await db.insert(produtosCatalogoTable).values(payload as any).returning();
    await db.update(veiculosEstoqueTable).set({ produtoCatalogoId: produto!.id }).where(eq(veiculosEstoqueTable.id, veiculo.id));
  }
}

// ─── Estoque ──────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/veiculos/estoque", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(veiculosEstoqueTable.tenantId, tenantId)];
  if (req.query.status) conditions.push(eq(veiculosEstoqueTable.status, req.query.status as any));
  else conditions.push(eq(veiculosEstoqueTable.status, "disponivel")); // default público: só disponíveis
  if (req.query.marca) conditions.push(eq(veiculosEstoqueTable.marca, req.query.marca as string));

  const rows = await db.select().from(veiculosEstoqueTable)
    .where(and(...conditions))
    .orderBy(desc(veiculosEstoqueTable.destaque), desc(veiculosEstoqueTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/veiculos/estoque", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  // Mitigação de risco de procedência: anúncio nunca nasce 'disponivel'
  // direto — mesmo que o body peça, força 'inativo' até a vistoria ser
  // confirmada via PATCH /estoque/:id/vistoria.
  const body = { ...req.body, tenantId };
  if (body.status === "disponivel" && !body.vistoriaRealizada) {
    body.status = "inativo";
  }

  const [row] = await db.insert(veiculosEstoqueTable)
    .values(body as any)
    .returning();
  await syncVeiculoToProdutoCatalogo(row!);
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/veiculos/estoque/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(veiculosEstoqueTable)
    .where(and(eq(veiculosEstoqueTable.id, id), eq(veiculosEstoqueTable.tenantId, tenantId)));
  if (!row) return res.status(404).json({ error: "Veículo not found" });
  return res.json(row);
});

router.put("/tenants/:tenantId/veiculos/estoque/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select({ vistoriaRealizada: veiculosEstoqueTable.vistoriaRealizada })
    .from(veiculosEstoqueTable)
    .where(and(eq(veiculosEstoqueTable.id, id), eq(veiculosEstoqueTable.tenantId, tenantId)));
  if (!existing) return res.status(404).json({ error: "Veículo not found" });

  const body = { ...req.body };
  // Mesma regra na edição: não deixa virar 'disponivel' sem vistoria já
  // confirmada no banco (nem se o body tentar mandar os dois juntos —
  // vistoriaRealizada só muda de verdade pelo endpoint dedicado).
  if (body.status === "disponivel" && !existing.vistoriaRealizada) {
    return res.status(422).json({ error: "Veículo precisa de vistoria realizada antes de ficar disponível no anúncio." });
  }
  delete body.vistoriaRealizada; // muda só via /vistoria

  const [row] = await db.update(veiculosEstoqueTable)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(veiculosEstoqueTable.id, id), eq(veiculosEstoqueTable.tenantId, tenantId)))
    .returning();
  if (row) await syncVeiculoToProdutoCatalogo(row);
  return res.json(row);
});

// Confirmar vistoria — único jeito de destravar o anúncio pra 'disponivel'.
router.patch("/tenants/:tenantId/veiculos/estoque/:id/vistoria", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { vistoriaLaudoUrl } = req.body as { vistoriaLaudoUrl?: string };
  if (!vistoriaLaudoUrl) return res.status(422).json({ error: "vistoriaLaudoUrl é obrigatório" });

  const [row] = await db.update(veiculosEstoqueTable)
    .set({ vistoriaRealizada: true, vistoriaLaudoUrl, updatedAt: new Date() })
    .where(and(eq(veiculosEstoqueTable.id, id), eq(veiculosEstoqueTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Veículo not found" });
  await syncVeiculoToProdutoCatalogo(row);
  return res.json(row);
});

router.delete("/tenants/:tenantId/veiculos/estoque/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(veiculosEstoqueTable)
    .set({ status: "inativo", updatedAt: new Date() })
    .where(and(eq(veiculosEstoqueTable.id, id), eq(veiculosEstoqueTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Veículo not found" });
  await syncVeiculoToProdutoCatalogo(row);
  return res.json(row);
});

// ─── Test-drives ──────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/veiculos/test-drives", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(veiculosTestDrivesTable.tenantId, tenantId)];
  if (req.query.veiculoId) conditions.push(eq(veiculosTestDrivesTable.veiculoId, req.query.veiculoId as string));
  if (req.query.status) conditions.push(eq(veiculosTestDrivesTable.status, req.query.status as any));
  if (req.query.data) {
    const dayStart = new Date(`${req.query.data}T00:00:00`);
    const dayEnd   = new Date(`${req.query.data}T23:59:59.999`);
    conditions.push(gte(veiculosTestDrivesTable.dataHora, dayStart));
    conditions.push(lte(veiculosTestDrivesTable.dataHora, dayEnd));
  }

  const testDrives = await db.select().from(veiculosTestDrivesTable)
    .where(and(...conditions))
    .orderBy(veiculosTestDrivesTable.dataHora);

  const veiculoIds = [...new Set(testDrives.map((t) => t.veiculoId))];
  const clienteIds = [...new Set(testDrives.map((t) => t.clienteId))];

  const [veiculos, clientes] = await Promise.all([
    veiculoIds.length
      ? db.select().from(veiculosEstoqueTable).where(eq(veiculosEstoqueTable.tenantId, tenantId))
      : Promise.resolve([]),
    clienteIds.length
      ? db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone }).from(leadsTable)
          .where(eq(leadsTable.tenantId, tenantId))
      : Promise.resolve([]),
  ]);

  const veiculoMap = Object.fromEntries(veiculos.map((v) => [v.id, v]));
  const clienteMap = Object.fromEntries(clientes.map((c) => [c.id, c]));

  const result = testDrives.map((t) => ({
    ...t,
    veiculo: veiculoMap[t.veiculoId] ?? null,
    cliente: clienteMap[t.clienteId] ?? null,
  }));

  return res.json(result);
});

router.post("/tenants/:tenantId/veiculos/test-drives", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { veiculoId, clienteId, dataHora } = req.body as {
    veiculoId: string;
    clienteId: string;
    dataHora: string;
  };

  if (!veiculoId || !clienteId || !dataHora) {
    return res.status(422).json({ error: "veiculoId, clienteId e dataHora são obrigatórios" });
  }

  const [veiculo] = await db.select({ id: veiculosEstoqueTable.id, vendedorResponsavelId: veiculosEstoqueTable.vendedorResponsavelId })
    .from(veiculosEstoqueTable)
    .where(and(eq(veiculosEstoqueTable.id, veiculoId), eq(veiculosEstoqueTable.tenantId, tenantId)));

  if (!veiculo) return res.status(404).json({ error: "Veículo not found" });

  const [testDrive] = await db.insert(veiculosTestDrivesTable)
    .values({
      tenantId,
      veiculoId,
      clienteId,
      vendedorId: req.body.vendedorId ?? veiculo.vendedorResponsavelId ?? null,
      dataHora: new Date(dataHora),
    })
    .returning();

  return res.status(201).json(testDrive);
});

router.patch("/tenants/:tenantId/veiculos/test-drives/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const id = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(veiculosTestDrivesTable)
    .set(req.body as any)
    .where(and(eq(veiculosTestDrivesTable.id, id), eq(veiculosTestDrivesTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Test-drive not found" });

  // Feature store — test-drive é o gatilho de maior sinal de intenção pra
  // revenda de veículos (o documento que o usuário mandou chama isso de
  // "lead quente"). Captura só quando o status muda pra realizado.
  if (req.body?.status === "realizado" && row.clienteId) {
    captureLeadFeatureSnapshot(tenantId, row.clienteId, "test_drive_realizado", { veiculoId: row.veiculoId }, req.log).catch(() => {});
  }

  return res.json(row);
});

export default router;
