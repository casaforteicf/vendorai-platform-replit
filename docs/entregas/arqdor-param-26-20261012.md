# ARQ-PARAM-26 — preços e integração do orçamento de esquadrias

Versão: 2026.10.12.26
Código: 789023516069577f059800f6685292e2bf78861e
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Painel com consulta de preços de venda e confirmação de envio ao orçamento. Endpoint POST /api/arch/concept-projects/:id/opening-budget resolve produtos ativos no catálogo comercial mestre do tenant; usa preço promocional vigente ou preço base, calcula por peça ou largura × altura para m² e arredonda nas escalas do orçamento existente. Ausência de produto/preço/medidas, unidade incompatível ou encaixe fora da parede impedem envio. Sem preço fictício.

Prévia retorna assinatura SHA-256 do modelo de aberturas, itens/preços resolvidos, itens próprios existentes e projeto vinculado. Aplicação rejeita assinatura desatualizada e requer Projeto Arqdor do mesmo tenant. Aberturas são lidas da configuração salva do Concept, com filtro de tenant e proprietário. Produtos e projeto são filtrados pelo tenant da sessão, sem preços vindos do cliente.

Transação e advisory lock serializam envios deste Concept. IDs estáveis por Concept/abertura evitam duplicação. Atualiza itens próprios, remove obsoletos desta origem e preserva itens manuais/outras origens. Recalcula total do orçamento do Projeto Arqdor. A ação é disparada pelo botão após a consulta, não por renderização do painel. Mudança de aberturas invalida prévia local; assinatura no servidor confere a configuração realmente salva.

Corrigida rota existente de vincular produto ao item de orçamento: lê produtos_catalogo mestre ativo e do tenant do projeto, substituindo arch_catalogo antigo; rejeita preço base ausente/inválido.

## Arquivos
- artifacts/api-server/src/lib/arch-opening-budget.ts
- artifacts/api-server/src/lib/arch-opening-budget.test.ts
- artifacts/api-server/src/routes/arch.ts
- artifacts/frontend/src/pages/arch/ConceptOpeningBudget.tsx
- artifacts/frontend/src/pages/arch/ConceptOpeningBudget.test.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.tsx
- artifacts/frontend/src/pages/arch/ConceptPlanner.tsx

## Verificação local
85 testes aprovados em 18 arquivos focados: 81 frontend e 4 helper de orçamento backend. Cobre preço base/promoção vigente/expirada, unidade por área, ausência de dados/preços, IDs estáveis, atualização sem duplicidade/preservação de manual/remoção de obsoleto, consulta/confirmação UI, prévia incompleta e erro de orçamento desatualizado. TypeScript dos componentes locais/painel e helper aprovado. Transformação sintática esbuild da rota passou; não equivale a build completo nem typecheck da API.

## Limites e pendências
Rotas HTTP com autenticação/banco, rollback transacional e concorrência reais ainda NÃO executados. Sem homologação oficial, build completo ou publicação. Schema/migrações não alterados. Integração cobre esquadrias customOpenings e orçamento do Projeto Arqdor vinculado; não inclui orçamento integral de lajes/coberturas/revestimentos/mobiliário, propostas CRM ou composição de mão de obra. Unidade do catálogo deve ser por peça ou m²; demais unidades são bloqueadas. Altura de parede considerada 2,80 m. Quantidades por m² persistidas com duas casas conforme coluna existente. Revisões diferentes podem gerar conjuntos próprios; conciliação comercial de versões fica fora deste lote. Advisory lock só coordena este endpoint; demais edições do orçamento seguem comportamento existente. Homologação/publicação Contabo permanecem adiadas conforme orientação da conversa. Sem merge/main/deploy.
