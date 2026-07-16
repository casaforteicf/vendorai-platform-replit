---
name: Revenue Scout score + valorEstimado
description: scoreOportunidade e valorEstimado automático no Revenue Scout — o que existe e o que foi adicionado
---

## O que já existia (não duplicar)

Revenue Scout tem implementação completa em `artifacts/api-server/src/services/revenueScout.ts`:
- Rules engine configurável por tenant: recompra, reativacao, cross_sell, upgrade, aniversario, sequencia_produto
- `scoutOportunidadesTable` com state machine completa (pendente → enviado → respondeu/converteu/ignorado/adiado)
- `reconcileScoutOnDealWon` para atribuição automática quando deal é ganho
- `triggerSequenceOffer` para timing de sequência pós-compra
- `clientServiceGapsTable` para tracking de gaps de serviço (beauty/clinic)

**NÃO reimplementar:** product_catalog (→ produtos_catalogo), purchase_history (→ propostas aceitas), revenue_opportunities (→ scout_oportunidades).

## O que foi adicionado

### `scoreOportunidade NUMERIC(5,2)`

Coluna nova em `scout_oportunidades`. Calculada em `calcularScoreOportunidade(tipo, diasDesdeUltimo, diasEsperado)`:

| tipo | base score |
|---|---|
| sequencia_produto | 80 |
| upgrade | 75 |
| cross_sell | 65 |
| aniversario | 60 |
| recompra | 55 |
| reativacao | 45 |

Bônus +10 quando `diasDesdeUltimo > diasEsperado * 1.5` (oportunidade atrasada em relação ao padrão).

### `valorEstimado` populado automaticamente

Para tipo `sequencia_produto`: lookup em `produtosCatalogoTable` por `cond.produtoSugeridoId`, usa `precoBase` como `valorEstimado`. Antes era sempre null.

**Por que importa:** o dashboard de scout (`GET /scout/dashboard`) já soma `valorEstimado` para calcular `receitaEstimada`. Antes era sempre 0.

### `processarOportunidades` ordenado por score DESC

Antes: `LIMIT 50` sem ORDER BY (ordem de inserção, aleatório). Agora: processa as oportunidades mais quentes primeiro no ciclo diário.

**Why:** Sequencias de produto (compra confirmada, produto já identificado, score ≥ 80) devem ser processadas antes de reativações de leads frios (score ≤ 45). Especialmente relevante quando há >50 oportunidades pendentes por tenant.
