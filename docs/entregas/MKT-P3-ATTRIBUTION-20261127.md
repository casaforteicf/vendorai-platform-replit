# MKT-P3 — Atribuição peça → lead → negócio (UTM)

Data: 2026-11-27
Branch: `feat/mkt-p3-attribution` (base `main` @ 503a0baa8)

## Objetivo
Fechar o ciclo: o link publicado leva `utm_content=<peça>`; o lead guarda a atribuição;
o painel mostra quais peças geraram negócios.

## Entregue
- **API** `GET /marketing/attribution-pieces`:
  - agrupa leads por `utm_content` (`leads.discoveryData.attribution`),
  - soma negócios ganhos e receita (deals `etapa = 'ganho'`),
  - devolve tema/canal/tipo da peça quando ela existe no calendário.
- **Painel de diagnóstico**: seção **“Peças que geraram negócios”**
  (peça, leads, vendas, receita) — até 5.
- Sem migração: a atribuição já é persistida em `discoveryData`.

## Validação
- API build **EXIT 0**; frontend build **EXIT 0**.
- Testes: vendor-brain **51/51**; funil **7/7**.

## Limite
- Só atribui quando o lead chega por link com `utm_content` (site/LP). Tráfego sem UTM
  continua fora — é o comportamento correto (não inventar atribuição).
