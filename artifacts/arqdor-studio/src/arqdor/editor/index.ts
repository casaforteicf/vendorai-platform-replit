/**
 * ARQDOR STUDIO 2.0 — entrada do domínio do editor.
 *
 * Barrels para que `tsc -p tsconfig.contracts.json` compile o grafo inteiro
 * a partir de um único ponto. Sem efeito colateral em runtime.
 */

export * from './modelador/schema';
export * from './modelador/snap';
export * from './bim/schema';
export * from './mep/schema';
export * from './transacao';
export * from './ia/schema';
export * from './interiores/biblioteca';
export * from './moveis/schema';
export * from './portal/schema';
export * from './video/schema';

export const ARQDOR_STUDIO_VERSAO = '2.0.0-alpha.1';