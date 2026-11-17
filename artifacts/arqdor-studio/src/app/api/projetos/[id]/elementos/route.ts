/**
 * GET /api/projetos/:id/elementos — projeção READ-ONLY dos elementos BIM do projeto.
 *
 * Fonte única: os elementos vivem dentro do documento do projeto. Esta rota existe para
 * integrações (orçamento externo, Praça, render) e NÃO aceita escrita — gravar elemento
 * separado criaria duas verdades para o mesmo dado.
 */

import { NextResponse } from 'next/server';
import { criarArmazenamento } from '../../../../../lib/db/armazenamento';
import { respostaErro } from '../../../../../lib/db/http';

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
    return NextResponse.json({ projetoId: id, total: documento.bim.length, elementos: documento.bim });
  } catch (erro) {
    return respostaErro(erro);
  }
}
