# HOTEL-ESCALAS-07 — período limitado ao mês e dia da semana

Data: 2026-11-27. Base: `main` `d0ec087ed`.

## Objetivo

A janela de 35 dias do estado (compatível com o banco/API) invadia o mês
seguinte na tela (ex.: 01–05/12 em novembro). O usuário pediu o período
**somente do mês** e o **dia da semana** visível.

## Implementação

- `diasNoMes(start)` e `semanaDoMes(start)` em `escala-ab.ts`.
- A aba Escala mostra apenas os dias do mês: 5 semanas (ou 4 em fevereiro),
  com a última semana parcial (ex.: 29–30/11), sem 01–05/12.
- **Agregações do mês**: cards (Extras/Pico/Custo/Menor equipe), aba Extras,
  Cobertura e Validação usam somente os dias do mês.
- **Validação** passa a considerar apenas semanas completas do mês (evita
  alarme falso no final do mês).
- **Dia da semana** exibido na escala (cabeçalho das colunas), na aba Ocupação
  e no painel de detalhes; a impressão já mostrava.
- Ao carregar/trocar período/importar/restaurar, a semana é posicionada na
  semana atual (se o mês for o corrente) e a cobertura volta ao dia 1.

O estado continua com 35 dias no banco (contrato da API e compatibilidade do
histórico); os dias fora do mês ficam ocultos e não entram nos totais.

## Arquivos

- `artifacts/frontend/src/lib/escala-ab.ts`
- `artifacts/frontend/src/lib/escala-ab.test.ts`
- `artifacts/frontend/src/pages/hotelaria/HotelEscalas.tsx`
- `docs/entregas/HOTEL-ESCALAS-07-MES-20261127.md`

## Validação (local, 2026-11-27)

- `vitest` (escala + xlsx + impressão): **14/14** (inclui dias do mês e
  validação só de semanas completas).
- `vite build`: exit 0.
- `tsc` do frontend: sem erros nos arquivos alterados (erros antigos em outros
  módulos permanecem).
- API inalterada; `tsc launch-ci` + `esbuild`: exit 0.

## Publicação

Merge na `main` dispara o auto-deploy da Contabo.

## Pendências de dados (inalteradas)

- Aba COZINHA de novembro ausente (a do arquivo está em dezembro, sem folgas).
- Definir turno **Salão P**.
- Tarifas/feriados reais, pares críticos e banco de extras.
