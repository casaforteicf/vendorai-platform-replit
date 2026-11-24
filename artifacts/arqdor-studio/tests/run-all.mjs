/**
 * Executa todos os checks de comportamento.
 * O pacote e ESM; o diretorio compilado precisa se declarar CJS.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const app = join(aqui, '..');
const saida = join(app, '.check-out');

writeFileSync(join(saida, 'package.json'), JSON.stringify({ type: 'commonjs' }));

const modulos = ['camadas', 'bim', 'orcamento', 'colisao', 'memorial', 'persistencia', 'editor', 'materializacao', 'persistencia-remota', 'esquadrias', 'conflitos', 'insercao', 'booleana', 'snap', 'precisao', 'loop', 'bloco4', 'motor-fase1', 'materiais', 'escada', 'biblioteca', 'input', 'render', 'ia', 'ia-modelo', 'lote1-terreno', 'lote1-importacao', 'lote1-infra', 'vistas', 'composicoes', 'servicos'];

for (const modulo of modulos) {
  const carregado = await import(pathToFileURL(join(saida, 'tests', modulo, 'check.js')).href);
  // Testes assíncronos (I/O em disco) exportam executar e precisam ser aguardados.
  if (typeof carregado.executar === 'function') await carregado.executar();
}