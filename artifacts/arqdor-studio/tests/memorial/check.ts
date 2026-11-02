import {
  SECOES_OBRIGATORIAS,
  formatarQuantidade,
  gerarMemorial,
  memorialMarkdown,
  quantitativos,
  validarMemorial,
} from '../../src/arqdor/editor';
import type { ElementoBim, GeometriaParede } from '../../src/arqdor/editor';

let passou = 0;
let falhou = 0;
function ok(c: boolean, n: string): void {
  if (c) { passou += 1; console.log('  ok   ' + n); } else { falhou += 1; console.log('  FALHA ' + n); }
}

const projetoId = 'p1';
const camadaId = 'camada_estrutura';
const parede: ElementoBim = {
  id: 'parede-1', projetoId, tipo: 'parede', nivel: 0,
  geometria: { ponto_a: [0, 0], ponto_b: [4, 0], altura: 3, espessura: 0.15 } as GeometriaParede,
  propriedades: {}, camadaId, materialId: 'MAT-ALV',
};

console.log('Memorial descritivo');

const resumo = quantitativos([parede]);
const memorial = gerarMemorial({
  projeto: { nome: 'Casa Chapeco', cliente: 'Cliente Teste', endereco: 'Rua A, 100' },
  elementos: [parede],
  quantitativos: resumo,
  geradoEm: '2026-11-02T12:00:00Z',
});

ok(memorial.secoes.length >= SECOES_OBRIGATORIAS.length, 'todas as secoes obrigatorias presentes');
ok(SECOES_OBRIGATORIAS.every((id) => memorial.secoes.some((s) => s.id === id)), 'ids obrigatorios conferem');
ok(validarMemorial(memorial).ok, 'memorial valido (sem placeholder, sem secao vazia)');
ok(memorial.avisos.length === 0, 'projeto completo nao gera aviso');

const secaoQ = memorial.secoes.find((s) => s.id === 'quantitativos');
ok(secaoQ?.tabela !== undefined, 'secao de quantitativos tem tabela');
ok((secaoQ?.tabela?.linhas.length ?? 0) === resumo.grupos.length, 'tabela tem uma linha por grupo');
ok(secaoQ?.tabela?.linhas.every((l) => l.length === 6) === true, 'cada linha tem 6 colunas');

const markdown = memorialMarkdown(memorial);
ok(markdown.startsWith('# Memorial descritivo'), 'markdown comeca com o titulo');
ok(markdown.includes('## 4. Quantitativos'), 'markdown tem a secao de quantitativos');
ok(markdown.includes('| Categoria |'), 'markdown renderiza a tabela');
ok(markdown.includes('2026-11-02T12:00:00Z'), 'data injetada aparece no texto');

// sem projeto
const semNome = gerarMemorial({ projeto: { nome: '  ' }, elementos: [parede], geradoEm: '2026-11-02T12:00:00Z' });
ok(semNome.avisos.length === 1, 'projeto sem nome gera aviso');

// modelo vazio
const vazio = gerarMemorial({ projeto: { nome: 'Vazio' }, elementos: [], geradoEm: '2026-11-02T12:00:00Z' });
ok(vazio.avisos.some((a) => a.includes('sem elementos')), 'modelo vazio gera aviso');
ok(validarMemorial(vazio).ok, 'memorial de modelo vazio continua valido');

// sem quantitativos
const semQ = gerarMemorial({ projeto: { nome: 'Sem Q' }, elementos: [parede], geradoEm: '2026-11-02T12:00:00Z' });
const secaoSemQ = semQ.secoes.find((s) => s.id === 'quantitativos');
ok(secaoSemQ?.tabela === undefined, 'sem quantitativos nao inventa tabela');
ok((secaoSemQ?.paragrafos[0] ?? '').includes('Não há quantitativos'), 'declara ausencia de quantitativos');

// para_prefeitura adiciona paragrafo
const prefeitura = gerarMemorial({
  projeto: { nome: 'Casa', tipo: 'para_prefeitura' }, elementos: [parede], geradoEm: '2026-11-02T12:00:00Z',
});
const lim = prefeitura.secoes.find((s) => s.id === 'limitacoes');
ok((lim?.paragrafos.length ?? 0) === 3, 'para_prefeitura acrescenta ressalva de protocolo');

// formatacao e validacao negativa
ok(formatarQuantidade(10.836) === '10,84', 'quantidade formatada com virgula e 2 casas');
const adulterado = { ...memorial, secoes: memorial.secoes.map((s) => (s.id === 'objetivo' ? { ...s, paragrafos: ['TODO escrever'] } : s)) };
const v = validarMemorial(adulterado);
ok(!v.ok && v.problemas.some((p) => p.includes('placeholder')), 'validador pega placeholder');

console.log('');
console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
if (falhou > 0) throw new Error('falhas: ' + String(falhou));