/**
 * Prova de comportamento do Bloco 4 (roda em Node, sem framework).
 * Cobre as 13 regras que a especificação promete — inclusive a sentinela do modelador.
 */

import {
  CAMADA_MODELADOR,
  alternarOcultoObjeto,
  alternarVisibilidade,
  aplicarModo,
  camadaFallback,
  criarCamada,
  criarModo,
  deletarCamada,
  deletarModo,
  editarModo,
  estadoInicialCamadas,
  faxineiroOrfaos,
  hidratarObjetos,
  objetoVisivel,
  revelarTodosObjetos,
  renomearCamada,
  reordenarCamadas,
} from '../../src/arqdor/editor';

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

console.log('Bloco 4 — camadas');

// 1. projeto novo: 3 camadas e 2 modos padrão
const inicial = estadoInicialCamadas();
ok(inicial.camadas.length === 3, 'estado inicial tem 3 camadas');
ok(inicial.modos.length === 2, 'estado inicial tem 2 modos');

// 2. sentinela do modelador nunca é filtrada (L13)
const estrutural = aplicarModo(inicial, 'modo_estrutural');
ok(estrutural.ok, 'aplicar modo estrutural');
const modoEstrutural = estrutural.ok ? estrutural.estado : inicial;
ok(objetoVisivel(modoEstrutural, { id: 's1', camadaId: CAMADA_MODELADOR }), 'solido do modelador continua visivel (sentinela)');
ok(!objetoVisivel(modoEstrutural, { id: 'o1', camadaId: 'camada_mobiliario' }), 'objeto da camada desligada fica oculto');

// 3. desligar camada desmarca o modo ativo
const semMob = alternarVisibilidade(inicial, 'camada_mobiliario');
ok(semMob.ok && semMob.estado.modoAtivoId === null, 'toggle manual desmarca o preset');

// 4. criar camada: nome vazio recusado, válida começa visível e ativa
const vazio = criarCamada(inicial, '   ');
ok(!vazio.ok && vazio.erro.codigo === 'NOME_VAZIO', 'camada sem nome recusada');
const nova = criarCamada(inicial, 'Cozinha');
ok(nova.ok && nova.estado.camadas.length === 4, 'camada nova criada');
ok(nova.ok && nova.estado.camadaAtivaId !== 'camada_estrutura', 'camada nova vira ativa');
ok(nova.ok && nova.estado.camadas[3].visivel, 'camada nova comeca visivel');

// 5. camada padrão não pode ser deletada
const delPadrao = deletarCamada(inicial, 'camada_estrutura');
ok(!delPadrao.ok && delPadrao.erro.codigo === 'CAMADA_PADRAO', 'camada padrao protegida');

// 6. deletar custom: fallback + remoção dos modos
const comModo = nova.ok ? criarModo(nova.estado, 'Com cozinha', ['camada_4']) : null;
const baseDel = comModo !== null && comModo.ok ? comModo.estado : (nova.ok ? nova.estado : inicial);
const delCustom = deletarCamada(baseDel, 'camada_4');
ok(delCustom.ok && delCustom.fallbackId === 'camada_estrutura', 'fallback e a camada Estrutura');
if (delCustom.ok) {
  ok(!delCustom.estado.modos.some((m) => m.camadasVisiveis.includes('camada_4')), 'modo perde a camada deletada');
  ok(delCustom.estado.modos.every((m) => m.camadasVisiveis.length > 0), 'nenhum modo fica vazio');
}

// 7. modo sem camada válida é recusado
const modoVazio = criarModo(inicial, 'Fantasma', ['camada_inexistente']);
ok(!modoVazio.ok && modoVazio.erro.codigo === 'MODO_SEM_CAMADA', 'modo sem camada valida recusado');
const modoOk = criarModo(inicial, 'So estrutura', ['camada_estrutura']);
ok(modoOk.ok, 'modo valido criado');

// 8. modo padrão não pode ser deletado
const delModoPadrao = deletarModo(inicial, 'modo_completo');
ok(!delModoPadrao.ok && delModoPadrao.erro.codigo === 'MODO_PADRAO', 'modo padrao protegido');

// 9. editar modo ativo atualiza as camadas
const editado = editarModo(inicial, 'modo_completo', ['camada_estrutura']);
ok(editado.ok && editado.estado.camadas.filter((c) => c.visivel).length === 1, 'editar modo ativo aplica visibilidade');

// 10. reordenação best-effort
const reordenado = reordenarCamadas(inicial, ['camada_frentes', 'id_inventado', 'camada_estrutura']);
ok(reordenado.ok, 'reordenar aceita lista com id desconhecido');
if (reordenado.ok) {
  ok(reordenado.estado.camadas.length === 3, 'reordenar nao perde camada');
  ok(reordenado.estado.camadas[0].id === 'camada_frentes', 'primeira da lista fica em ordem 0');
  ok(reordenado.estado.camadas.every((c, i) => c.ordem === i), 'ordem reindexada de 0..n');
}

// 11. exceção por objeto e revelar todos
const oculto = alternarOcultoObjeto(inicial, 'obj-1');
ok(oculto.ok && !objetoVisivel(oculto.estado, { id: 'obj-1', camadaId: 'camada_estrutura' }), 'excecao por objeto oculta');
const revelado = revelarTodosObjetos(oculto.ok ? oculto.estado : inicial);
ok(revelado.ok && objetoVisivel(revelado.estado, { id: 'obj-1', camadaId: 'camada_estrutura' }), 'revelar todos restaura');

// 12. migração de objeto legado (sem camadaId)
const legado = hidratarObjetos(inicial, [{ id: 'a' }, { id: 'b', camadaId: 'camada_frentes' }]);
ok(legado.migrados === 1, 'um objeto legado migrado');
ok(legado.objetos[0].camadaId === camadaFallback(inicial), 'legado vai para a camada de fallback');

// 13. faxineiro de órfãos preserva a sentinela
const faxina = faxineiroOrfaos(inicial, [
  { id: 'x', camadaId: 'camada_fantasma' },
  { id: 'y', camadaId: CAMADA_MODELADOR },
]);
ok(faxina.migrados === 1, 'um orfao migrado');
ok(faxina.objetos[0].camadaId === 'camada_estrutura', 'orfao volta para Estrutura');
ok(faxina.objetos[1].camadaId === CAMADA_MODELADOR, 'sentinela nao e tocada pelo faxineiro');

// ---------- renomear e reordenar (Bloco 2) ----------
const base = estadoInicialCamadas();
const renomeado = renomearCamada(base, 'camada_mobiliario', 'Móveis');
ok(renomeado.ok && renomeado.estado.camadas.find((c) => c.id === 'camada_mobiliario')?.nome === 'Móveis', 'camadas: renomear atualiza o nome');
const nomeVazio = renomearCamada(base, 'camada_mobiliario', '   ');
ok(!nomeVazio.ok && nomeVazio.erro.codigo === 'NOME_VAZIO', 'camadas: renomear com nome vazio é recusado');
const reordenado2 = reordenarCamadas(base, ['camada_frentes', 'camada_estrutura', 'camada_mobiliario']);
const ordemNova2 = reordenado2.ok
  ? [...reordenado2.estado.camadas].sort((a, b) => a.ordem - b.ordem).map((c) => c.id).join(',')
  : '';
ok(reordenado2.ok && ordemNova2 === 'camada_frentes,camada_estrutura,camada_mobiliario', 'camadas: reordenar regrava ordem');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));