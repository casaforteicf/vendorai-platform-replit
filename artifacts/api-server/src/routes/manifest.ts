import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";

const router: IRouter = Router();

const GENERIC_ICONS = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

// Manifest do PWA é servido daqui (não do arquivo estático public/manifest.json)
// pra poder trocar nome/ícone pelo do tenant quando o lojista instala pelo
// link exclusivo dele (<slug>.app.appvendorai.com). Sem logo cadastrada, ou
// acessando pelo host genérico (app.appvendorai.com), cai no ícone padrão
// do Vendor.ai.
router.get("/manifest.json", async (req, res) => {
  const hostname = req.hostname || "";
  const match = hostname.match(/^([a-z0-9-]+)\.app\.appvendorai\.com$/);
  const slug = match?.[1] ?? null;

  let name = "Vendor.ai — Inteligência Comercial";
  let shortName = "Vendor.ai";
  let icons = GENERIC_ICONS;

  if (slug) {
    const [tenant] = await db.select({ name: tenantsTable.name, logoUrl: tenantsTable.logoUrl })
      .from(tenantsTable)
      .where(eq(tenantsTable.subdomainSlug, slug));

    if (tenant?.logoUrl) {
      name = tenant.name;
      shortName = tenant.name.substring(0, 30);
      // Não sabemos o tamanho real da imagem que o lojista subiu — os
      // navegadores escalam sem problema, então usa a mesma URL nas 3
      // entradas em vez de gerar variações que não existem.
      icons = [
        { src: tenant.logoUrl, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: tenant.logoUrl, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: tenant.logoUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];
    } else if (tenant?.name) {
      name = tenant.name;
      shortName = tenant.name.substring(0, 30);
    }
  }

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({
    name,
    short_name: shortName,
    description: "CRM, conversas, agendamentos e IA em uma única interface pensada para velocidade e densidade de informação.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#1E3A5F",
    lang: "pt-BR",
    icons,
  });
});

export default router;
