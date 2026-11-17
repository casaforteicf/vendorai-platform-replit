/**
 * Adaptador Postgres (Drizzle) — backend oficial quando `DATABASE_URL` existe.
 *
 * Pool único por processo: em dev o Next recarrega módulos, então guardamos o pool no global
 * para não abrir conexão a cada request.
 *
 * O documento inteiro vai para a coluna `jsonb`. Elementos, sólidos e camadas vivem dentro
 * dele — a integridade é a mesma que o domínio já valida (`validar`).
 */

import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { DocumentoArqdor, ErroDocumento } from '../../arqdor/editor/persistencia/documento';
import { validar } from '../../arqdor/editor/persistencia/documento';
import type { Armazenamento, ResumoProjeto } from './armazenamento';
import { ErroPersistencia, contarObjetos } from './armazenamento';
import { projetos } from './schema';

const GLOBAL_POOL = Symbol.for('arqdor.pool');

interface ComPool {
  [GLOBAL_POOL]?: Pool;
}

function obterPool(url: string): Pool {
  const alvo = globalThis as unknown as ComPool;
  if (alvo[GLOBAL_POOL] === undefined) {
    alvo[GLOBAL_POOL] = new Pool({ connectionString: url, max: 5 });
  }
  return alvo[GLOBAL_POOL];
}

function descreverErro(erro: ErroDocumento): string {
  switch (erro.codigo) {
    case 'INVALIDO':
      return erro.problemas.map((problema) => problema.caminho + ': ' + problema.problema).join('; ');
    case 'VERSAO_DESCONHECIDA':
      return 'versão desconhecida v' + String(erro.versao);
    case 'VERSAO_A_FRENTE':
      return 'versão v' + String(erro.versao) + ' à frente da suportada v' + String(erro.suportada);
    case 'JSON_INVALIDO':
      return 'JSON inválido: ' + erro.detalhe;
  }
}

function ehViolacaoUnica(erro: unknown): boolean {
  return (erro as { code?: string }).code === '23505';
}

export function armazenamentoPostgres(url: string): Armazenamento {
  const db = drizzle(obterPool(url));

  return {
    backend: 'postgres',

    async listar(): Promise<ResumoProjeto[]> {
      const linhas = await db
        .select({
          id: projetos.id,
          nome: projetos.nome,
          atualizadoEm: projetos.atualizadoEm,
          documento: projetos.documento,
        })
        .from(projetos)
        .orderBy(desc(projetos.atualizadoEm));

      return linhas.map((linha) => ({
        id: linha.id,
        nome: linha.nome,
        atualizadoEm: linha.atualizadoEm.toISOString(),
        objetos: contarObjetos(linha.documento),
      }));
    },

    async criar(documento: DocumentoArqdor): Promise<DocumentoArqdor> {
      const lido = validar(documento);
      if (!lido.ok) throw new ErroPersistencia('INVALIDO', 'documento inválido: ' + descreverErro(lido.erro));
      try {
        await db.insert(projetos).values({
          id: lido.documento.projeto.id,
          nome: lido.documento.projeto.nome,
          versao: lido.documento.versao,
          documento: lido.documento,
          criadoEm: new Date(lido.documento.projeto.criadoEm),
          atualizadoEm: new Date(lido.documento.projeto.atualizadoEm),
        });
      } catch (erro) {
        if (ehViolacaoUnica(erro)) {
          throw new ErroPersistencia('DUPLICADO', 'já existe projeto com id ' + lido.documento.projeto.id);
        }
        throw erro;
      }
      return lido.documento;
    },

    async obter(id: string): Promise<DocumentoArqdor | null> {
      const linhas = await db.select({ documento: projetos.documento }).from(projetos).where(eq(projetos.id, id)).limit(1);
      const linha = linhas[0];
      return linha === undefined ? null : linha.documento;
    },

    async salvar(documento: DocumentoArqdor): Promise<DocumentoArqdor> {
      const lido = validar(documento);
      if (!lido.ok) throw new ErroPersistencia('INVALIDO', 'documento inválido: ' + descreverErro(lido.erro));
      const atualizados = await db
        .update(projetos)
        .set({
          nome: lido.documento.projeto.nome,
          versao: lido.documento.versao,
          documento: lido.documento,
          atualizadoEm: new Date(lido.documento.projeto.atualizadoEm),
        })
        .where(eq(projetos.id, lido.documento.projeto.id))
        .returning({ id: projetos.id });

      if (atualizados.length === 0) {
        throw new ErroPersistencia('NAO_ENCONTRADO', 'projeto ' + lido.documento.projeto.id + ' não existe');
      }
      return lido.documento;
    },

    async remover(id: string): Promise<boolean> {
      const removidos = await db.delete(projetos).where(eq(projetos.id, id)).returning({ id: projetos.id });
      return removidos.length > 0;
    },
  };
}
