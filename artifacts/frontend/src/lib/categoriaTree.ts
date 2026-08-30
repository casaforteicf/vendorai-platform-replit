// Utilitário compartilhado pra trabalhar com a hierarquia de categorias
// de produto (categoriasProdutoTable — parentId + nivel, até 8 níveis:
// categoria → subcategoria → nicho → linha → aplicacao → sublinha →
// utilidade → familia). A API já devolve tudo achatado (parentId em
// cada item); isso monta a árvore e devolve em ordem visual (pai antes
// dos filhos, indentado), pra usar tanto no select do formulário de
// produto quanto na tela de gerenciar categorias.

export interface CategoriaLike {
  id: string;
  nome: string;
  parentId?: string | null;
  nivel: string;
}

export interface CategoriaComProfundidade<T extends CategoriaLike = CategoriaLike> {
  categoria: T;
  profundidade: number;
  caminho: string; // "Construção > Revestimentos > Branni Nóbile"
}

/** Acha em DFS, pais antes de filhos, cada nível ordenado por nome. */
export function ordenarArvoreCategorias<T extends CategoriaLike>(
  categorias: T[]
): CategoriaComProfundidade<T>[] {
  const porPai = new Map<string | null, T[]>();
  for (const c of categorias) {
    const parentId = c.parentId ?? null;
    const lista = porPai.get(parentId) ?? [];
    lista.push(c);
    porPai.set(parentId, lista);
  }
  for (const lista of porPai.values()) {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  const resultado: CategoriaComProfundidade<T>[] = [];
  function visitar(parentId: string | null, profundidade: number, caminhoPai: string) {
    const filhos = porPai.get(parentId) ?? [];
    for (const filho of filhos) {
      const caminho = caminhoPai ? `${caminhoPai} > ${filho.nome}` : filho.nome;
      resultado.push({ categoria: filho, profundidade, caminho });
      visitar(filho.id, profundidade + 1, caminho);
    }
  }
  visitar(null, 0, "");
  return resultado;
}

/** Monta uma árvore real (nested, com filhos) — usada na tela de gerenciar. */
export interface CategoriaComFilhos<T extends CategoriaLike = CategoriaLike> {
  categoria: T;
  filhos: CategoriaComFilhos<T>[];
}

export function montarArvoreCategorias<T extends CategoriaLike>(
  categorias: T[]
): CategoriaComFilhos<T>[] {
  const porPai = new Map<string | null, T[]>();
  for (const c of categorias) {
    const parentId = c.parentId ?? null;
    const lista = porPai.get(parentId) ?? [];
    lista.push(c);
    porPai.set(parentId, lista);
  }
  for (const lista of porPai.values()) {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  function montar(parentId: string | null): CategoriaComFilhos<T>[] {
    return (porPai.get(parentId) ?? []).map((c) => ({ categoria: c, filhos: montar(c.id) }));
  }
  return montar(null);
}
