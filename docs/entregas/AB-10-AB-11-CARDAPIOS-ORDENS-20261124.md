# AB-10/AB-11 — Cardápios e ordens de compra do A&B

Atualização: 2026-11-24. Branch: `feat/ab-completo-20261124` (continua o PR
[#3715](https://github.com/casaforteicf/vendorai-platform-replit/pull/3715)).
Base: `84b9bb7b0` + merge de `262ea9097` (`main`).

## Objetivo e escopo

Fechar as duas lacunas que restavam no A&B depois dos lotes AB-01 a AB-09:
**cardápios persistidos por data/serviço** e **ordens de compra gerenciáveis**
em cima do motor preditivo.

O que já existia no PR #3715 e foi preservado: cargos, fichas técnicas, sobras,
estoque com FEFO, recebimentos, requisições, mapeamento produto→insumo, motor
preditivo, sync de saldos e dashboard de CMV.

Fora do escopo: integração financeira/fornecedor por ordem, nota/recibo,
disparo automático de cotação, PDF de cardápio e permissões de recepção
(escrita segue admin-only).

## Atualização com a main

O PR estava 103 commits atrás. O merge de `main` teve dois conflitos add/add,
resolvidos mantendo a versão do branch (mais nova):

- `lib/db/src/schema/operations_ab.ts` — o branch tem as tabelas AB-04..AB-09
  além da base AB-03; o trecho da main era idêntico até onde existia.
- `docs/entregas/AB-03-20261103.md` — a versão do branch é a v1.2 e cobre os
  lotes seguintes; a v1.1 da main era anterior.

Depois do merge, `routes/index.ts`, `HotelModulesNav` e `AppLegacy` convivem
com as rotas de Hotelaria e CRM já publicadas.

## AB-10 — Cardápios

### Banco

Migration `lib/db/migrations/541_ab_10_cardapios.sql`:

- `ab_cardapios`: nome, data, serviço (`cafe_manha`/`almoco`/`jantar`/`outro`),
  ativo, observação, criador; único por `(tenant, data, serviço, nome)`.
- `ab_cardapio_itens`: ficha, snapshot do nome, porções por hóspede, ordem;
  único por `(tenant, cardápio, ficha)`; FK composta para a ficha e para o
  cardápio (cascade).
- RLS por `app.tenant_id`, índices e reaplicável (`DROP POLICY IF EXISTS`).

Espelho Drizzle + zod em `lib/db/src/schema/operations_ab.ts`.

### API — `artifacts/api-server/src/routes/ab_cardapios.ts`

| Endpoint | Comportamento |
|---|---|
| `GET /ab/cardapios?data=&servico=` | Lista com itens; por padrão só ativos |
| `GET /ab/cardapios/:id` | Cardápio + itens |
| `POST /ab/cardapios` | Cria cardápio + itens na mesma transação |
| `PATCH /ab/cardapios/:id` | Edita cabeçalho e/ou substitui os itens |
| `DELETE /ab/cardapios/:id` | Exclui (itens caem por cascade) |

Validações: ficha do mesmo tenant, sem prato repetido, porções > 0, serviço
válido, data ISO, nome único por data/serviço. Escrita admin-only; leitura
liberada ao hotel.

### UI

- Nova tela `Cardapios.tsx` (`/hotelaria/ab/cardapios`): data/serviço, seleção
  de fichas ativas com porções por hóspede, edição, exclusão e atalho para o
  briffing.
- `Briffing.tsx` passou a aceitar `?cardapio=<id>`: carrega o cardápio real,
  usa as porções por hóspede e mostra o nome/data/serviço no lugar do mock.
  Sem o parâmetro, mantém o comportamento anterior (todas as fichas ativas,
  1 porção por hóspede).
- Link “Cardápios” no menu A&B.

## AB-11 — Ordens de compra

### API — `artifacts/api-server/src/routes/ab_ordens_compra.ts`

| Endpoint | Comportamento |
|---|---|
| `GET /ab/ordens-compra?status=` | Lista ordens com itens |
| `GET /ab/ordens-compra/:id` | Detalhe |
| `POST /ab/ordens-compra/gerar` | Roda o motor preditivo para o tenant e devolve a ordem do período |
| `PATCH /ab/ordens-compra/:id` | Status e observação |
| `PATCH /ab/ordens-compra/:id/itens/:itemId` | Quantidade/custo/observação (só `sugerida`) |
| `DELETE /ab/ordens-compra/:id/itens/:itemId` | Remove item (só `sugerida`) |

Ciclo de status em `lib/ab/ordens-compra.ts`: `sugerida → aprovada → enviada →
recebida`, com cancelamento antes de receber; nada pula etapa e ordem terminal
não reabre. A aprovação grava `aprovadaPor`/`aprovadaEm`.

O job preditivo agora:

- grava `custoEstimado` a partir do preço do insumo no catálogo;
- considera qualquer ordem do período que ainda represente compra
  (sugerida/aprovada/enviada/recebida) na idempotência — gerar de novo depois
  de aprovar não duplica pedido.

A entrada de estoque continua no recebimento (AB-06/07); “recebida” na ordem é
uma marcação operacional, não uma baixa de saldo.

### UI

Nova tela `OrdensCompra.tsx` (`/hotelaria/ab/ordens-compra`): geração com data
de referência/cobertura, filtro por status, lista, detalhe, edição de
quantidade/custo enquanto sugerida e ações de aprovar/enviar/receber/cancelar.
Link no menu A&B.

## Validação

### Migration em Postgres real (temporário)

Container `postgres:16-alpine` descartável, removido ao final. Pré-requisitos
mínimos (`tenants`, `users`, `insumos`), depois:

- `20261103_ab_03_fundacao_ab.sql` — aplicada;
- `541_ab_10_cardapios.sql` — aplicada **duas vezes** com `ON_ERROR_STOP=1`;
- dados de teste: ficha, cardápio e item com 0,5 porção/pax;
- falhas esperadas confirmadas: ficha repetida, nome repetido por
  data/serviço, porções zero, serviço inválido, ficha de outro tenant e
  criador de outro tenant;
- exclusão do cardápio removeu os itens por cascade (0 restantes).

### Código

- `vitest` API A&B: **59/59** (53 existentes + 6 novos do ciclo de ordens).
- `vitest` frontend A&B: **82/82** (9 arquivos).
- `tsc -p artifacts/api-server/tsconfig.json --noEmit`: exit 0.
- `node artifacts/api-server/build.mjs`: exit 0.
- `vite build`: exit 0.
- `tsc` do frontend: **zero** erros nos arquivos novos/alterados de A&B.

## Estado e limites

Implementado e validado tecnicamente. **Sem merge, publicação ou alteração de
produção.** Homologação funcional com banco real e aprovação de release
pendentes. Próximo passo: atualizar o PR #3715 com esta branch, revisar,
aplicar as migrations e homologar em tenant piloto.

Limitações conhecidas: ordem não agrupa por fornecedor nem gera cotação;
“recebida” não baixa estoque; cardápio não gera requisição automaticamente;
sem PDF/impressão de cardápio; escrita admin-only.
