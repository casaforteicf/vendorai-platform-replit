/**
 * Tipos compartilhados entre servidor e cliente — SEM código de runtime.
 * Existe para o cliente importar o formato do resumo sem arrastar `pg`/`drizzle` para o bundle.
 */

export interface ResumoProjeto {
  id: string;
  nome: string;
  atualizadoEm: string;
  objetos: number;
}

export type BackendPersistencia = 'postgres' | 'arquivo';

export interface RespostaLista {
  backend: BackendPersistencia;
  projetos: ResumoProjeto[];
}
