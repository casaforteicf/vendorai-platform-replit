/**
 * Lote 1 — terreno: leitura de localização, tiles e plano de referência.
 */

import { interpretarLocalizacao } from '../../src/arqdor/editor/terreno/localizacao';
import {
  atribuicaoTerreno,
  latParaTileY,
  lonParaTileX,
  metrosPorPixel,
  tileDaLocalizacao,
  urlTerreno,
} from '../../src/arqdor/editor/terreno/tiles';
import {
  LADO_PADRAO_M,
  MATERIAL_TERRENO,
  criarTerreno,
  contabilizaNoOrcamento,
  ehTerreno,
} from '../../src/arqdor/editor/terreno/terreno';

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
function perto(a: number, b: number, t = 1e-6): boolean {
  return Math.abs(a - b) <= t;
}

console.log('Lote 1 — terreno');

// ---------- 1. localização ----------
const soltas = interpretarLocalizacao('-23.5505, -46.6333');
ok(soltas.ok && perto(soltas.localizacao.lat, -23.5505) && perto(soltas.localizacao.lng, -46.6333), 'localização: coordenadas soltas');

const google = interpretarLocalizacao('https://www.google.com/maps/@-23.5505,-46.6333,17z/data=...');
ok(google.ok && google.localizacao.zoom === 17, 'localização: link Google com zoom');

const consulta = interpretarLocalizacao('https://www.google.com/maps?q=-23.55,-46.63');
ok(consulta.ok && perto(consulta.localizacao.lat, -23.55), 'localização: parâmetro q=');

const osm = interpretarLocalizacao('https://www.openstreetmap.org/?mlat=-23.55&mlon=-46.63#map=17/-23.55/-46.63');
ok(osm.ok && perto(osm.localizacao.lng, -46.63), 'localização: link OSM mlat/mlon');

const geo = interpretarLocalizacao('geo:-23.55,-46.63');
ok(geo.ok, 'localização: URI geo:');

ok(!interpretarLocalizacao('').ok, 'localização: vazio é inválido');
const livre = interpretarLocalizacao('sala de estar');
ok(!livre.ok && livre.erro === 'FORMATO_INVALIDO', 'localização: texto livre é inválido');
const fora = interpretarLocalizacao('99.5, 10');
ok(!fora.ok && fora.erro === 'COORDENADA_FORA_DA_FAIXA', 'localização: latitude fora da faixa');

// ---------- 2. tiles ----------
ok(perto(lonParaTileX(0, 1), 1) && perto(latParaTileY(0, 1), 1), 'tiles: origem no zoom 1');
const tile = tileDaLocalizacao(0, 0, 1);
ok(tile.x === 1 && tile.y === 1 && tile.z === 1, 'tiles: tile da origem');
ok(perto(metrosPorPixel(0, 0), 156543.03392, 0.001), 'tiles: metros por pixel no equador (z0)');

const urlOsm = urlTerreno('osm', { z: 10, x: 511, y: 340 });
ok(urlOsm === 'https://tile.openstreetmap.org/10/511/340.png', 'tiles: URL OSM');
const urlEsri = urlTerreno('esri', { z: 10, x: 511, y: 340 });
ok(urlEsri !== null && urlEsri.includes('/10/340/511'), 'tiles: URL Esri usa y/x');
ok(urlTerreno('google', tile) === null, 'tiles: Google sem chave devolve null');
const urlGoogle = urlTerreno('google', tile, { chave: 'k', larguraPx: 640, alturaPx: 640, centro: { lat: 0, lng: 0 }, zoom: 12 });
ok(urlGoogle !== null && urlGoogle.includes('key=k') && urlGoogle.includes('maptype=satellite'), 'tiles: URL Google com chave');
ok(atribuicaoTerreno('osm').includes('OpenStreetMap'), 'tiles: atribuição OSM');

// ---------- 3. plano de referência ----------
const terreno = criarTerreno({ id: 'ter1', localizacao: '-23.5505, -46.6333' });
ok(terreno.ok, 'terreno: criado');
if (terreno.ok) {
  ok(terreno.solido.vertices.length === 4, 'terreno: quatro vértices');
  ok(terreno.solido.faces.length === 1 && terreno.solido.faces[0].vertices.length === 4, 'terreno: uma face quadrangular');
  ok(terreno.solido.faces[0].material?.materialId === MATERIAL_TERRENO, 'terreno: face usa material de terreno');
  ok(ehTerreno(terreno.solido), 'terreno: identificado com prefixo');
  ok(!contabilizaNoOrcamento(terreno.solido), 'terreno: NÃO conta no orçamento');
  ok(terreno.textura.atribuicao.includes('OpenStreetMap'), 'terreno: atribuição preenchida');
  ok(terreno.textura.url !== null, 'terreno: URL de textura gerada');
  ok(terreno.textura.metrosPorPixel > 0, 'terreno: escala metros/pixel informada');
  const largura = terreno.solido.vertices[1].posicao[0] - terreno.solido.vertices[0].posicao[0];
  ok(perto(largura, LADO_PADRAO_M), 'terreno: largura padrão aplicada');
}

ok(!criarTerreno({ id: 'ter2', localizacao: 'texto qualquer' }).ok, 'terreno: localização inválida recusada');
const semChave = criarTerreno({ id: 'ter3', localizacao: '-23.55,-46.63', provedor: 'google' });
ok(!semChave.ok && semChave.erro === 'PROVEDOR_REQUER_CHAVE', 'terreno: Google exige chave');
ok(!criarTerreno({ id: 'ter4', localizacao: '-23.55,-46.63', largura: 0 }).ok, 'terreno: dimensão inválida recusada');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
