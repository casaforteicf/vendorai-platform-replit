/**
 * Cliente HTTP da persistência. O SERVIDOR é a fonte da verdade.
 *
 * Antes, o projeto vivia em localStorage: limpar o cache apagava tudo. Agora cada operação
 * é uma chamada a `/api/projetos` e o navegador guarda apenas QUAL projeto está aberto.
 */

import type { BackendPersistencia, RespostaLista, ResumoProjeto } from '../../../lib/db/tipos';
import type { DocumentoArqdor } from './documento';

export class ErroApi extends Error {
  readonly status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
  }
}

async function lerJson<T>(resposta: Response): Promise<T> {
  const texto = await resposta.text();
  if (!resposta.ok) {
    let mensagem = 'HTTP ' + String(resposta.status);
    try {
      const corpo = JSON.parse(texto) as { mensagem?: string; erro?: string };
      if (corpo.mensagem !== undefined) mensagem = corpo.mensagem;
      else if (corpo.erro !== undefined) mensagem = corpo.erro;
    } catch {
      if (texto.length > 0) mensagem = texto.slice(0, 200);
    }
    throw new ErroApi(resposta.status, mensagem);
  }
  return JSON.parse(texto) as T;
}

export async function listarProjetos(): Promise<{ backend: BackendPersistencia; projetos: ResumoProjeto[] }> {
  const resposta = await fetch('/api/projetos', { cache: 'no-store' });
  const corpo = await lerJson<RespostaLista>(resposta);
  return { backend: corpo.backend, projetos: corpo.projetos };
}

export async function criarProjeto(documento: DocumentoArqdor): Promise<DocumentoArqdor> {
  const resposta = await fetch('/api/projetos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(documento),
  });
  const corpo = await lerJson<{ documento: DocumentoArqdor }>(resposta);
  return corpo.documento;
}

export async function obterProjeto(id: string): Promise<DocumentoArqdor | null> {
  const resposta = await fetch('/api/projetos/' + encodeURIComponent(id), { cache: 'no-store' });
  if (resposta.status === 404) return null;
  const corpo = await lerJson<{ documento: DocumentoArqdor }>(resposta);
  return corpo.documento;
}

export async function salvarProjeto(documento: DocumentoArqdor): Promise<DocumentoArqdor> {
  const resposta = await fetch('/api/projetos/' + encodeURIComponent(documento.projeto.id), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(documento),
  });
  const corpo = await lerJson<{ documento: DocumentoArqdor }>(resposta);
  return corpo.documento;
}

export async function removerProjeto(id: string): Promise<void> {
  const resposta = await fetch('/api/projetos/' + encodeURIComponent(id), { method: 'DELETE' });
  if (!resposta.ok && resposta.status !== 404) {
    await lerJson<unknown>(resposta);
  }
}
