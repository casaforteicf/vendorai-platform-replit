/**
 * Loop de arestas — contorno da face, e faces que compartilham uma aresta.
 */

import { criarCaixa } from '../../src/arqdor/editor/modelador/caixa';
import { facesDaAresta, loopDaFace, loopDeAresta } from '../../src/arqdor/editor/modelador/loop';

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

console.log('Seleção inteligente — loop de arestas');

const caixa = criarCaixa({ id: 'solido_1', nome: 'Caixa', posicao: [0, 0, 0], dimensoes: { largura: 4, altura: 2.8, profundidade: 0.15 } });
if (!caixa.ok) throw new Error('caixa inválida');
const solido = caixa.solido;

const base = solido.faces.find((f) => f.id === solido.id + '_f_base');
if (base === undefined) throw new Error('face base ausente');

const loopBase = loopDaFace(solido, base.id);
ok(loopBase.length === 4, 'face retangular tem 4 arestas no loop');

const arestaDaBase = solido.arestas.find((a) => a.id === loopBase[0]);
if (arestaDaBase === undefined) throw new Error('aresta ausente');

const loopPelaAresta = loopDeAresta(solido, arestaDaBase.id);
ok(loopPelaAresta.length === 4, 'loop a partir de uma aresta devolve o contorno da face');
ok(loopPelaAresta.slice().sort().join(',') === loopBase.slice().sort().join(','), 'mesmo conjunto de arestas');

const faces = facesDaAresta(solido, arestaDaBase.id);
ok(faces.length === 2, 'aresta de caixa é compartilhada por 2 faces');

ok(loopDaFace(solido, 'inexistente').length === 0, 'face inexistente → vazio');
ok(loopDeAresta(solido, 'inexistente').length === 0, 'aresta inexistente → vazio');
ok(facesDaAresta(solido, 'inexistente').length === 0, 'faces de aresta inexistente → vazio');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
