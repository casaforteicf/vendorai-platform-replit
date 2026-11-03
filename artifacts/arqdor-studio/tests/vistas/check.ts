/**
 * Vistas — registro e matemática de câmera.
 */

import { VISTAS, cameraDaVista, obterVista, planoDeCorte, vistasPorGrupo } from '../../src/arqdor/editor/vistas/vistas';
import { calcularPagina, linhasCarimbo, mmParaPx } from '../../src/arqdor/editor/vistas/prancha';

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

console.log('Vistas — registro e câmera');

ok(VISTAS.length === 14, 'registro: 14 vistas');
ok(new Set(VISTAS.map((vista) => vista.id)).size === VISTAS.length, 'registro: ids únicos');
ok(vistasPorGrupo().length === 4, 'registro: quatro grupos');
ok(vistasPorGrupo().find((grupo) => grupo.grupo === 'tecnica')?.vistas.length === 8, 'registro: oito vistas técnicas');

const planta = obterVista('planta');
ok(planta.direcao[1] === 1 && planta.corteY === 1.5, 'planta: olha de cima com corte em 1,50 m');
ok(planta.fov <= 6, 'planta: FOV estreito (quase paralela)');

const camera = cameraDaVista(planta, [0, 0, 0], 10);
ok(perto(camera.posicao[0], 0) && perto(camera.posicao[1], 30) && perto(camera.posicao[2], 0), 'câmera: alvo + direção × distância');

const corte = planoDeCorte(planta);
ok(corte !== null && corte.normal[1] === -1 && perto(corte.constante, 1.5), 'corte: plano horizontal em 1,50 m');
ok(planoDeCorte(obterVista('perspectiva')) === null, 'corte: perspectiva não tem plano de corte');

const norte = obterVista('fachada-norte');
ok(norte.direcao[2] === -1 && obterVista('fachada-sul').direcao[2] === 1, 'fachadas: norte e sul opostas');
ok(obterVista('perspectiva').fov > 30, 'perspectiva: FOV de cônica');
ok(obterVista('planta').projecao === 'ortografica' && obterVista('isometrica').projecao === 'ortografica', 'projeção: plantas e isométrica são paralelas');
ok(obterVista('conica-2').projecao === 'perspectiva' && obterVista('perspectiva').projecao === 'perspectiva', 'projeção: cônicas seguem em perspectiva');
ok((obterVista('planta').meioAltura ?? 0) > 0, 'projeção: frustum ortográfico definido');
ok(obterVista('inexistente' as never).id === 'perspectiva', 'registro: id desconhecido cai na perspectiva');

// ---------- prancha ----------
ok(mmParaPx(25.4, 150) === 150, 'prancha: 25,4 mm a 150 dpi = 150 px');
const pagina50 = calcularPagina(50);
ok(pagina50.pxPorMetro === 118, 'prancha: 1:50 dá ~118 px por metro a 150 dpi');
ok(Math.abs(pagina50.desenhoM.largura - 10.35) < 0.01 && Math.abs(pagina50.desenhoM.altura - 9.5) < 0.01, 'prancha: área útil em 1:50 é 10,35 × 9,5 m');
const pagina100 = calcularPagina(100);
ok(pagina100.pxPorMetro === 59 && pagina100.desenhoM.largura > pagina50.desenhoM.largura, 'prancha: escala menor cobre mais metros');
const carimbo = linhasCarimbo({ titulo: 'Planta baixa', projeto: '', escala: 100, data: '03/11/2026' });
ok(carimbo.some((linha) => linha.rotulo === 'ESCALA' && linha.valor === '1:100'), 'prancha: carimbo traz a escala');
ok(carimbo.some((linha) => linha.rotulo === 'PROJETO' && linha.valor === '—'), 'prancha: projeto vazio vira travessão');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));
