/**
 * Mapeamento de erro de persistência → HTTP. Um lugar só para não inventar status por rota.
 */

import { NextResponse } from 'next/server';
import { ErroPersistencia } from './armazenamento';

export function respostaErro(erro: unknown): NextResponse {
  if (erro instanceof ErroPersistencia) {
    const status =
      erro.codigo === 'DUPLICADO'
        ? 409
        : erro.codigo === 'NAO_ENCONTRADO'
          ? 404
          : erro.codigo === 'INVALIDO'
            ? 422
            : 500;
    return NextResponse.json({ erro: erro.codigo, mensagem: erro.message }, { status });
  }
  return NextResponse.json({ erro: 'FALHA', mensagem: String(erro) }, { status: 500 });
}

export function respostaBackend(backend: 'postgres' | 'arquivo'): NextResponse {
  return NextResponse.json({ backend });
}
