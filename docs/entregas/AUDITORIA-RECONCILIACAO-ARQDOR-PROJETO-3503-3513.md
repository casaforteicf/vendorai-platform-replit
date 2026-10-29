# Auditoria de reconciliação — Arqdor Projeto PR #3503 × #3513

**Data:** 13/10/2026. **Tipo:** auditoria estrutural do GitHub, **não** execução de testes, build, diff semântico integral ou homologação. Os SHAs e estados podem mudar: reconsultar antes de qualquer integração.

## Base e sobreposição verificada

- `main`: `8e8380f64107cf9e137888aeff5a5ba046dc99fb` na consulta.
- [PR #3503](https://github.com/casaforteicf/vendorai-platform-replit/pull/3503): draft aberto, HEAD `da01de29f372d05b4cecf31c0a40a2dfbf09be17`, **19 caminhos alterados**.
- [PR #3513](https://github.com/casaforteicf/vendorai-platform-replit/pull/3513): draft aberto, HEAD `d3c213747b0ac65e35c5e54994f492a1382d4413`, **15 caminhos alterados**.
- **Todos os 15 caminhos do #3513 também aparecem no #3503.** Isso prova sobreposição de escopo, não que os conteúdos sejam iguais ou intercambiáveis.
- Quatro caminhos exclusivos do #3503: `artifacts/frontend/src/lib/arqdorRevisionAutosave.ts`, `artifacts/frontend/src/lib/arqdorRevisionAutosave.test.ts`, `artifacts/frontend/src/modules/arqdor/theme/arqdor-studio-primitives.css`, `docs/entregas/ARQDOR-PROJETO-5-LOTES-20261012.md`.
- O design system já entrou parcialmente na `main` pelo [#3507](https://github.com/casaforteicf/vendorai-platform-replit/pull/3507). Antes de portar o CSS exclusivo do #3503, confirmar equivalência, imports e possibilidade de sobrescrita do Studio aprovado.

## Blobs diferentes — não copiar arquivos inteiros

| Arquivo | main | #3503 | #3513 |
|---|---|---|---|
| `ConceptPlanner.tsx` | `a034f47c` | `13ad6450` | `79b9887f` |
| `conceptWallPreflight.ts` | ausente | `93c3243c` | `60261212` |
| `conceptWallDiagnosticPresentation.ts` | ausente | `311dc314` | `37a93901` |
| `arqdor-concept-studio.css` | `cc45be49` | `0f0c45f` | `c397dd79` |

Os identificadores acima são **prefixos dos SHA de blob**, não SHAs de commit. Diferenças binárias/textuais não indicam qual versão está funcionalmente correta.

## Instruções de reconciliação para o dono da integração

1. Estabelecer **um único PR candidato de integração** e um único owner dos arquivos sobrepostos. O #3513 pode servir como candidato por partir da `main` mais recente **nesta fotografia**, mas isso não é prova de completude.
2. Examinar os hunks do #3503 versus #3513 versus `main` e mapear para os 26 critérios da [matriz de aceite do Projeto](./MATRIZ-ACEITE-ARQDOR-PROJETO-20261013.md). Registrar o que foi **portado, alterado intencionalmente, descartado por duplicação ou ainda pendente**.
3. Avaliar explicitamente os quatro caminhos exclusivos: autosave/revisões, testes de autosave, CSS de primitivas (comparar com #3507) e documento de escopo. Não adicionar cegamente por cópia.
4. Preservar contratos BIM, geometria, versões, permissões e estilo Studio oficial; não aplicar substituição integral de `ConceptPlanner.tsx`.
5. Depois da reconciliação, executar gates completos no SHA final, diagnóstico TypeScript contra baseline, testes de geometria, autosave e consumidores, navegador 2D↔3D e tenant scope; documentar os resultados reais.
6. Manter draft e flag off para capacidades não homologadas; homologar ambiente isolado antes de ativação. **Não integrar #3503 e #3513 separadamente em produção.**

## Lacunas atuais

- Não foi executado `git diff` semântico integral, compilação, Vitest, teste E2E ou consulta ao estado da Contabo nesta auditoria.
- Não existe evidência suficiente nesta sessão de que os requisitos de escadas/lajes/coberturas, aberturas na malha, importação/MEP/orçamento estejam completos.
- **Status de todos os 26 critérios do Projeto:** manter conforme matriz documental até testes específicos; percentual técnico/funcional **não apurado**.
