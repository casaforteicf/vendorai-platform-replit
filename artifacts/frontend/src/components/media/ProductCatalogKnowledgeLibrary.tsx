import ProductCatalogKnowledgeLibraryV2 from "./ProductCatalogKnowledgeLibraryV2";

/**
 * Mantém o módulo de Produtos do catálogo montado o tempo todo para que o
 * listener de clique da V2 esteja ativo já no primeiro clique.
 *
 * A implementação anterior montava a V2 somente depois de interceptar o
 * clique e então tentava reproduzir esse clique. Esse replay dependia da
 * ordem dos effects do React e podia deixar o clique escapar para a
 * Biblioteca de Mídias, que apenas filtrava a pasta "Produtos do catálogo"
 * e exibia "Nenhuma mídia encontrada".
 */
export default function ProductCatalogKnowledgeLibrary() {
  return <ProductCatalogKnowledgeLibraryV2 />;
}
