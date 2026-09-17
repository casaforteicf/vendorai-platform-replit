# VendorAI — fonte da condição comercial

## Regra

O site institucional e as telas genéricas da plataforma não são fonte pública de preço.

A condição comercial é apresentada por uma Landing Page/campanha e acompanha a oportunidade até cadastro, proposta, aceite, checkout e cobrança. O catálogo/Super Admin continua mantendo preços internamente para faturamento, margem, histórico e operação.

## Oferta LP atual

Código: `vendorai_growth_5d_497_990_1490_v2`

- 5 dias completos grátis.
- R$ 497 pelos primeiros 30 dias pagos.
- R$ 990/mês pelos 5 meses seguintes.
- R$ 1.490/mês após a fase promocional.
- Alternativa pré-paga: +5 dias por R$ 399.

A fonte numérica única em código é `VENDORAI_LP_OFFER` (`lib/vendor-brain/src/vendorai-commercial-offer.ts`). LP e backend devem consumir esse objeto e não repetir valores localmente.

## Regras de UI

- Site institucional: explicar produtos, capacidades e formas de acesso, sem tabela pública de preços VendorAI.
- Página `/precos`: mantida por compatibilidade de URL, mas apresentada como **Como contratar** e sem valores.
- Produtos públicos: sem preço; CTA leva à experiência/LP/proposta.
- Plataforma do cliente: não mostrar tabela genérica de preços; mostrar a condição associada à oferta quando necessário para aceite/checkout.
- Super Admin: pode exibir preços, custos e margens porque é uma área operacional interna.
- LP: pode e deve mostrar a condição comercial da campanha.

## Regra de atribuição

A assinatura promocional automática só é preparada para um trial com origem comercial de LP/campanha. Um trial direto do site não deve receber silenciosamente uma condição promocional que não foi apresentada ao lead.

Cada alteração futura de oferta deve gerar um novo `campaignCode`. Condições aceitas nunca devem ser reescritas retroativamente; o snapshot da assinatura/proposta preserva os valores aceitos pelo cliente.
