# HOTEL-13 — Catálogo de ingredientes do Restaurante separado da construção

Atualização: 2026-11-24. Branch: `fix/insumos-catalogo-restaurante`.
Base: `f3dd9e144`.

## Sintoma

No **Mapeamento de insumos (de-para)** do Restaurante, o select “Ingrediente
correspondente” listava o catálogo inteiro de construção: Aço CA-50, Abraçadeira
metálica, Argamassa, mão de obra etc. Não dava para achar/encontrar alimentos.

## Causa

Construção e Restaurante/A&B compartilham a tabela `insumos`. Não existia
nenhuma marcação de qual catálogo o item pertence, então `/ab/insumos` devolvia
os 798 insumos do tenant — 632 deles materiais de construção (`MAT-*`).

## Correção

- Migration `569_insumos_catalogo_restaurante.sql`:
  - adiciona `insumos.catalogo` (`construcao` default / `restaurante`);
  - backfill: itens já usados por ficha técnica ou de-para viram `restaurante`;
  - índice `(tenant_id, catalogo)`.
- APIs do Restaurante (`/restaurante/ingredientes` e importação) criam/atualizam
  sempre com `catalogo = 'restaurante'` e só consultam esse catálogo.
- `GET /ab/insumos` (fonte do de-para) filtra `catalogo = 'restaurante'`.
- Tela de mapeamento: quando não há ingredientes do Restaurante, mostra estado
  vazio com link para **Restaurante → Ingredientes**.

## Migration aplicada

`569` aplicada no banco de produção (`vendorai_migration_prepare`) como owner,
com ledger e checksum:

- checksum `ff2e8a9447a15c5d08960204a8aca4c45b3d74aa509a6c55ee4109e43f78e011`
- coluna `catalogo` criada; 798 itens existentes ficaram `construcao` (nenhum
  alimento legado no tenant CasaForteICF).

## Teste de integração (API local + banco de produção)

Tenant CasaForteICF:

1. `/ab/insumos` antes: **0** ingredientes do Restaurante (798 de construção
   continuam no catálogo de construção, mas não aparecem).
2. Cadastro de um ingrediente de teste: `201`.
3. `/ab/insumos` e `/restaurante/ingredientes`: **1** item, só o alimento.
4. Exclusão: `204`; volta a **0**. Nenhum resíduo.

## Validação

- `tsc` completo da API: exit 0.
- `node build.mjs`: exit 0.
- `vite build`: exit 0.

## Limite conhecido

A lista de **produtos do estoque** no de-para ainda é o catálogo de exemplo
(mock) da tela; o próximo lote deve trocá-la pelo estoque real de alimentos.
O filtro de ingredientes, que era o problema relatado, está resolvido.

## Estado

Migration aplicada e código validado tecnicamente. Sem merge/deploy automático.
