import { Router, type IRouter } from "express";

const router: IRouter = Router();

function tenantFromSession(req: any): string | null {
  const tenantId = req.user?.tenantId;
  return typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : null;
}

function config(res: any): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.PRACA_AI_INTERNAL_API_URL?.trim().replace(/\/+$/, "");
  const token = process.env.PRACA_ROUNDS_VENDOR_TOKEN?.trim();
  if (!baseUrl || !token || token.length < 32) {
    res.status(503).json({ error: "A integração com o Praça.ai ainda não está configurada." });
    return null;
  }
  return { baseUrl, token };
}

async function forward(path: string, init: RequestInit, res: any): Promise<void> {
  const settings = config(res);
  if (!settings) return;
  try {
    const response = await fetch(settings.baseUrl + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-praca-rounds-token": settings.token,
        ...(init.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    res.status(response.status).set("Cache-Control", "no-store").json(payload);
  } catch (error) {
    console.error("[praca-rounds] Praça.ai upstream request failed:", error);
    res.status(502).json({ error: "Não foi possível conectar ao Praça.ai." });
  }
}

// Protected by the global authenticate middleware in routes/index.ts.
// Tenant identity always comes from the signed AppVendor session.
router.get("/praca-rodadas/opportunities", async (req, res): Promise<void> => {
  const tenantId = tenantFromSession(req);
  if (!tenantId) return void res.status(403).json({ error: "Acesse com uma conta de lojista." });
  const query = new URLSearchParams({ tenantId });
  await forward("/internal/rounds?" + query.toString(), { method: "GET" }, res);
});

router.post("/praca-rodadas/opportunities/:id/bids", async (req, res): Promise<void> => {
  const tenantId = tenantFromSession(req);
  if (!tenantId) return void res.status(403).json({ error: "Acesse com uma conta de lojista." });
  const roundId = String(req.params.id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(roundId)) return void res.status(422).json({ error: "Lote inválido." });
  const { unitPrice, freight, deliveryDays, terms } = req.body ?? {};
  await forward("/internal/rounds/" + encodeURIComponent(roundId) + "/bids", {
    method: "POST",
    body: JSON.stringify({ tenantId, unitPrice, freight, deliveryDays, terms }),
  }, res);
});


router.get("/praca-cotacoes/opportunities", async (req, res): Promise<void> => {
  const tenantId = tenantFromSession(req);
  if (!tenantId) return void res.status(403).json({ error: "Acesse com uma conta de lojista." });
  const query = new URLSearchParams({ tenantId });
  await forward("/internal/quotes?" + query.toString(), { method: "GET" }, res);
});

router.post("/praca-cotacoes/opportunities/:id/offers", async (req, res): Promise<void> => {
  const tenantId = tenantFromSession(req);
  if (!tenantId) return void res.status(403).json({ error: "Acesse com uma conta de lojista." });
  const quoteId = String(req.params.id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return void res.status(422).json({ error: "Cotação inválida." });
  const { items, freight, deliveryDays, terms } = req.body ?? {};
  await forward("/internal/quotes/" + encodeURIComponent(quoteId) + "/offers", {
    method: "POST",
    body: JSON.stringify({ tenantId, items, freight, deliveryDays, terms }),
  }, res);
});

router.get("/praca-pedidos", async (req, res): Promise<void> => {
  const tenantId = tenantFromSession(req);
  if (!tenantId) return void res.status(403).json({ error: "Acesse com uma conta de lojista." });
  const query = new URLSearchParams({ tenantId });
  await forward("/internal/vendor-orders?" + query.toString(), { method: "GET" }, res);
});

router.patch("/praca-pedidos/:type/:id/expedicao", async (req, res): Promise<void> => {
  const tenantId = tenantFromSession(req);
  if (!tenantId) return void res.status(403).json({ error: "Acesse com uma conta de lojista." });
  const type = String(req.params.type ?? "");
  const orderId = String(req.params.id ?? "").trim();
  if (!["quote", "round"].includes(type) || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return void res.status(422).json({ error: "Pedido inválido." });
  }
  const { status, deliveryMode, carrier, trackingCode, sellerNote } = req.body ?? {};
  await forward("/internal/vendor-orders/" + encodeURIComponent(type) + "/" + encodeURIComponent(orderId) + "/fulfillment", {
    method: "PATCH",
    body: JSON.stringify({ tenantId, status, deliveryMode, carrier, trackingCode, sellerNote }),
  }, res);
});

export default router;
