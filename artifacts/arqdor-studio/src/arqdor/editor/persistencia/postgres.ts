/**
 * Persistência — adaptador Postgres (Supabase oficial via `DATABASE_URL`).
 *
 * Sem dependência de `pg`: recebe um `PoolLike` injetado (pg.Pool do servidor ou client Supabase).
 * Isso mantém o app funcional em dev com o adaptador local e permite o Postgres em produção sem
 * arrastar driver para o bundle do navegador.
 */

export interface PoolLike {
  query(texto: string, valores?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface MetaProjeto {
  id: string;
  atualizadoEm: string;
}

export interface AdaptadorProjeto {
  salvarProjeto(documento: { id: string }): Promise<void>;
  obterProjeto(id: string): Promise<unknown | null>;
  listarProjetos(): Promise<MetaProjeto[]>;
}

const TABELA = 'arqdor_projetos';

export function criarAdaptadorPostgres(pool: PoolLike): AdaptadorProjeto {
  return {
    async salvarProjeto(documento) {
      // jsonb: o driver serializa o objeto; dados completos ficam versionados no hash do documento.
      await pool.query(
        'insert into ' + TABELA + ' (id, dados) values ($1, $2) on conflict (id) do update set dados = excluded.dados, atualizado_em = now()',
        [documento.id, documento],
      );
    },

    async obterProjeto(id) {
      const resultado = await pool.query('select dados from ' + TABELA + ' where id = $1', [id]);
      const linha = resultado.rows[0];
      if (linha === undefined) return null;
      return linha['dados'] ?? null;
    },

    async listarProjetos() {
      const resultado = await pool.query(
        'select id, atualizado_em from ' + TABELA + ' order by atualizado_em desc limit 200',
      );
      return resultado.rows.map((linha) => ({
        id: String(linha['id']),
        atualizadoEm: String(linha['atualizado_em']),
      }));
    },
  };
}

export interface OpcoesResiliente {
  primario: AdaptadorProjeto;
  reserva: AdaptadorProjeto;
  aoFalhar?: (erro: unknown) => void;
}

/**
 * Tenta o Postgres; se a operação lançar (banco fora, credencial inválida, dev sem rede), cai para
 * o adaptador local. É o que mantém `next dev` funcionando sem Supabase.
 */
export function criarAdaptadorResiliente(opcoes: OpcoesResiliente): AdaptadorProjeto {
  return {
    async salvarProjeto(documento) {
      try {
        await opcoes.primario.salvarProjeto(documento);
      } catch (erro) {
        opcoes.aoFalhar?.(erro);
        await opcoes.reserva.salvarProjeto(documento);
      }
    },

    async obterProjeto(id) {
      try {
        const doPrimario = await opcoes.primario.obterProjeto(id);
        if (doPrimario !== null) return doPrimario;
      } catch (erro) {
        opcoes.aoFalhar?.(erro);
      }
      return opcoes.reserva.obterProjeto(id);
    },

    async listarProjetos() {
      try {
        return await opcoes.primario.listarProjetos();
      } catch (erro) {
        opcoes.aoFalhar?.(erro);
        return opcoes.reserva.listarProjetos();
      }
    },
  };
}

export interface AmbientePersistencia {
  /** Presente no Supabase; ausente em dev. */
  DATABASE_URL?: string;
}

/**
 * Escolhe o adaptador: com `DATABASE_URL` + pool → Postgres com fallback local; sem → local.
 * O pool é injetado pelo servidor (nunca no bundle do cliente).
 */
export function adaptadorDeAmbiente(
  ambiente: AmbientePersistencia,
  local: AdaptadorProjeto,
  pool: PoolLike | null,
  aoFalhar?: (erro: unknown) => void,
): AdaptadorProjeto {
  const url = ambiente.DATABASE_URL;
  if (url === undefined || url.trim().length === 0 || pool === null) return local;
  return criarAdaptadorResiliente({ primario: criarAdaptadorPostgres(pool), reserva: local, aoFalhar });
}
