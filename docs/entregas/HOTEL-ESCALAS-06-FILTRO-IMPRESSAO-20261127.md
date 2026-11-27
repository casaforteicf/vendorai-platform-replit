# HOTEL-ESCALAS-06 — filtro por setor e impressão (escala e folgas)

Data: 2026-11-27. Base: `main` `e57c8d618`.

## Objetivo

Completar o uso operacional da escala: filtrar por setor e imprimir a escala
mensal e o mapa de folgas em layout próprio para papel.

## Implementação

- **Filtro por setor** na aba Escala (Todos / Cozinha / Salão / Confeitaria /
  Quiosque), aplicado à lista de colaboradores; o resumo de Pax/Efetivos/Extras
  continua geral.
- **Imprimir escala**: uma página A4 paisagem por setor, com logomarca, mês,
  setor, colaboradores, setor/turno, regime, horário, os dias 1..N com dia da
  semana e marcação T/F (F destacado), legenda e total de folgas.
- **Imprimir folgas**: uma página A4 retrato por setor, com colaborador,
  setor/turno, regime, quantidade de folgas, datas (dd/mm + dia da semana) e
  total do setor.
- Impressão via `iframe` oculto (sem popup), com remoção após `afterprint`.
- Nome/campos escapados no HTML (sem injeção). Nenhuma mudança de algoritmo,
  schema ou API.

## Arquivos

- `artifacts/frontend/src/lib/escala-print.ts` (novo)
- `artifacts/frontend/src/lib/escala-print.test.ts` (novo)
- `artifacts/frontend/src/pages/hotelaria/HotelEscalas.tsx`
- `docs/entregas/HOTEL-ESCALAS-06-FILTRO-IMPRESSAO-20261127.md`

## Validação (local, 2026-11-27)

- `vitest` (escala + xlsx + impressão): **12/12**.
- `vite build`: exit 0.
- `tsc` do frontend: sem erros nos arquivos alterados (o repositório mantém
  erros antigos em outros módulos).
- API inalterada; `tsc launch-ci` e `node build.mjs`: exit 0.
- Layouts de impressão conferidos por captura com Chromium (A4 paisagem e
  retrato): colunas de 30/31 dias cabem, cabeçalho com logomarca, F destacado,
  datas de folgas e totais legíveis.

## Publicação

Merge na `main` dispara o auto-deploy da Contabo (backend + frontend).

## Pendências de dados (inalteradas)

- Aba COZINHA de novembro ausente (a do arquivo está em dezembro, sem folgas).
- Definir turno **Salão P**.
- Tarifas/feriados reais, pares críticos e banco de extras.
