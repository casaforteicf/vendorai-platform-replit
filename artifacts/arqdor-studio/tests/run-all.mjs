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

for (const modulo of ['camadas', 'bim', 'orcamento', 'colisao', 'memorial', 'persistencia']) {
  await import(pathToFileURL(join(saida, 'tests', modulo, 'check.js')).href);
}