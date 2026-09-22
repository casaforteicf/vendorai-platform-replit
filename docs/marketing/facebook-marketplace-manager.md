# Facebook Marketplace Manager

## Objetivo
Transformar o catálogo oficial do VendorAI em anúncios rastreáveis para Facebook Marketplace sem criar catálogo paralelo.

## Fluxo MVP
1. Produto vem de `produtos_catalogo`.
2. Usuário escolhe produto, cidade/UF e categoria opcional.
3. Backend usa o AI Gateway (`content_generator`) para preparar título e descrição, com fallback determinístico.
4. O rascunho é salvo em `facebook_marketplace_listings`.
5. "Publicar" copia o conteúdo, marca a listagem como pronta e abre a criação de item no Facebook Marketplace.
6. Usuário cola a URL final do anúncio; o VendorAI passa a acompanhar status: rascunho, pronto, publicado, pausado, vendido, renovar ou falha.

## Governança
- Modo inicial: `assisted`.
- Nenhum robô simula cliques ou credenciais da conta Facebook.
- O campo `publish_mode` já aceita `official_api` para um futuro conector oficial elegível.
- Campanhas podem ser vinculadas por `campaign_id` sem duplicar a entidade de campanha.
- Fotos e preço continuam vindo do catálogo oficial.
