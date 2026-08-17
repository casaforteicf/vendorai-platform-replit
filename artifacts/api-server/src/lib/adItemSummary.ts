/**
 * Monta o resumo de dados de um item anunciável (produto/veículo/imóvel)
 * pra alimentar o gerador de criativo — cada tipo tem campos bem
 * diferentes, então normaliza aqui pra um texto livre estruturado em vez
 * de tentar unificar os 3 schemas.
 *
 * Extraído de routes/ads.ts pra ser reutilizável por outros pontos do
 * sistema (ex: criação automática de campanha ao publicar um veículo/
 * imóvel — ver adAutoCreate.ts) sem precisar importar de dentro de outra
 * rota.
 */
import { and, eq } from "drizzle-orm";
import {
  db,
  produtosCatalogoTable,
  veiculosEstoqueTable,
  imoveisPropriedadesTable,
} from "@workspace/db";
import type { ItemAnunciavel } from "./adContentGenerator.js";

export async function buildResumoItem(
  itemTipo: "produto" | "veiculo" | "imovel",
  itemId: string,
  tenantId: string,
): Promise<ItemAnunciavel | null> {
  if (itemTipo === "produto") {
    const [p] = await db.select().from(produtosCatalogoTable)
      .where(and(eq(produtosCatalogoTable.id, itemId), eq(produtosCatalogoTable.tenantId, tenantId)));
    if (!p) return null;
    const linhas = [
      `Nome: ${p.nome}`,
      p.marca ? `Marca: ${p.marca}` : null,
      `Preço: R$ ${p.precoBase}`,
      p.descricao ? `Descrição: ${p.descricao}` : null,
    ].filter(Boolean);
    return { itemTipo, resumo: linhas.join("\n"), nomeCurto: p.nome };
  }

  if (itemTipo === "veiculo") {
    const [v] = await db.select().from(veiculosEstoqueTable)
      .where(and(eq(veiculosEstoqueTable.id, itemId), eq(veiculosEstoqueTable.tenantId, tenantId)));
    if (!v) return null;
    const linhas = [
      `Veículo: ${v.marca} ${v.modelo}${v.versao ? " " + v.versao : ""}`,
      `Ano: ${v.anoFabricacao ?? "?"}/${v.anoModelo ?? "?"}`,
      v.km != null ? `Quilometragem: ${v.km.toLocaleString("pt-BR")} km` : null,
      v.cor ? `Cor: ${v.cor}` : null,
      v.combustivel ? `Combustível: ${v.combustivel}` : null,
      v.cambio ? `Câmbio: ${v.cambio}` : null,
      `Preço: R$ ${v.valorPromocional ?? v.valor}`,
      v.fipeValor ? `Valor FIPE de referência: R$ ${v.fipeValor} (mês ${v.fipeMesReferencia})` : null,
    ].filter(Boolean);
    return { itemTipo, resumo: linhas.join("\n"), nomeCurto: `${v.marca} ${v.modelo}` };
  }

  // imovel
  const [i] = await db.select().from(imoveisPropriedadesTable)
    .where(and(eq(imoveisPropriedadesTable.id, itemId), eq(imoveisPropriedadesTable.tenantId, tenantId)));
  if (!i) return null;
  const linhas = [
    `Título: ${i.titulo}`,
    `Tipo: ${i.tipo} para ${i.finalidade}`,
    i.bairro || i.cidade ? `Localização: ${[i.bairro, i.cidade].filter(Boolean).join(", ")}` : null,
    i.areaM2 ? `Área: ${i.areaM2} m²` : null,
    i.quartos != null ? `Quartos: ${i.quartos}` : null,
    i.banheiros != null ? `Banheiros: ${i.banheiros}` : null,
    i.vagas != null ? `Vagas de garagem: ${i.vagas}` : null,
    `Valor: R$ ${i.valor}`,
    i.valorCondominio ? `Condomínio: R$ ${i.valorCondominio}` : null,
  ].filter(Boolean);
  return { itemTipo, resumo: linhas.join("\n"), nomeCurto: i.titulo };
}
