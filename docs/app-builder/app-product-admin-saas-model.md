# Modelo comercial e funcional do App Builder

Todo app criado pelo VendorAI deve ser separado em três produtos conectados, sem confundir o que é vendido como app com o que é vendido depois como SaaS recorrente.

## 1. APP PRODUCT
É o produto que o cliente compra. Precisa ter valor próprio e funcionar para o objetivo principal do segmento sem depender da assinatura VendorAI SaaS.

Deve conter as funções nativas usadas pelo usuário final, como consultas, pedidos, agendamentos, documentos, notificações, portal, e-commerce, fidelidade, formulários, conteúdo, agente e outras capacidades específicas do segmento.

Regra: nenhuma função essencial para a promessa comercial do App Product pode ficar escondida atrás do VendorAI SaaS.

## 2. APP ADMIN
É o painel nativo de administração básica do próprio app.

Deve permitir ao comprador operar aquilo que pertence diretamente ao app: usuários, conteúdo, cadastros, pedidos, agenda, catálogo, documentos, configurações, notificações e demais itens que façam parte do produto vendido.

O App Admin não deve virar um segundo CRM, um segundo Marketing Hub ou uma cópia simplificada de toda a plataforma VendorAI.

## 3. VENDORAI SaaS
É o produto recorrente vendido separadamente para administrar o negócio e ampliar o app com gestão, inteligência e automação.

Pode incluir CRM, leads, omnichannel, campanhas, gerador de conteúdo, analytics, automações, agentes de IA, Revenue Scout, financeiro, Customer Intelligence, churn, Next Best Action, integrações avançadas, gestão comercial, governança e outras capacidades compartilhadas da plataforma.

## Fluxo de dados

`APP PRODUCT -> eventos/dados -> VENDORAI SaaS -> inteligência/automação/gestão -> ações e atualizações -> APP PRODUCT`

O App Admin continua disponível para a administração nativa do produto, enquanto o VendorAI SaaS gerencia o negócio de forma mais ampla.

## Regra para o Arquiteto IA

Toda arquitetura gerada deve incluir `definition.productModel` com três camadas:

- `appProduct`: proposta de valor, funções nativas, jornadas e canais.
- `appAdmin`: funções de administração nativa e escopo administrado.
- `vendorAiSaas`: proposta de valor recorrente, capacidades, dados consumidos e ações devolvidas ao app.
- `boundaries`: fronteiras para evitar duplicação entre App Admin e VendorAI SaaS.
- `monetization`: como o app é vendido, como o SaaS é cobrado e quais add-ons podem existir.

O Arquiteto IA deve preservar esse modelo em revisões futuras e apontar como gap qualquer capacidade necessária que ainda não exista nos registries oficiais.