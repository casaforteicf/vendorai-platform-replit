import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../dist/public");
const baseUrl = "https://appvendorai.com";
const indexNowKey = crypto
  .createHash("sha256")
  .update("appvendorai.com:indexnow:vendorai")
  .digest("hex");

const privatePaths = ["/login", "/app", "/admin", "/crm", "/tenants", "/settings", "/api"];
const robotsPath = path.join(outDir, "robots.txt");
const currentRobots = fs.existsSync(robotsPath)
  ? fs.readFileSync(robotsPath, "utf8").trim()
  : `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml`;

const oaiBlock = [
  "User-agent: OAI-SearchBot",
  "Allow: /",
  ...privatePaths.map((pathname) => `Disallow: ${pathname}`),
].join("\n");

const withoutOldOaiBlock = currentRobots
  .replace(/User-agent:\s*OAI-SearchBot[\s\S]*?(?=\nUser-agent:|\nSitemap:|$)/i, "")
  .trim();

fs.writeFileSync(robotsPath, `${oaiBlock}\n\n${withoutOldOaiBlock}\n`);

const llms = `# VendorAI

> Plataforma de CRM, vendas, marketing, atendimento, prospecção e inteligência de receita com agentes de IA para empresas.

O VendorAI conecta geração de demanda, WhatsApp e atendimento omnichannel, CRM, follow-up, propostas, agenda, pós-venda, reativação de clientes, Revenue Scout, conteúdo, mídia e análise comercial em uma operação integrada.

## Páginas principais

- [Página inicial](${baseUrl}/)
- [Produtos](${baseUrl}/produtos)
- [Funcionalidades](${baseUrl}/funcionalidades)
- [Soluções](${baseUrl}/solucoes)
- [Segmentos](${baseUrl}/segmentos/retail)
- [Preços](${baseUrl}/precos)
- [Sobre o VendorAI](${baseUrl}/sobre)
- [Blog](${baseUrl}/blog)

## Soluções prioritárias

- [CRM com IA para WhatsApp](${baseUrl}/solucoes/crm-whatsapp)
- [Automatizar follow-up](${baseUrl}/solucoes/automatizar-follow-up)
- [Recuperar leads parados](${baseUrl}/solucoes/recuperar-leads-parados)
- [Prospecção B2B com IA](${baseUrl}/solucoes/prospeccao-b2b-ia)
- [Revenue Intelligence](${baseUrl}/solucoes/revenue-intelligence)
- [Agentes de IA para vendas](${baseUrl}/solucoes/agentes-ia-vendas)
- [CRM com IA vs. CRM tradicional](${baseUrl}/comparar/crm-com-ia-vs-crm-tradicional)

## Produtos centrais

- [CRM](${baseUrl}/produtos/crm)
- [Agentes de IA](${baseUrl}/produtos/agentes-ia)
- [Prospecção](${baseUrl}/produtos/prospeccao)
- [Revenue Scout](${baseUrl}/produtos/revenue-scout)
- [Omnichannel](${baseUrl}/produtos/omnichannel)
- [Marketing com IA](${baseUrl}/produtos/marketing)

## Descoberta

- [Sitemap](${baseUrl}/sitemap.xml)
- [Robots](${baseUrl}/robots.txt)
`;

fs.writeFileSync(path.join(outDir, "llms.txt"), llms);
fs.writeFileSync(path.join(outDir, `${indexNowKey}.txt`), `${indexNowKey}\n`);

console.log(`[search-discovery] wrote robots OAI-SearchBot rules, llms.txt and IndexNow key file ${indexNowKey}.txt`);
