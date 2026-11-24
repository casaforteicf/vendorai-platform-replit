/**
 * GET  /api/projetos — lista resumos (id, nome, atualizadoEm, objetos)
 * POST /api/projetos — cria a partir do documento versionado completo
 *
 * O documento é a unidade de persistência: validação de integridade vem do domínio.
 */

import { NextResponse } from 'next/server';
import { criarArmazenamento } from '../../../lib/db/armazenamento';
import { respostaErro } from '../../../lib/db/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const armazenamento = await criarArmazenamento();
    const projetos = await armazenamento.listar();
    return NextResponse.json({ backend: armazenamento.backend, projetos });
  } catch (erro) {
    return respostaErro(erro);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const corpo: unknown = await request.json();
    const armazenamento = await criarArmazenamento();
    const documento = await armazenamento.criar(corpo as never);
    return NextResponse.json({ backend: armazenamento.backend, documento }, { status: 201 });
  } catch (erro) {
    return respostaErro(erro);
  }
}
