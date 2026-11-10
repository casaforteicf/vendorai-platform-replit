/**
 * Persistência no servidor — adaptador de arquivo (o mesmo contrato do Postgres).
 *
 * O que este teste prova: o documento sai do navegador e fica em disco. Uma SEGUNDA
 * instância do adaptador, lendo o mesmo caminho, enxerga o dado — ou seja, não é memória.
 * É a garantia de que "limpar o cache do navegador" não apaga projeto.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { armazenamentoArquivo } from '../../src/lib/db/arquivo';
import { ErroPersistencia } from '../../src/lib/db/armazenamento';
import { novoDocumento } from '../../src/arqdor/editor/persistencia/localStore';

let passou = 0;
let falhou = 0;
function ok(condicao: boolean, nome: string): void {
  if (condicao) {
    passou += 1;
    console.log('  ok   ' + nome);
  } else {
    falhou += 1;
    console.log('  FALHA ' + nome);
  }
}

async function codigoDe(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
    return 'SEM_ERRO';
  } catch (erro) {
    return erro instanceof ErroPersistencia ? erro.codigo : 'ERRO_INESPERADO';
  }
}

export async function executar(): Promise<void> {
  console.log('Persistência no servidor — adaptador de arquivo');

  const pasta = await mkdtemp(join(tmpdir(), 'arqdor-persist-'));
  const caminho = join(pasta, 'projetos.json');

  try {
    const armazenamento = armazenamentoArquivo(caminho);
    ok(armazenamento.backend === 'arquivo', 'backend reportado é "arquivo"');

    const documento = novoDocumento('Casa Persistida');
    await armazenamento.criar(documento);

    const lista = await armazenamento.listar();
    ok(lista.length === 1, 'criar → aparece na listagem');
    ok(lista[0].nome === 'Casa Persistida', 'listagem traz o nome');
    ok(lista[0].id === documento.projeto.id, 'listagem traz o id');

    const lido = await armazenamento.obter(documento.projeto.id);
    ok(lido !== null && lido.projeto.nome === 'Casa Persistida', 'obter devolve o documento');

    // SEGUNDA instância no mesmo caminho: prova que o dado está no disco.
    const outra = armazenamentoArquivo(caminho);
    const relido = await outra.obter(documento.projeto.id);
    ok(relido !== null && relido.versao === 2, 'outra instância lê do disco (não é memória)');

    const atualizado = { ...documento, projeto: { ...documento.projeto, nome: 'Casa Renomeada', atualizadoEm: new Date().toISOString() } };
    await armazenamento.salvar(atualizado);
    const apos = await outra.obter(documento.projeto.id);
    ok(apos !== null && apos.projeto.nome === 'Casa Renomeada', 'salvar altera o documento persistido');

    ok((await codigoDe(armazenamento.criar(documento))) === 'DUPLICADO', 'criar id repetido → DUPLICADO');

    const fantasma = novoDocumento('Fantasma');
    ok((await codigoDe(armazenamento.salvar(fantasma))) === 'NAO_ENCONTRADO', 'salvar projeto inexistente → NAO_ENCONTRADO');

    const invalido = { ...novoDocumento('Inválido'), versao: 99 };
    ok((await codigoDe(armazenamento.criar(invalido))) === 'INVALIDO', 'documento com versão futura → INVALIDO');

    ok((await armazenamento.remover(documento.projeto.id)) === true, 'remover devolve true');
    ok((await armazenamento.remover(documento.projeto.id)) === false, 'remover de novo devolve false');
    ok((await armazenamento.listar()).length === 0, 'após remover, listagem vazia');
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => undefined);
  }

  console.log('');
  console.log('resultado: ' + String(passou) + ' passaram, ' + String(falhou) + ' falharam');
  if (falhou > 0) throw new Error('falhas: ' + String(falhou));
}

