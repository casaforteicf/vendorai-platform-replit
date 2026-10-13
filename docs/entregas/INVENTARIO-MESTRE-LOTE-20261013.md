# Inventário inicial de lotes — 13/10/2026

**Natureza:** fotografia de PRs e evidências documentais do GitHub; **não representa estado confirmado de produção**. Donos operacionais pendentes de confirmação. Sem testes, deploy ou homologação executados nesta auditoria.

| Frente/lote proposto | PR | Estado do PR na consulta | O que há documentado | Critério faltante / próxima ação | Prioridade |
|---|---|---|---|---|---|
| F01-L01 — Motor BIM e paredes | [#3503](https://github.com/casaforteicf/vendorai-platform-replit/pull/3503) | draft aberto | Preflight paredes, junções/diagnósticos, painel e testes adicionados | Interseção geométrica real, integração 2D↔3D, aberturas, persistência/revisões e gates | P1 |
| F01-L02 — Editor Studio | [#3503](https://github.com/casaforteicf/vendorai-platform-replit/pull/3503), [#3507](https://github.com/casaforteicf/vendorai-platform-replit/pull/3507) | draft / mergeado | Componentes Studio e tokens, ConceptPlanner tocado | Reconciliar trabalho duplicado, QA desktop/mobile e seleção/propriedades reais | P1 |
| F01-L03 — Importação/documentação | [#3503](https://github.com/casaforteicf/vendorai-platform-replit/pull/3503) | draft aberto | Requisitos IFC/DXF, pranchas e roundtrip documentados | Implementação comprovada, proveniência, testes roundtrip | P1 |
| F01-L04 — MEP e orçamento por revisão | [#3503](https://github.com/casaforteicf/vendorai-platform-replit/pull/3503), [#3426](https://github.com/casaforteicf/vendorai-platform-replit/pull/3426) | drafts | Escopo e proposta de esquema MEP | Transações, ancoragem, quantitativos por revisão, tenant scope, integração | P1 |
| F01-L05 — QA/homologação | [#3503](https://github.com/casaforteicf/vendorai-platform-replit/pull/3503) | draft aberto | Matriz de gates/documentação | Gates, E2E, visual, homologação do SHA e evidências | P1 |
| F02-L01 — Render Studio | [#3504](https://github.com/casaforteicf/vendorai-platform-replit/pull/3504) | draft aberto | Barra contextual, materiais, cena e câmera FOV na prévia | Persistência FOV, conciliar #3507, gates e UX real | P1 |
| F02-L02 — Render CPU/GPU | [#3510](https://github.com/casaforteicf/vendorai-platform-replit/pull/3510) | draft aberto | Invalidação CPU, kernel WGSL experimental, detecção WebGPU/fallback e testes escritos | Execução GPU não homologada; GPU de servidor e render PBR/GI não entregues, gates/E2E pendentes | P1 |
| F03-L01 — Design System Studio | [#3507](https://github.com/casaforteicf/vendorai-platform-replit/pull/3507) | mergeado | Integração e relato de gates de build/bundle | Comparação visual aprovada, permissões, navegabilidade e SHA de produção | P1 |
| F03-L02 — Navegação TAD | [#3506](https://github.com/casaforteicf/vendorai-platform-replit/pull/3506) | draft aberto | Desativa ServiceTabsBar por padrão | Testar navegação real e conflitos de main | P1 |
| F06-L01 — Smart Specification | [#3507](https://github.com/casaforteicf/vendorai-platform-replit/pull/3507), [#3495](https://github.com/casaforteicf/vendorai-platform-replit/pull/3495) | mergeado / draft | Integração relatada; correções Android | Identificar o que já entrou por #3507; QA em dispositivos e integração por revisão | P1 |
| F07-L01 — Ondas TAD/CRM | [#3468](https://github.com/casaforteicf/vendorai-platform-replit/pull/3468), [#3466](https://github.com/casaforteicf/vendorai-platform-replit/pull/3466) | drafts abertos | Catálogos de gates/cobertura de ondas | Inventário detalhado por requisito, evitar duplicações, validação | P2 |
| F08-L01 — Rotina de agentes | [#3511](https://github.com/casaforteicf/vendorai-platform-replit/pull/3511), [#3512](https://github.com/casaforteicf/vendorai-platform-replit/pull/3512) | mergeado / draft | Protocolo existente e novo modelo mestre proposto | Reconciliar conflitos documentais e formalizar aceites | P1 |

## Regras para atualizar esta tabela

- Reconsultar o GitHub para números, SHA, merge status e alterações da main.
- Dono do lote: **não designado** até indicação/registro formal. Evitar presumir autoria = responsabilidade corrente.
- `implementado` não significa `funcionando`. Não informar porcentagem sem checklist ponderado verificável.
- No lote #3503, conferir se o documento `docs/entregas/ARQDOR-PROJETO-5-LOTES-20261012.md` existe **na branch do PR**, embora não esteja na main.
- Para lotes que impactam os mesmos arquivos de `ConceptPlanner` ou `RenderStudio`, definir sequência de integração e reconciliar contra a main atual.
- Acompanhar status da Contabo por evidência operacional, não por descrição de PR.

## Matrizes de aceite vinculadas

- [Arqdor Projeto — 26 requisitos](./MATRIZ-ACEITE-ARQDOR-PROJETO-20261013.md)
- [Arqdor Render — 21 requisitos](./MATRIZ-ACEITE-ARQDOR-RENDER-20261013.md)

A descrição do PR #3510 foi atualizada para contemplar um kernel WGSL experimental. Isso não comprova GPU de produção.
