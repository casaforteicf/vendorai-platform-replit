/**
 * ARQDOR STUDIO 2.0 — Biblioteca de fornecedores (contrato).
 *
 * E3: resultado de inserção virou união discriminada.
 * Com `ok: boolean` + campos opcionais, `if (r.ok)` não estreita — `r.solidoId` continua
 * `string | undefined` e o código real acaba em `!`/`as`, violando a regra 6.
 */

export type InserirErro =
  | { codigo: 'PRODUTO_NAO_ENCONTRADO'; id: string }
  | { codigo: 'GLB_FALHOU'; detalhe: string }
  | { codigo: 'PROJETO_NAO_ABERTO' }
  | { codigo: 'DEPENDENCIA_INDISPONIVEL'; dependencia: 'import_glb' | 'vinculo_bim' };

export type InserirProdutoResultado =
  | { ok: true; solidoId: string; elementoBimId: string; passoId: string }
  | { ok: false; erro: InserirErro };