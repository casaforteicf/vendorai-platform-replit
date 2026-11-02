/**
 * GET    /api/projetos/:id — documento completo
 * PUT    /api/projetos/:id — grava o documento (valida integridade)
 * DELETE /api/projetos/:id — remove
 */

import { NextResponse } from 'next/server';
import { criarArmazenamento } from '../../../../lib/db/armazenamento';
import { respostaErro } from '../../../../lib/db/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, contexto: Contexto): Promise<NextResponse> {
  try {
    const { id } = await contexto.params;
    const armazenamento = await criarArmazenamento();
    const documento = await armazenamento.obter(id);
    if (documento === null) {
      return NextResponse.json({ erro: 'NAO_ENCONTRADO', mensagem: 'projeto ' + id + ' não existe' }, { status: 404 });
    }
    return NextResponse.json({ backend: armazenamento.backend, documento });
  } catch (erro) {
    return respostaErro(erro);
  }
}

export async function PUT(request: Request, contexto: Contexto): Promise<NextResponse> {
  try {
    const { id } = await contexto.params;
    const corpo = (await request.json()) as { projeto?: { id?: unknown } };
    const idCorpo = corpo.projeto?.id;
    if (idCorpo !== id) {
      return NextResponse.json(
        { erro: 'ID_DIVERGENTE', mensagem: 'o id do corpo precisa ser igual ao da URL' },
        { status: 400 },
      );
    }
    const armazenamento = await criarArmazenamento();
    const documento = await armazenamento.salvar(corpo as never);
    return NextResponse.json({ backend: armazenamento.backend, documento });
  } catch (erro) {
    return respostaErro(erro);
  }
}

export async function DELETE(_request: Request, contexto: Contexto): Promise<NextResponse> {
  try {
    const { id } = await contexto.params;
    const armazenamento = await criarArmazenamento();
    const removido = await armazenamento.remover(id);
    if (!removido) {
      return NextResponse.json({ erro: 'NAO_ENCONTRADO', mensagem: 'projeto ' + id + ' não existe' }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (erro) {
    return respostaErro(erro);
  }
}
