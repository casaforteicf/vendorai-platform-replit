/**
 * Executa o check de comportamento do Bloco 4.
 * O pacote é ESM ("type": "module"), então o diretório compilado precisa se declarar CJS.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const app = join(aqui, '..', '..');
const saida = join(app, '.check-out');

writeFileSync(join(saida, 'package.json'), JSON.stringify({ type: 'commonjs' }));
await import(pathToFileURL(join(saida, 'tests', 'camadas', 'check.js')).href);