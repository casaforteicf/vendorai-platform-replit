import { Router, type IRouter } from "express";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// Rota TEMPORÁRIA -- cria o domínio appvendorai.com no Resend via API
// (usando a RESEND_API_KEY já configurada no Railway, sem precisar que
// o Marcos digite a chave em lugar nenhum) e devolve os registros DNS
// que precisam ir pro Cloudflare. Remover depois de usada uma vez.
router.post("/admin/resend-setup/create-domain", requireRole("super_admin"), async (req, res) => {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "RESEND_API_KEY não configurada" });
    return;
  }

  const domainName = (req.body?.domain as string | undefined) ?? "appvendorai.com";

  const createRes = await fetch("https://api.resend.com/domains", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: domainName, region: "sa-east-1" }),
  });
  const createData = await createRes.json();
  if (!createRes.ok) {
    res.status(createRes.status).json({ error: "Falha ao criar domínio no Resend", detail: createData });
    return;
  }

  res.json(createData);
});

// Consulta um domínio já criado (records + status de verificação).
router.get("/admin/resend-setup/domain/:domainId", requireRole("super_admin"), async (req, res) => {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "RESEND_API_KEY não configurada" });
    return;
  }
  const getRes = await fetch(`https://api.resend.com/domains/${req.params.domainId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await getRes.json();
  res.status(getRes.status).json(data);
});

export default router;
