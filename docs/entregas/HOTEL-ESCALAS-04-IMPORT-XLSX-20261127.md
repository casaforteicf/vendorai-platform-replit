# HOTEL-ESCALAS-04 — importação XLSX, período no histórico e homologação

Data: 2026-11-27. Base: `main` `8f531fdeb`.

## Objetivo e escopo

Fechar o ciclo mensal do módulo Hotelaria → Escalas:

1. Importar a planilha XLSX de A&B direto na tela (antes só JSON/CSV).
2. Mostrar o período (mês/ano) de cada versão no histórico.
3. Aplicar a migração 577 (tabelas `hotel_escala_*`) no banco de homologação.

Sem alterar layout, cores, logomarca ou algoritmo de cálculo.

## Implementação

- `artifacts/frontend/src/lib/escala-xlsx.ts`: leitor da planilha mensal
  (abas por setor, blocos ALMOÇO/JANTAR, folgas "F", ocupação A/C).
  - Usa `xlsx` via import dinâmico (não pesa o bundle inicial).
  - Usa o **mês selecionado** no campo Período; abas cujo título indica outro
    mês são ignoradas e informadas ao usuário.
  - Mantém tarifas, pares críticos e extras; zera ocupação/metas/feriados;
    aplica jornada padrão por setor/turno (`HORARIOS`).
- `escala-ab.ts`: `metasDoDia()` extraído de `metaDia()` (mesma matriz) e
  `HORARIOS`/`horarioDoGrupo()` centralizados.
- `HotelEscalas.tsx`: botão Importar aceita `.xlsx/.xls` além de `.json`;
  confirmação com resumo (colaboradores, setores, abas ignoradas);
  histórico exibe o mês de cada versão.
- `hotel_escalas.ts`: `GET .../historico` passa a devolver `inicio` (start da
  versão), campo adicional compatível com o contrato anterior.

## Homologação

Migração 577 aplicada no banco `vendorai_homolog` (tabelas e policies criadas)
e registrada no ledger com o mesmo checksum da produção
(`f81b4bd3…ac723c`). Homologação é schema legado; a API usa o usuário dono das
tabelas.

## Validação (local, 2026-11-27)

- `tsc -p tsconfig.launch-ci.json --noEmit`: exit 0.
- `vitest escala-ab + escala-xlsx`: 8/8.
- `vite build`: exit 0.
- `node build.mjs` (esbuild): exit 0.
- Leitor aplicado à planilha real `ESCALA NOVEMBRO A&B.xlsx`: 30 colaboradores
  (Salão 15, Quiosque 7, Confeitaria 8), folgas 5–15, dia 1 manhã 250/noite 232
  — idêntico à importação anterior feita por script.

## Publicação

Merge na `main` dispara o auto-deploy da Contabo (homolog → produção) e o
auto-deploy do frontend. Conferir `deploy-state/last-status` e
`last-frontend-status`.

## Pendências

- Aba COZINHA de novembro ausente (a do arquivo está em dezembro, sem folgas).
- Definir se existe turno **Salão P** separado (hoje a equipe de jantar entra
  como N e a meta de P aparece como extra).
- Tarifas/feriados reais, pares críticos e banco de extras ainda vazios.
