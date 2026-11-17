/**
 * Adaptador de arquivo — modo de desenvolvimento (sem `DATABASE_URL`).
 *
 * Grava o documento versionado inteiro em `.data/arqdor/projetos.json`, no servidor.
 * Não é mock: o dado é real, persistido em disco, e sobrevive a limpar o cache do navegador.
 * A interface é idêntica à do Postgres, então trocar de backend é só variável de ambiente.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DocumentoArqdor, ErroDocumento } from '../../arqdor/editor/persistencia/documento';
import { validar } from '../../arqdor/editor/persistencia/documento';
import type { Armazenamento, ResumoProjeto } from './armazenamento';
import { ErroPersistencia, contarObjetos } from './armazenamento';

interface EstadoArquivo {
  /** Chaveado por id do projeto. */
  projetos: Record<string, DocumentoArqdor>;
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

function caminhoPadrao(): string {
  return join(process.cwd(), '.data', 'arqdor', 'projetos.json');
}

async function ler(caminho: string): Promise<EstadoArquivo> {
  try {
    const texto = await readFile(caminho, 'utf8');
    const bruto: unknown = JSON.parse(texto);
    if (typeof bruto !== 'object' || bruto === null) return { projetos: {} };
    const projetos = (bruto as { projetos?: unknown }).projetos;
    if (typeof projetos !== 'object' || projetos === null) return { projetos: {} };
    return { projetos: projetos as Record<string, DocumentoArqdor> };
  } catch (erro) {
    if ((erro as { code?: string }).code === 'ENOENT') return { projetos: {} };
    throw new ErroPersistencia('FALHA', 'não foi possível ler o arquivo de projetos: ' + String(erro));
  }
}

/** Escrita atômica: grava em `.tmp` e renomeia, para não corromper o arquivo em queda. */
async function gravar(caminho: string, estado: EstadoArquivo): Promise<void> {
  await mkdir(dirname(caminho), { recursive: true });
  const temporario = caminho + '.tmp';
  await writeFile(temporario, JSON.stringify(estado, null, 2), 'utf8');
  await rename(temporario, caminho);
}

export function armazenamentoArquivo(caminho: string = caminhoPadrao()): Armazenamento {
  return {
    backend: 'arquivo',

    async listar(): Promise<ResumoProjeto[]> {
      const estado = await ler(caminho);
      return Object.values(estado.projetos)
        .map((documento) => ({
          id: documento.projeto.id,
          nome: documento.projeto.nome,
          atualizadoEm: documento.projeto.atualizadoEm,
          objetos: contarObjetos(documento),
        }))
        .sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1));
    },

    async criar(documento: DocumentoArqdor): Promise<DocumentoArqdor> {
      const lido = validar(documento);
      if (!lido.ok) throw new ErroPersistencia('INVALIDO', 'documento inválido: ' + descreverErro(lido.erro));
      const estado = await ler(caminho);
      if (estado.projetos[documento.projeto.id] !== undefined) {
        throw new ErroPersistencia('DUPLICADO', 'já existe projeto com id ' + documento.projeto.id);
      }
      estado.projetos[documento.projeto.id] = lido.documento;
      await gravar(caminho, estado);
      return lido.documento;
    },

    async obter(id: string): Promise<DocumentoArqdor | null> {
      const estado = await ler(caminho);
      return estado.projetos[id] ?? null;
    },

    async salvar(documento: DocumentoArqdor): Promise<DocumentoArqdor> {
      const lido = validar(documento);
      if (!lido.ok) throw new ErroPersistencia('INVALIDO', 'documento inválido: ' + descreverErro(lido.erro));
      const estado = await ler(caminho);
      if (estado.projetos[documento.projeto.id] === undefined) {
        throw new ErroPersistencia('NAO_ENCONTRADO', 'projeto ' + documento.projeto.id + ' não existe');
      }
      estado.projetos[documento.projeto.id] = lido.documento;
      await gravar(caminho, estado);
      return lido.documento;
    },

    async remover(id: string): Promise<boolean> {
      const estado = await ler(caminho);
      if (estado.projetos[id] === undefined) return false;
      delete estado.projetos[id];
      await gravar(caminho, estado);
      return true;
    },
  };
}
