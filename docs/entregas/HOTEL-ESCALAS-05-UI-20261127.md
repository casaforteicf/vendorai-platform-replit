# HOTEL-ESCALAS-05 — legibilidade e edição da escala

Data: 2026-11-27. Base: `main` `808b946a9`.

## Objetivo

Corrigir a visualização da aba **Escala**, que mostrava 35 dias espremidos em
uma única tabela: colunas de nome sumiam no scroll, células minúsculas e sem
como abrir os dados do colaborador.

## O que mudou

- **Visão por semana**: 5 botões (Semana 1–5) com o intervalo de datas; a
  tabela mostra 7 dias por vez, com células de 40 px e texto maior.
- **Coluna de nomes fixa** (`sticky`) e **cabeçalho fixo** com rolagem contida
  na área da tabela (`max-h-[70vh]`); em telas menores a tabela rola na
  horizontal sem perder o nome.
- **Resumo por semana** no rodapé da tabela: Pax noite, Pax manhã, Efetivos,
  Extras e Tarifa apenas dos 7 dias visíveis.
- **Painel de detalhes**: clicar no nome abre um modal com nome, cargo, setor,
  turno, regime, horários editáveis, jornada calculada, dias trabalhados/folgas
  e os T/F da semana; fecha por botão, clique fora ou Esc.
- Nenhuma mudança de algoritmo, schema, API, cores ou logomarca.

## Arquivos

- `artifacts/frontend/src/pages/hotelaria/HotelEscalas.tsx`
- `docs/entregas/HOTEL-ESCALAS-05-UI-20261127.md`

## Validação (local, 2026-11-27)

- `vitest escala-ab + escala-xlsx`: 8/8.
- `tsc -p artifacts/frontend/tsconfig.json --noEmit`: sem erros em
  `HotelEscalas.tsx` (o repositório tem erros antigos em outros módulos, fora
  do escopo).
- `vite build`: exit 0.
- API inalterada; `tsc launch-ci` e `node build.mjs` reexecutados: exit 0.

## Publicação

Merge na `main` dispara o auto-deploy da Contabo (backend + frontend).

## Pendências de dados (inalteradas)

- Aba COZINHA de novembro ausente (a do arquivo está em dezembro, sem folgas).
- Definir turno **Salão P**.
- Tarifas/feriados reais, pares críticos e banco de extras.
