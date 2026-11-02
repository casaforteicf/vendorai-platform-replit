/**
 * GET /api/projetos/:id/elementos/:elementoId — um elemento BIM (projeção read-only).
 */

import { NextResponse } from 'next/server';
import { criarArmazenamento } from '../../../../../../lib/db/armazenamento';
import { respostaErro } from '../../../../../../lib/db/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Contexto {
  params: Promise<{ id: string; elementoId: string }>;
}

export async function GET(_request: Request, contexto: Contexto): Promise<NextResponse> {
  try {
    const { id, elementoId } = await contexto.params;
    const armazenamento = await criarArmazenamento();
    const documento = await armazenamento.obter(id);
    if (documento === null) {
      return NextResponse.json({ erro: 'NAO_ENCONTRADO', mensagem: 'projeto ' + id + ' não existe' }, { status: 404 });
    }
    const elemento = documento.bim.find((item) => item.id === elementoId);
    if (elemento === undefined) {
      return NextResponse.json(
        { erro: 'NAO_ENCONTRADO', mensagem: 'elemento ' + elementoId + ' não existe no projeto' },
        { status: 404 },
      );
    }
    return NextResponse.json({ projetoId: id, elemento });
  } catch (erro) {
    return respostaErro(erro);
  }
}
