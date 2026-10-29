# Vendor.ai — integração da biblioteca Luxury (28/10/2026)

## Fonte da integração
ZIP `Luxuryfontsss.zip` enviado pelo usuário. Quatorze arquivos OTF/TTF foram inspecionados. O pacote de entrega gerado contém seis arquivos WOFF2 (quatro famílias), com leitura e suporte aos acentos comuns do português brasileiro conferidos via FontTools.

## Arquivos WOFF2 obrigatórios
Copiar os **mesmos seis arquivos** para:
- `artifacts/frontend/public/fonts/vendorai/`
- `artifacts/website/public/fonts/vendorai/`

Arquivos:
- `awaking.woff2` — Awaking Regular, peso 400
- `awaking-light.woff2` — Awaking Light, peso 300
- `awaking-bold.woff2` — Awaking Bold, peso 700
- `clarissa.woff2` — Clarissa, Regular
- `manage.woff2` — Manage, Regular
- `qualli.woff2` — Qualli, Regular

O arquivo entregue com o pacote de fontes inclui `manifest.json` (SHA-256, tamanho e suporte a caracteres), `fontes-luxury.css` e `previa.html`.

## Estado neste PR
As quatro famílias foram registradas no catálogo compartilhado de tipografia, o seletor de criativos agora conhece as novas famílias, os pesos reais da Awaking são declarados no editor, e os estilos do website declaram os arquivos WOFF2. **Os binários ainda não foram anexados ao repositório**: não promover este PR antes de anexar/verificar os seis assets em ambos os diretórios.

## Homologação antes da publicação
1. Confirmar direitos para uso comercial e hospedagem web com os fornecedores.
2. Anexar os seis arquivos em ambos os diretórios, verificando os hashes do manifest.
3. Rodar testes de TypeScript, build do frontend, build do website e testes existentes.
4. Servir as seis URLs em homologação e verificar HTTP 200, tipo `font/woff2`, e carregamento sem erros OTS do Chromium.
5. Conferir título, legenda, exportação e caracteres "á ã ç ô é í õ ú" no editor de criativos; verificar fallback em dispositivos móveis.
6. Validar fluxo de publicação/rollback e só então fazer merge.

## Reservas de licenciamento
O ZIP original **não contém** licença de uso comercial, webfont ou redistribuição. `Astella Luxury Demo` e `FSP DEMO - Kontras` estão excluídas deste PR: ambas têm indicação de demonstração e a Kontras não contém acentuação adequada ao português. A Astella também não apresenta numerais básicos.

Não substituir globalmente Inter ou as fontes de interface: as novas famílias são opções para peças e materiais de marca, por tenant/projeto.
