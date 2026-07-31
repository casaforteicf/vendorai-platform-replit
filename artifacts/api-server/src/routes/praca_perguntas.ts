import { Router, type IRouter } from "express";

const router: IRouter = Router();

const PRACA_API_BASE_URL = process.env.PRACA_API_BASE_URL || "https://pra-aai-production.up.railway.app/api";

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}

// Proxy server-to-server pro Praça.ai — o lojista opera tudo pelo Vendor.ai,
// então o frontend nunca fala direto com o domínio do Praça.ai (evita CORS
// e mantém a autenticação só do lado do Vendor.ai).
router.get("/tenants/:tenantId/praca-perguntas-pendentes", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  try {
    const response = await fetch(`${PRACA_API_BASE_URL}/tenants/${tenantId}/perguntas-pendentes`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return res.status(502).json({ error: "Praça.ai não respondeu corretamente." });
    }
    const perguntas = await response.json();
    return res.json(perguntas);
  } catch (err) {
    console.error("[praca-perguntas] erro ao buscar fila do Praça.ai:", err);
    return res.status(502).json({ error: "Não foi possível carregar as perguntas do Praça.ai agora." });
  }
});

router.post("/tenants/:tenantId/praca-perguntas-pendentes/:perguntaId/responder", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const perguntaId = req.params.perguntaId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { resposta } = req.body as { resposta?: string };
  if (!resposta) return res.status(422).json({ error: "resposta é obrigatória" });

  try {
    const response = await fetch(`${PRACA_API_BASE_URL}/perguntas/${perguntaId}/responder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resposta, vendorId: tenantId }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return res.status(response.status).json(errBody);
    }
    const updated = await response.json();
    return res.json(updated);
  } catch (err) {
    console.error("[praca-perguntas] erro ao responder no Praça.ai:", err);
    return res.status(502).json({ error: "Não foi possível enviar a resposta agora." });
  }
});

export default router;
