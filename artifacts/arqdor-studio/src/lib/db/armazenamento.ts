/**
 * Contrato de armazenamento de projetos + seleção de adaptador.
 *
 * Dois adaptadores, mesma interface:
 *  - `postgres` — quando `DATABASE_URL` existe (Supabase oficial / Postgres da Contabo).
 *  - `arquivo`  — modo de desenvolvimento, grava em `.data/arqdor/projetos.json`.
 *
 * Por que o adaptador de arquivo existe: sem ele, "salvar" só funcionaria com credencial de
 * banco na mão. Com ele, o dado sai do navegador HOJE (sobrevive a limpar o cache) e o
 * caminho para o Postgres é o mesmo código, trocado por variável de ambiente.
 */

import type { DocumentoArqdor } from '../../arqdor/editor/persistencia/documento';

export interface ResumoProjeto {
  id: string;
  nome: string;
  atualizadoEm: string;
  objetos: number;
}

export type CodigoErroPersistencia = 'DUPLICADO' | 'NAO_ENCONTRADO' | 'INVALIDO' | 'FALHA';

export class ErroPersistencia extends Error {
  readonly codigo: CodigoErroPersistencia;

  constructor(codigo: CodigoErroPersistencia, mensagem: string) {
    super(mensagem);
    this.name = 'ErroPersistencia';
    this.codigo = codigo;
  }
}

export interface Armazenamento {
  /** Qual backend está em uso — a UI mostra isso ao usuário em vez de fingir. */
  readonly backend: 'postgres' | 'arquivo';
  listar(): Promise<ResumoProjeto[]>;
  criar(documento: DocumentoArqdor): Promise<DocumentoArqdor>;
  obter(id: string): Promise<DocumentoArqdor | null>;
  salvar(documento: DocumentoArqdor): Promise<DocumentoArqdor>;
  remover(id: string): Promise<boolean>;
}

export function contarObjetos(documento: DocumentoArqdor): number {
  return documento.bim.length + documento.modelador.solidos.length;
}

export async function criarArmazenamento(): Promise<Armazenamento> {
  const url = process.env.DATABASE_URL;
  if (url !== undefined && url.trim().length > 0) {
    const { armazenamentoPostgres } = await import('./postgres');
    return armazenamentoPostgres(url.trim());
  }
  const { armazenamentoArquivo } = await import('./arquivo');
  return armazenamentoArquivo();
}
