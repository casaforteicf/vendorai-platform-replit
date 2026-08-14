/**
 * Feed do Google Shopping (Merchant Center) — formato RSS 2.0 com namespace
 * g: (especificação oficial: support.google.com/merchants/answer/7052112).
 *
 * Produtos físicos com estoque (farmácia, mercado, distribuidoras,
 * autopeças) entram aqui. Farmácia venda-livre foi liberada por decisão
 * explícita do usuário (sem confirmação direta de que a certificação do
 * Google pra Shopping já cobre o Brasil — risco assumido conscientemente).
 * Medicamento que exige receita (proxy: farmacia_produtos.exigeReceita)
 * continua excluído sempre, independente dessa decisão — isso não é uma
 * questão de país, é vedado pelo Google sem certificação separada e mais
 * rigorosa (fabricante/medicamento controlado), que não foi discutida nem
 * liberada.
 *
 * IMPORTANTE — pendência de verificação: o campo `link` (URL da página do
 * produto, exigido pelo Google) usa um template configurável via env var
 * PRACA_PRODUCT_URL_TEMPLATE porque este repo não contém o frontend do
 * Praça.ai (repo separado) — não tive como confirmar o padrão real de rota
 * de produto. Confirmar e ajustar antes de ativar o feed em produção; um
 * link que não abre a página certa do produto derruba a aprovação no
 * Merchant Center.
 */
import crypto from "crypto";
import type { Logger } from "pino";
import { eq, and } from "drizzle-orm";
import {
  db,
  produtosCatalogoTable,
  farmaciaProdutoTable,
  tenantsTable,
} from "@workspace/db";

const PRODUCT_URL_TEMPLATE =
  process.env.PRACA_PRODUCT_URL_TEMPLATE ?? "https://praca.ai/produto/{id}";

function montarFeedVazio(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Catálogo Vendor.ai</title>
    <link>https://appvendorai.com</link>
    <description>Feed de produtos gerado automaticamente</description>
  </channel>
</rss>`;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Token de acesso ao feed — HMAC do tenantId, não requer nova coluna/migration. */
export function gerarFeedToken(tenantId: string): string {
  const secret = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "";
  return crypto.createHmac("sha256", secret).update(tenantId).digest("hex").slice(0, 32);
}

export function validarFeedToken(tenantId: string, token: string): boolean {
  const esperado = gerarFeedToken(tenantId);
  if (esperado.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(token));
}

export async function gerarShoppingFeedXml(tenantId: string, log: Logger): Promise<string> {
  // IDs de produto de farmácia que exigem receita — excluídos do feed
  // sempre (ver aviso no topo do arquivo). Produtos de farmácia SEM essa
  // exigência (venda livre) são elegíveis normalmente desde a liberação.
  const farmaciaControlados = await db
    .select({ produtoCatalogoId: farmaciaProdutoTable.produtoCatalogoId })
    .from(farmaciaProdutoTable)
    .where(and(eq(farmaciaProdutoTable.tenantId, tenantId), eq(farmaciaProdutoTable.exigeReceita, true)));
  const idsExcluidos = new Set(farmaciaControlados.map((f) => f.produtoCatalogoId).filter(Boolean) as string[]);

  // Só entra no feed o que está DE FATO publicado no Praça.ai — o `link`
  // do feed aponta pra página pública do produto, então anunciar algo que
  // não está visível lá seria um link quebrado (derruba aprovação no
  // Merchant Center) ou divulgaria algo que o lojista escolheu não expor.
  // Regra: switch geral do tenant precisa estar ligado, E o produto não
  // pode ter sido explicitamente tirado da vitrine (vendeNoPracaAi=false
  // no produto sobrepõe; null/true = herda/confirma visível).
  const [tenant] = await db.select({ vendeNoPracaAi: tenantsTable.vendeNoPracaAi }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant?.vendeNoPracaAi) {
    log.warn({ tenantId }, "adShoppingFeed: tenant não vende no Praça.ai (switch geral desligado) — feed vazio");
    return montarFeedVazio();
  }

  const produtos = await db
    .select()
    .from(produtosCatalogoTable)
    .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)));

  const elegiveis = produtos.filter((p) => {
    if (idsExcluidos.has(p.id)) return false;
    if (p.vendeNoPracaAi === false) return false; // tirado explicitamente da vitrine
    if (p.productType !== "physical") return false;
    if (!p.imagemUrl && (!p.imagens || p.imagens.length === 0)) return false;
    if (Number(p.precoBase) <= 0) return false;
    return true;
  });

  if (elegiveis.length === 0) {
    log.warn({ tenantId, totalProdutos: produtos.length }, "adShoppingFeed: nenhum produto elegível pro feed (todos excluídos, fora da vitrine, ou sem imagem/preço)");
  }

  const items = elegiveis.map((p) => {
    const link = PRODUCT_URL_TEMPLATE.replace("{id}", p.id);
    const imagem = p.imagemUrl ?? p.imagens?.[0] ?? "";
    const precoNum = Number(p.precoPromocional ?? p.precoBase);
    const disponibilidade = "in stock";

    return `    <item>
      <g:id>${xmlEscape(p.id)}</g:id>
      <title>${xmlEscape(p.nome)}</title>
      <description>${xmlEscape(p.descricaoLonga ?? p.descricao ?? p.nome)}</description>
      <link>${xmlEscape(link)}</link>
      <g:image_link>${xmlEscape(imagem)}</g:image_link>
      <g:availability>${disponibilidade}</g:availability>
      <g:price>${precoNum.toFixed(2)} BRL</g:price>
      <g:condition>new</g:condition>
      ${p.marca ? `<g:brand>${xmlEscape(p.marca)}</g:brand>` : `<g:identifier_exists>no</g:identifier_exists>`}
      ${p.codigoBarras ? `<g:gtin>${xmlEscape(p.codigoBarras)}</g:gtin>` : ""}
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Catálogo Vendor.ai</title>
    <link>https://appvendorai.com</link>
    <description>Feed de produtos gerado automaticamente</description>
${items}
  </channel>
</rss>`;
}
