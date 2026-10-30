# VendorAI Brand System

Este diretório é a fonte única de verdade para a identidade visual do VendorAI.

## Regra obrigatória

Toda mudança gráfica de produto deve nascer aqui e ser propagada para todos os pontos oficiais da plataforma:

- site público (`artifacts/website`)
- sistema web autenticado (`artifacts/frontend`)
- app mobile iOS/Android (`artifacts/mobile`)
- criativos e vídeos gerados pelo VendorAI
- e-mails, PDFs e materiais institucionais próprios do VendorAI

A única exceção é o white-label/co-branding do tenant. Nesses espaços, a identidade configurada pelo tenant pode substituir ou acompanhar a marca VendorAI conforme a regra do produto.

## Não fazer

Não criar novas cores primárias, logos, famílias tipográficas, raios ou escalas de título diretamente em uma tela. Não usar hex de marca hardcoded quando existir token equivalente.

## Fonte de verdade

- `src/tokens.ts`: cores, tipografia, escala, raios e caminhos oficiais de logo.
- `src/theme.css`: variáveis CSS consumidas pelo site e pelo sistema web.

O app mobile importa os mesmos tokens TypeScript através de `artifacts/mobile/constants`.

## Tipografia

- Interface e operação: **Inter**.
- Marca/display: **Rigter**, somente em usos de identidade e destaques apropriados.
- Editorial: **Malibu Sunday Serif**.
- Site público pode usar headlines maiores de marketing, mas cores, logo, fontes e proporções de marca continuam vindo deste Brand System.
- Sistema web e mobile devem usar escala compacta e orientada à operação.

## Cores oficiais

- Primary: `#2563EB`
- Primary Strong: `#1D4ED8`
- Info: `#2563EB`
- Ink: `#0F172A`
- Canvas: `#F8FAFC`

Azul é cor informativa/de apoio, não a cor principal da marca.

## Checklist de mudança gráfica

Antes de concluir uma alteração visual, verificar site, web app e mobile. Mudanças institucionais também devem ser refletidas nos criativos e nos materiais gerados pela plataforma. Nenhuma superfície oficial deve manter uma versão anterior do logo, paleta ou escala tipográfica.
