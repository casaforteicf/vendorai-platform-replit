/**
 * Lote 1 — importação: GLB real (montado no teste), DXF, erros e operação única.
 */

import {
  construirSolido,
  detectarFormato,
  operacoesDeImportacao,
  processarArquivo,
} from '../../src/arqdor/editor/importacao/processar';

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

/** Monta um GLB mínimo com um triângulo (0,0,0) (2,0,0) (0,3,0). */
function glbTriangulo(): ArrayBuffer {
  const posicoes = new Float32Array([0, 0, 0, 2, 0, 0, 0, 3, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const bin = new Uint8Array(36 + 6 + 2);
  bin.set(new Uint8Array(posicoes.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), 36);

  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonLen = jsonBytes.length + jsonPad;
  const binPad = (4 - (bin.length % 4)) % 4;
  const binLen = bin.length + binPad;
  const total = 12 + 8 + jsonLen + 8 + binLen;

  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(out, 20, jsonBytes.length).set(jsonBytes);
  for (let i = 0; i < jsonPad; i += 1) dv.setUint8(20 + jsonBytes.length + i, 0x20);
  const binInicio = 20 + jsonLen;
  dv.setUint32(binInicio, binLen, true);
  dv.setUint32(binInicio + 4, 0x004e4942, true);
  new Uint8Array(out, binInicio + 8, bin.length).set(bin);
  return out;
}

const dxfQuad = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', '3DFACE',
  '10', '0', '20', '0', '30', '0',
  '11', '4', '21', '0', '31', '0',
  '12', '4', '22', '3', '32', '0',
  '13', '0', '23', '3', '33', '0',
  '0', 'ENDSEC', '0', 'EOF',
  '',
].join('\n');

console.log('Lote 1 — importação');

// ---------- 1. detecção ----------
ok(detectarFormato('casa.glb') === 'glb', 'formato: .glb');
ok(detectarFormato('planta.DXF') === 'dxf', 'formato: .DXF maiúsculo');
ok(detectarFormato('modelo.ifc') === 'ifc', 'formato: .ifc');
ok(detectarFormato('leia-me.txt') === null, 'formato: desconhecido');

// ---------- 2. GLB ----------
const glb = processarArquivo({ nome: 'peca.glb', bytes: glbTriangulo(), idSolido: 'imp1' });
ok(glb.ok, 'glb: processado');
if (glb.ok) {
  ok(glb.solido.faces.length === 1, 'glb: um triângulo virou uma face');
  ok(glb.solido.vertices.length === 3, 'glb: três vértices');
  ok(glb.solido.arestas.length === 3, 'glb: três arestas');
  ok(glb.solido.faces[0].triangulada === true, 'glb: face marcada como triangulada');
  const xs = glb.solido.vertices.map((v) => v.posicao[0]);
  const mediaX = (Math.min(...xs) + Math.max(...xs)) / 2;
  ok(perto(mediaX, 0), 'glb: centrado no eixo X do grid');
  const minY = Math.min(...glb.solido.vertices.map((v) => v.posicao[1]));
  ok(perto(minY, 0), 'glb: base apoiada em y = 0');
  ok(glb.resumo.includes('GLB'), 'glb: resumo identifica o formato');
}

// ---------- 3. DXF ----------
const dxf = processarArquivo({ nome: 'planta.dxf', bytes: new TextEncoder().encode(dxfQuad).buffer as ArrayBuffer, idSolido: 'imp2' });
ok(dxf.ok, 'dxf: processado');
if (dxf.ok) {
  ok(dxf.solido.faces.length === 2, 'dxf: quad virou dois triângulos');
  ok(dxf.solido.vertices.length === 4, 'dxf: quatro vértices com dedupe');
}

// ---------- 4. recusas explícitas ----------
const ifc = processarArquivo({ nome: 'predio.ifc', bytes: new ArrayBuffer(8), idSolido: 'imp3' });
ok(!ifc.ok && ifc.erro === 'FORMATO_NAO_SUPORTADO', 'ifc: recusado com motivo');
ok(!ifc.ok && ifc.detalhe !== undefined && ifc.detalhe.includes('web-ifc'), 'ifc: detalhe cita o parser necessário');

const gltf = processarArquivo({ nome: 'peca.gltf', bytes: new ArrayBuffer(8), idSolido: 'imp4' });
ok(!gltf.ok && gltf.erro === 'FORMATO_NAO_SUPORTADO', 'gltf: pede conversão para glb');

const desconhecido = processarArquivo({ nome: 'foto.png', bytes: new ArrayBuffer(8), idSolido: 'imp5' });
ok(!desconhecido.ok && desconhecido.erro === 'FORMATO_DESCONHECIDO', 'arquivo: formato desconhecido');

const vazio = processarArquivo({ nome: 'vazio.glb', bytes: new ArrayBuffer(8), idSolido: 'imp6' });
ok(!vazio.ok, 'arquivo: GLB inválido recusado');

// ---------- 5. operação única ----------
if (glb.ok) {
  const operacoes = operacoesDeImportacao(glb.solido);
  ok(operacoes.length === 1 && operacoes[0].tipo === 'criar_solido', 'passo: importação é UMA operação');
}

const malhaVazia = construirSolido({ posicoes: [], indices: [] }, { id: 'x', nome: 'x' });
ok(!malhaVazia.ok, 'malha: vazia recusada');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
