/**
 * ARQDOR STUDIO 2.0 — entrada do domínio do editor.
 * Barrels para `tsc -p tsconfig.contracts.json` compilar o grafo inteiro.
 */

export * from './modelador/schema';
export * from './modelador/snap';
export * from './modelador/plano';
export * from './modelador/hitTest';
export * from './modelador/pushpull';
export * from './modelador/gizmo';
export * from './modelador/store-core';
export * from './modelador/desenho';
export * from './modelador/ferramentas/linha';
export * from './modelador/ferramentas/retangulo';
export * from './modelador/ferramentas/circulo';
export * from './modelador/ferramentas/arco';
export * from './bim/schema';
export * from './bim/camadas';
export * from './bim/store-core';
export * from './bim/derivar2d';
export * from './orcamento/quantitativos';
export * from './documentacao/memorial';
export * from './mep/schema';
export * from './mep/colisao';
export * from './transacao';
export * from './ia/schema';
export * from './interiores/biblioteca';
export * from './moveis/schema';
export * from './portal/schema';
export * from './video/schema';

export const ARQDOR_STUDIO_VERSAO = '2.0.0-alpha.2';