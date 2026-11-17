import {
  VERSAO_DOCUMENTO,
  desserializar,
  estadoInicialCamadas,
  paraEstadoExecucao,
  serializar,
  validar,
} from '../../src/arqdor/editor';
import type { ElementoBim, GeometriaParede } from '../../src/arqdor/editor';

let passou = 0;
let falhou = 0;
function ok(c: boolean, n: string): void {
  if (c) { passou += 1; console.log('  ok   ' + n); } else { falhou += 1; console.log('  FALHA ' + n); }
}

const projeto = {
  id: 'proj-1',
  nome: 'Casa Chapeco',
  criadoEm: '2026-11-01T10:00:00Z',
  atualizadoEm: '2026-11-02T12:00:00Z',
};

const parede: ElementoBim = {
  id: 'parede-1', projetoId: 'proj-1', tipo: 'parede', nivel: 0,
  geometria: { ponto_a: [0, 0], ponto_b: [4, 0], altura: 3, espessura: 0.15 } as GeometriaParede,
  propriedades: {}, camadaId: 'camada_estrutura',
};

console.log('Persistencia — documento versionado');

const camadas = estadoInicialCamadas();
camadas.objetosOcultosIds = ['obj-1', 'obj-2'];

const texto = serializar({
  projeto,
  camadas,
  bim: [parede],
  modelador: { solidos: [], proximoSolidoN: 3 },
  mep: [],
});

// 1. determinismo
const texto2 = serializar({ projeto, camadas, bim: [parede], modelador: { solidos: [], proximoSolidoN: 3 }, mep: [] });
ok(texto === texto2, 'serializacao deterministica (mesma string)');
ok(JSON.parse(texto).versao === VERSAO_DOCUMENTO, 'documento carrega a versao corrente');

// 2. regra 9: UI nao vai para o JSON
ok(!texto.includes('objetosOcultosIds'), 'estado de UI nao e serializado');
ok(!texto.includes('obj-1'), 'ids de objetos ocultos nao vazam');

// 3. round-trip
const lido = desserializar(texto);
ok(lido.ok, 'documento serializado e lido de volta');
if (lido.ok) {
  ok(lido.documento.bim.length === 1 && lido.documento.bim[0].id === 'parede-1', 'BIM sobrevive ao round-trip');
  ok(lido.documento.modelador.proximoSolidoN === 3, 'contador do modelador preservado');
  ok(lido.documento.camadas.camadas.length === 3, 'camadas preservadas');
  ok(lido.documento.projeto.nome === 'Casa Chapeco', 'projeto preservado');
  const execucao = paraEstadoExecucao(lido.documento);
  ok(execucao.camadas.objetosOcultosIds.length === 0, 'ao carregar, excecoes de UI voltam vazias');
}

// 4. migracao v1 -> v2
const v1 = {
  versao: 1,
  projeto,
  camadas: [{ id: 'camada_estrutura', nome: 'Estrutura', visivel: true, padrao: true, ordem: 0 }],
  elementos: [parede],
};
const migrado = validar(v1);
ok(migrado.ok && migrado.migrado, 'documento v1 e migrado');
if (migrado.ok) {
  ok(migrado.documento.bim.length === 1, 'v1: elementos viram bim');
  ok(migrado.documento.camadas.modos.length === 2, 'v1 recebe os modos padrao');
  ok(migrado.documento.modelador.solidos.length === 0, 'v1 ganha modelador vazio');
  ok(migrado.documento.mep.length === 0, 'v1 ganha mep vazio');
  ok(migrado.avisos.length > 0, 'migracao registra aviso');
}

// 5. erros
const jsonRuim = desserializar('{ nao e json');
ok(!jsonRuim.ok && jsonRuim.erro.codigo === 'JSON_INVALIDO', 'json invalido recusado');

const aFrente = validar({ ...JSON.parse(texto), versao: 99 });
ok(!aFrente.ok && aFrente.erro.codigo === 'VERSAO_A_FRENTE', 'versao futura recusada');

const semVersao = validar({ projeto, camadas: {}, bim: [] });
ok(!semVersao.ok && semVersao.erro.codigo === 'VERSAO_DESCONHECIDA', 'documento sem versao recusado');

// 6. validacao de integridade
const camadaFantasma = JSON.parse(texto);
camadaFantasma.bim[0].camadaId = 'camada_que_nao_existe';
const r1 = validar(camadaFantasma);
ok(!r1.ok && r1.erro.codigo === 'INVALIDO' && r1.erro.problemas.some((p) => p.caminho.includes('camadaId')), 'camada inexistente no BIM e recusada');

const ativaRuim = JSON.parse(texto);
ativaRuim.camadas.camadaAtivaId = 'nao-existe';
const r2 = validar(ativaRuim);
ok(!r2.ok && r2.erro.codigo === 'INVALIDO', 'camada ativa inexistente e recusada');

const modoRuim = JSON.parse(texto);
modoRuim.camadas.modoAtivoId = 'modo-fantasma';
const r3 = validar(modoRuim);
ok(!r3.ok && r3.erro.codigo === 'INVALIDO', 'modo ativo inexistente e recusado');

const semNome = JSON.parse(texto);
semNome.projeto.nome = '';
const r4 = validar(semNome);
ok(!r4.ok && r4.erro.codigo === 'INVALIDO', 'projeto sem nome e recusado');

// 7. reparo do contador monotônico (invariante 10)
const contadorBaixo = JSON.parse(texto);
contadorBaixo.modelador.solidos = [
  { id: 'solido_7', nome: 'S', vertices: [], arestas: [], faces: [], transformacao: { posicao: [0, 0, 0], rotacao: [0, 0, 0], escala: [1, 1, 1] } },
];
contadorBaixo.modelador.proximoSolidoN = 2;
const r5 = validar(contadorBaixo);
ok(r5.ok && r5.documento.modelador.proximoSolidoN === 7, 'contador monotônico reparado');
ok(r5.ok && r5.avisos.some((a) => a.includes('proximoSolidoN')), 'reparo do contador vira aviso');

// 8. documento vazio e valido
const vazio = validar({ ...JSON.parse(texto), bim: [], mep: [], modelador: { solidos: [], proximoSolidoN: 0 } });
ok(vazio.ok, 'documento sem elementos e valido');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));