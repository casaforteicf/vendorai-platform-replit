# Plano de melhoria — Marketing

Data: 2026-11-26
Base: `INVENTARIO-TELAS-ESTADOS.md`, `MAPA-FLUXOS.md`, `MAQUINA-ESTADOS.md`,
`INVENTARIO-BRIDGES.md`, `CATALOGO-ERROS.md`, `ANALYTICS-TAXONOMY.md`.

## Princípio guia

> Uma peça, um estado, uma tela, uma CTA.

Toda decisão de implementação deve aproximar o produto disso. O que não couber, entra
como exceção explícita — não como uma segunda camada.

## Fase 0 — Diagnóstico (concluída)

| Entrega | Estado |
|---|---|
| Inventário de telas/estados | ✅ |
| Mapa de fluxos atual × alvo | ✅ |
| Máquina de estados | ✅ |
| Inventário de bridges | ✅ |
| Catálogo de erros | ✅ |
| Taxonomia de eventos | ✅ |
| Dados do tenant + teste com usuários | ⏳ pendente (depende de acesso) |

## Fase 1 — Quick wins (≈1 semana)

| # | Entrega | Critério de aceite | Esforço |
|---|---|---|---|
| 1 | Barra fixa no clipe selecionado do editor: **Excluir · Duplicar · Dividir · Aparar** | editar/excluir em 1 clique, com confirmação | 1 dia |
| 2 | Prévia de vídeo com **play/controles** + miniaturas de cena corretas | usuário assiste ao vídeo na revisão | 1 dia |
| 3 | Checklist **“Marketing pronto”** (IA, canais, fotos, modo de publicação) no topo | cada item leva à tela de correção | 1–2 dias |
| 4 | Vocabulário único: Planejar → Produzir → Revisar → Publicar → Medir | zero sinônimos nas telas do funil | 0,5 dia |
| 5 | Erros da lista do catálogo com CTA (itens 6, 9, 16, 19, 20) | todo erro exibido tem ação | 1–2 dias |
| 6 | Remover contadores duplicados da aba de conteúdos (fundir 1ª parte da bridge) | “Para revisar (N)” = lista | 1–2 dias |

**Risco**: a frente de conteúdos é a mais usada; cada mudança precisa de teste manual com
uma peça real. **Dependência**: ambiente de homologação.

## Fase 2 — Consolidação (2–3 semanas)

| # | Entrega | Critério de aceite | Dependência |
|---|---|---|---|
| 1 | Função única de transição + máquina canônica | matriz de transições testada; API rejeita inválidas | Fase 1 |
| 2 | Um produtor (worker) + endpoint “pedir produção” | tela não gera mais em paralelo | 1 |
| 3 | Rotas por peça (`/marketing/revisao/:id`) | voltar/atualizar preserva a peça | 1 |
| 4 | Remover bridges de DOM das telas de conteúdo (ordem do inventário) | nenhuma tela depende de injeção | 1 |
| 5 | Publicação como fila única; modo visível na peça | peça mostra “manual/automático” e falha | 1 |
| 6 | Resultados com atribuição v1 (peça → publicação → negócio) | painel liga as três pontas | 1 |
| 7 | Eventos do funil + painel “Diagnóstico do Marketing” | funil e top falhas visíveis | 1 |

## Fase 3 — Contínuo (mensal)

- Teste de usabilidade com 3–5 usuários a cada ciclo; roteiro de 5 tarefas.
- Revisão do funil: conversão, tempo por etapa, top `reason_code`.
- Priorização por dados (não por percepção).
- Meta inicial: **80% das tarefas concluídas sem ajuda** e **SUS ≥ 70**.

## Backlog priorizado

| Prioridade | Item | Origem |
|---|---|---|
| P0 | Máquina de estados + transição única | `MAQUINA-ESTADOS` |
| P0 | Aprovação com mídia final + auto-cura | já corrigido (PRs #3759/#3762/#3767) |
| P0 | Publicação com URL pública assinada | já corrigido (#3762) |
| P1 | Editor: ações visíveis | Fase 1 |
| P1 | Prévia de vídeo com play | Fase 1 |
| P1 | Checklist de prontidão | Fase 1 |
| P1 | Erros com CTA | Fase 1 |
| P1 | Rota de revisão por peça | Fase 2 |
| P2 | Remoção das bridges de DOM | Fase 2 |
| P2 | Atribuição por campanha | Fase 2 |
| P2 | Performance (polling/observers) | Fase 2 |

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Migração de estados legados | peças presas | campo `legacyStatus` + reconciliação idempotente |
| Frentes paralelas no mesmo workspace | conflitos/atraso | trabalho em branch isolada, um PR por fluxo |
| Deploy lento/instável | percepção de “nada muda” | homologação + status de deploy visível |
| Escopo do editor | semanas de trabalho | decidir: edição mínima (fotos/texto/ordem/duração) vs timeline completa |
| Remoção de bridge quebra tela | regressão | remover uma por PR, com teste da tela |

## Decisões pendentes (produto)

1. **Editor**: manter timeline completa ou entregar edição mínima primeiro?
2. **Publicação manual**: continua disponível para todos os formatos?
3. **Quem aprova**: admin do tenant, permissão explícita de Marketing ou ambos?
4. **Atribuição**: priorizar peça → negócio ou campanha → negócio?

## Definição de pronto (por entrega)

- Comportamento descrito no critério de aceite, validado em homologação com uma peça real.
- Build + testes verdes; nenhuma bridge nova.
- Evento de funil correspondente emitido.
- Registro em `docs/entregas/` com evidência.
