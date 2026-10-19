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

router.get("/praca-disputas", async (req, res): Promise<void> => {
  const tenantId = tenantFromSession(req);
  if (!tenantId) return void res.status(403).json({ error: "Acesse com uma conta de lojista." });
  const query = new URLSearchParams({ tenantId });
  await forward("/internal/vendor-disputes?" + query.toString(), { method: "GET" }, res);
});

router.patch("/praca-disputas/:id/resposta", async (req, res): Promise<void> => {
  const tenantId = tenantFromSession(req);
  if (!tenantId) return void res.status(403).json({ error: "Acesse com uma conta de lojista." });
  const id = String(req.params.id ?? "").trim();
  const response = typeof req.body?.response === "string" ? req.body.response.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || response.length < 12 || response.length > 3000) {
    return void res.status(422).json({ error: "Escreva uma resposta de 12 a 3.000 caracteres." });
  }
  await forward("/internal/vendor-disputes/" + encodeURIComponent(id) + "/response", {
    method: "PATCH",
    body: JSON.stringify({ tenantId, response }),
  }, res);
});

router.post("/praca-pedidos/:type/:id/comprovante", async (req,res): Promise<void> => {
  const tenantId=tenantFromSession(req),type=String(req.params.type),id=String(req.params.id);
  if(!tenantId) return void res.status(403).json({error:"Acesse com uma conta de lojista."});
  if(!["quote","round"].includes(type)||!/^[0-9a-f-]{36}$/i.test(id)) return void res.status(422).json({error:"Pedido inválido."});
  const {photo,receivedBy,allItemsDelivered}=req.body??{};
  if(typeof photo!=="string"||photo.length>1000000) return void res.status(422).json({error:"Foto inválida ou muito grande."});
  await forward("/internal/vendor-orders/"+type+"/"+encodeURIComponent(id)+"/delivery-report",{
    method:"POST",body:JSON.stringify({tenantId,photo,receivedBy,allItemsDelivered})
  },res);
});

router.get("/praca-pedidos/:type/:id/historico",async(req,res):Promise<void>=>{
 const tenantId=tenantFromSession(req),type=String(req.params.type),id=String(req.params.id);
 if(!tenantId)return void res.status(403).json({error:"Acesse com uma conta de lojista."});
 if(!["quote","round"].includes(type)||!/^[0-9a-f-]{36}$/i.test(id))return void res.status(422).json({error:"Pedido inválido."});
 const query=new URLSearchParams({tenantId});
 if(typeof req.query.after==="string")query.set("after",req.query.after);
 await forward("/internal/vendor-orders/"+type+"/"+encodeURIComponent(id)+"/history?"+query.toString(),{method:"GET"},res);
});

router.get("/praca-subpedidos",async(req,res):Promise<void>=>{
 const tenantId=tenantFromSession(req);if(!tenantId)return void res.status(403).json({error:"Acesse com uma conta de lojista."});
 await forward("/internal/vendor-suborders?"+new URLSearchParams({tenantId}),{method:"GET"},res);
});
router.post("/praca-subpedidos/:id/comprovantes",async(req,res):Promise<void>=>{
 const tenantId=tenantFromSession(req);if(!tenantId)return void res.status(403).json({error:"Acesse com uma conta de lojista."});
 const id=String(req.params.id),{photo,receivedBy,items,requestKey}=req.body??{};
 if(!/^[0-9a-f-]{36}$/i.test(id)||typeof photo!=="string"||photo.length>1000000||!Array.isArray(items)||items.length>100)return void res.status(422).json({error:"Comprovante inválido."});
 await forward("/internal/vendor-suborders/"+encodeURIComponent(id)+"/receipts",{method:"POST",body:JSON.stringify({tenantId,photo,receivedBy,items,requestKey})},res);
});

router.get("/praca-subpedidos/:id/historico",async(req,res):Promise<void>=>{
 const tenantId=tenantFromSession(req),id=String(req.params.id),after=typeof req.query.after==="string"?req.query.after:"0";
 if(!tenantId)return void res.status(403).json({error:"Acesse com uma conta de lojista."});
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9]{1,18}$/.test(after))return void res.status(422).json({error:"Consulta inválida."});
 await forward("/internal/vendor-suborders/"+encodeURIComponent(id)+"/history?"+new URLSearchParams({tenantId,after}),{method:"GET"},res);
});
router.get("/praca-financeiro",async(req,res):Promise<void>=>{
 const tenantId=tenantFromSession(req);if(!tenantId)return void res.status(403).json({error:"Acesse com uma conta de lojista."});
 await forward("/internal/vendor-financial-profile?"+new URLSearchParams({tenantId}),{method:"GET"},res);
});
router.post("/praca-financeiro",async(req,res):Promise<void>=>{
 const tenantId=tenantFromSession(req);if(!tenantId)return void res.status(403).json({error:"Acesse com uma conta de lojista."});
 const allowed=["name","email","cpfCnpj","mobilePhone","incomeValue","address","addressNumber","complement","province","postalCode","companyType","taxRegime"];
 const body=Object.fromEntries(allowed.filter((key)=>req.body?.[key]!==undefined).map((key)=>[key,req.body[key]]));
 await forward("/internal/vendor-financial-profile",{method:"POST",body:JSON.stringify({tenantId,...body})},res);
});
router.post("/praca-pedidos/:type/:id/entregas-parciais",async(req,res):Promise<void>=>{
 const tenantId=tenantFromSession(req),type=String(req.params.type),id=String(req.params.id);
 if(!tenantId)return void res.status(403).json({error:"Acesse com uma conta de lojista."});
 if(!["quote","round"].includes(type)||!/^[0-9a-f-]{36}$/i.test(id))return void res.status(422).json({error:"Pedido inválido."});
 const {requestKey,receivedBy,items}=req.body??{};
 await forward("/internal/vendor-orders/"+type+"/"+encodeURIComponent(id)+"/delivery-receipts",{method:"POST",body:JSON.stringify({tenantId,requestKey,receivedBy,items})},res);
});
export default router;
