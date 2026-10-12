# UI-01.10 — Ajuste aprovado: entrada adaptativa + Marketplace Casa

Issue #3452 · PR #3453 · Estado: contratos implementados, interface ativa e rotas públicas ainda pendentes.

## Decisões
1. A escolha de módulos após login é opcional por pessoa e contexto. Pode-se abrir o módulo principal, retomar o último módulo permitido ou mostrar o seletor.
2. Mostrar somente interseção entre módulos habilitados, permissões efetivas no backend e audiência do contexto. Administradores não ganham capacidades pagas automaticamente.
3. Consumidor comum deve ir direto ao Portal do Cliente ou Marketplace Casa quando houver uma rota e autorização verificadas. Não mostrar todos os módulos empresariais.
4. CRM, Marketing, Omnichannel, Agenda, Arqdor, Obras, ERP, PDV, Parceiros, Portal do Cliente, Marketplace, IA, Inteligência e Configurações não são duplicados no menu por causa de seus atalhos contextuais.
5. Marketplace Casa é uma vitrine pública vertical especializada dentro do Marketplace existente; um único catálogo comercial, pedidos, comissões, fornecedores e clientes. Os filtros por segmento não alteram o mecanismo de persistência.
6. Tipos de transação: visita/proposta (imóveis e terrenos), cotação (serviços/construção), catálogo/carrinho (itens padronizados). A implementação real deve suportar exceções por anúncio e categoria.
7. Anúncio público não revela IDs de negócios ou projetos privados. Atribuição e comissionamento dependem de política, pagamento efetivo e auditoria.
8. Negócio é o eixo comercial quando houver oportunidade; cadastros genéricos e visitas anônimas não criam negócios obrigatoriamente.

## Implementado na branch
- `artifacts/frontend/src/lib/adaptiveModuleLauncher.ts`
- `artifacts/frontend/src/lib/marketplaceCasaCatalog.ts`
- `artifacts/frontend/src/lib/adaptiveModuleLauncher.test.ts`

## Limites importantes
- Nenhuma UI de seleção após login foi ativada.
- Nenhuma rota pública nova do Marketplace Casa foi publicada.
- Nenhum vínculo ou compra real foi feito.
- Alguns caminhos definitivos seguem indefinidos no catálogo: módulos sem rota verificada usam `null` para impedir redirecionamento indevido.
- O login, Portal do Cliente e Marketplace existentes continuam como estão.

## Pendências antes da homologação
1. Auditar rotas reais e permissões dos módulos; substituir caminhos provisórios por rotas existentes verificadas.
2. API autenticada fornecer `enabledModules` e `permittedModules` efetivos por contexto.
3. Criar o seletor visual no layout oficial Vendor.ai e preferências persistidas do usuário; habilitar por flag.
4. Criar landing pública Mercado Casa, pesquisa e filtro por região/categoria, com isolamento de dados e moderação.
5. Reaproveitar itens e pedidos existentes na API de Marketplace; preservar fluxo de imóveis/terrenos por proposta.
6. Integrar propostas, leads, CRM e Portal do Cliente por vínculo de origem e negócio, com privacidade.
7. Rodar Vitest/typecheck, revisar acessibilidade, homologar e só então liberar por tenant/perfil.

Produção imutável: sem merge ou deploy nesta entrega.
