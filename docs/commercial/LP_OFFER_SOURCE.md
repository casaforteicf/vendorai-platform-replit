# VendorAI — fonte da condição comercial

## Regra

O site institucional e as telas genéricas da plataforma não são fonte pública de preço.

A condição comercial é apresentada por uma Landing Page/campanha e acompanha a oportunidade até cadastro, proposta, aceite, checkout e cobrança. O catálogo/Super Admin continua mantendo preços internamente para faturamento, margem, histórico e operação.

## Oferta LP atual

Código: `vendorai_growth_5d_399_1490_v3`

- 5 dias completos grátis para validar o VendorAI.
- Growth contínuo: R$ 1.490/mês.
- Alternativa pré-paga: +5 dias por R$ 399.
- Não existe sequência intermediária de R$ 497 ou R$ 990 nesta oferta.

A fonte numérica única em código é `VENDORAI_LP_OFFER` (`lib/vendor-brain/src/vendorai-commercial-offer.ts`). LP e backend devem consumir esse objeto e não repetir valores localmente.

## Regras de UI

- Site institucional: explicar produtos, capacidades e formas de acesso, sem tabela pública de preços VendorAI.
- Página `/precos`: mantida por compatibilidade de URL, mas apresentada como **Como contratar** e sem valores.
- Produtos públicos: sem preço; CTA leva à experiência/LP/proposta.
- Plataforma do cliente: não mostrar tabela genérica de preços; mostrar a condição associada à oferta quando necessário para aceite/checkout.
- Super Admin: pode exibir preços, custos e margens porque é uma área operacional interna.
- LP: pode e deve mostrar a condição comercial da campanha.

## Regra de atribuição

A assinatura Growth só é preparada para um trial com origem comercial de LP/campanha e seleção explícita do plano. Um trial direto do site não deve criar silenciosamente compromisso pago.

Cada alteração futura de oferta deve gerar um novo `campaignCode`. Condições aceitas nunca devem ser reescritas retroativamente; o snapshot da assinatura/proposta preserva os valores aceitos pelo cliente.
