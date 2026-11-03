/**
 * M2 — Biblioteca de Interiores: famílias, colocação, vínculo (ADR-003) e quantitativo.
 * Puro: roda sem navegador.
 */

import {
  FAMILIAS_PADRAO,
  buscarFamilias,
  familiaValida,
  obterFamilia,
} from '../../src/arqdor/editor/biblioteca/familias';
import {
  colocarFamilia,
  desvincularSolido,
  familiaDoElemento,
  temVinculo,
  vincularSolido,
} from '../../src/arqdor/editor/biblioteca/colocar';
import {
  FAMILIA_INDEFINIDA,
  quantitativoMoveis,
  totalMoveis,
} from '../../src/arqdor/editor/biblioteca/quantitativo';
import { quantitativos } from '../../src/arqdor/editor/orcamento/quantitativos';
import { custoDoQuantitativo } from '../../src/arqdor/editor/materiais/custos';
import { catalogoPadrao } from '../../src/arqdor/editor/materiais/catalogo';
import type { ElementoBim } from '../../src/arqdor/editor/bim/schema';

let passou = 0;
let falhou = 0;
function ok(condicao: boolean, nome: string): void {
  if (condicao) {
    passou += 1;
    console.log('  ok   ' + nome);
  } else {
    falhou += 1;
    console.log('  FALHA ' + nome);
  }
}
function perto(a: number, b: number, t = 1e-9): boolean {
  return Math.abs(a - b) <= t;
}

console.log('M2 — Biblioteca de Interiores');

// ---------- 1. catálogo de famílias ----------
ok(FAMILIAS_PADRAO.length === 6, 'catálogo: 6 famílias iniciais');
ok(obterFamilia(FAMILIAS_PADRAO, 'nao-existe') === null, 'catálogo: família desconhecida devolve null');
ok(buscarFamilias(FAMILIAS_PADRAO, { categoria: 'assento' }).length === 1, 'catálogo: filtro por categoria');
ok(buscarFamilias(FAMILIAS_PADRAO, { termo: 'jantar' }).length === 2, 'catálogo: busca por termo no nome e nas tags');
ok(buscarFamilias(FAMILIAS_PADRAO, { termo: 'CADEIRA' }).length === 1, 'catálogo: busca ignora caixa');
ok(buscarFamilias(FAMILIAS_PADRAO, { larguraMaxima: 0.5 }).length === 2, 'catálogo: filtro por largura máxima');
ok(buscarFamilias(FAMILIAS_PADRAO, {}).length === 6, 'catálogo: filtro vazio devolve tudo');

const cadeira = obterFamilia(FAMILIAS_PADRAO, 'FAM-CADEIRA');
const mesa = obterFamilia(FAMILIAS_PADRAO, 'FAM-MESA-JANTAR');
ok(cadeira !== null && familiaValida(cadeira), 'catálogo: família com dimensões válidas');
ok(
  cadeira !== null && !familiaValida({ ...cadeira, dimensoes: { ...cadeira.dimensoes, largura: 0 } }),
  'catálogo: largura zero é inválida',
);

// ---------- 2. colocar família ----------
if (cadeira === null || mesa === null) throw new Error('catálogo sem as famílias esperadas');

const primeira = colocarFamilia({
  familia: cadeira,
  posicao: [1, 2],
  projetoId: 'pr1',
  camadaId: 'c1',
  idSolido: 'm1',
});
ok(primeira.ok, 'colocar: cadeira colocada');
if (primeira.ok) {
  ok(primeira.solido.vertices.length === 8 && primeira.solido.faces.length === 6, 'colocar: sólido com 8 vértices e 6 faces');
  const xs = primeira.solido.vertices.map((v) => v.posicao[0]);
  const ys = primeira.solido.vertices.map((v) => v.posicao[1]);
  const zs = primeira.solido.vertices.map((v) => v.posicao[2]);
  ok(perto(Math.min(...xs), 1) && perto(Math.max(...xs), 1.45), 'colocar: largura da família respeitada');
  ok(perto(Math.min(...ys), 0) && perto(Math.max(...ys), 0.9), 'colocar: móvel apoiado no piso');
  ok(perto(Math.min(...zs), 2) && perto(Math.max(...zs), 2.45), 'colocar: profundidade da família respeitada');

  ok(primeira.elemento.tipo === 'mobiliario', 'colocar: elemento BIM de mobiliário');
  ok(primeira.elemento.id === 'el_m1', 'colocar: id do elemento deriva do sólido');
  ok(familiaDoElemento(primeira.elemento) === 'FAM-CADEIRA', 'colocar: elemento guarda a família');
  ok(temVinculo(primeira.elemento), 'colocar: vínculo com o sólido criado');

  // ADR-003: vínculo opcional, elemento sobrevive sem ele
  const solto = desvincularSolido(primeira.elemento);
  ok(!temVinculo(solto), 'ADR-003: desvincular zera o vínculo');
  ok(solto.id === primeira.elemento.id && solto.tipo === 'mobiliario', 'ADR-003: elemento permanece após desvincular');
  ok(
    (solto.geometria as { dimensoes: { largura: number } }).dimensoes.largura === 0.45,
    'ADR-003: dimensões próprias mantêm o móvel desenhável sem sólido',
  );
  ok(temVinculo(vincularSolido(solto, 'm1')), 'ADR-003: vínculo pode ser refeito');
}

const invalida = colocarFamilia({
  familia: { ...cadeira, dimensoes: { ...cadeira.dimensoes, altura: 0 } },
  posicao: [0, 0],
  projetoId: 'pr1',
  camadaId: 'c1',
  idSolido: 'mx',
});
ok(!invalida.ok && invalida.erro === 'FAMILIA_INVALIDA', 'colocar: família inválida recusada');

// ---------- 3. quantitativo por família ----------
const segunda = colocarFamilia({ familia: cadeira, posicao: [3, 2], projetoId: 'pr1', camadaId: 'c1', idSolido: 'm2' });
const terceira = colocarFamilia({ familia: mesa, posicao: [1, 4], projetoId: 'pr1', camadaId: 'c1', idSolido: 'm3' });
ok(segunda.ok && terceira.ok, 'colocar: mais duas peças');
if (!segunda.ok || !terceira.ok) throw new Error('falha ao colocar');

const elementos = [primeira.ok ? primeira.elemento : null, segunda.elemento, terceira.elemento].filter(
  (item): item is ElementoBim => item !== null,
);
const grupos = quantitativoMoveis(elementos, FAMILIAS_PADRAO);
ok(grupos.length === 2, 'quantitativo: 2 grupos por família');
const grupoCadeiras = grupos.find((grupo) => grupo.familiaId === 'FAM-CADEIRA');
const grupoMesas = grupos.find((grupo) => grupo.familiaId === 'FAM-MESA-JANTAR');
ok(grupoCadeiras !== undefined && grupoCadeiras.quantidade === 2, 'quantitativo: 2 cadeiras');
ok(grupoMesas !== undefined && grupoMesas.quantidade === 1, 'quantitativo: 1 mesa');
ok(grupos.every((grupo) => grupo.unidade === 'un'), 'quantitativo: tudo em unidade (un)');
ok(totalMoveis(elementos) === 3, 'quantitativo: total de 3 móveis');

const manual: ElementoBim = {
  ...elementos[0],
  id: 'el_manual',
  geometria: { dimensoes: { largura: 1, altura: 1, profundidade: 1 }, posicao: [0, 0] },
};
const gruposComManual = quantitativoMoveis([...elementos, manual]);
ok(
  gruposComManual.some((grupo) => grupo.familiaId === FAMILIA_INDEFINIDA && grupo.quantidade === 1),
  'quantitativo: móvel sem família não desaparece',
);

// ---------- 4. integração com o orçamento ----------
const resumo = quantitativos(elementos);
const unicos = resumo.itens.filter((item) => item.unidade === 'un');
ok(unicos.length === 3, 'orçamento: 3 itens em unidade');
ok(unicos.every((item) => item.coeficientePerda === 1), 'orçamento: móvel não recebe coeficiente de perda');

const custos = custoDoQuantitativo(resumo.grupos, catalogoPadrao());
ok(custos.linhasSemPreco >= 1, 'orçamento: móvel sem material é sinalizado sem preço');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
