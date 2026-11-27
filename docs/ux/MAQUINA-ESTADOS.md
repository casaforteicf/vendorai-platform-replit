# Máquina de estados única — Marketing

Data: 2026-11-26
Objetivo: substituir as quatro dimensões de estado independentes por **um estado canônico
por peça** (+ subestado de mídia + erro), com transições validadas no servidor.

## Estados que existem hoje

| Entidade | Campo | Valores |
|---|---|---|
| Plano | `media_plans.conteudo.statusPlanejamento` | `gerado`, `em_revisao`, `aprovado` |
| Ação do calendário | `content_calendar_items.status` | `planejado`, `aprovado`, `processando`, `recusado`, `gerado`, `publicado`, `pulado` |
| Geração (automação) | `content_generations.result.automation.status` | `video_processing`, `video_ready`, `video_failed`; ausência = sem vídeo |
| Materialização | `media_projects.context.materializationStatus` | `planned`, `processing`, `draft_ready`, `ready`, `failed` |
| Publicação | `social_publications.status` | `queued`, `scheduled`, `publishing`, `published`, `failed` |

## Transições observadas

### Plano

| De | Para | Ator | Gatilho | Observação |
|---|---|---|---|---|
| `gerado` | `em_revisao` | usuário | PATCH `/media-plan/:id` | — |
| `em_revisao` | `aprovado` | usuário | PATCH com `aprovar: true` | também aprova ações `planejado` |
| `aprovado` | `em_revisao` | usuário | PATCH com `patch` **sem** `aprovar` | **rebaixa o plano sem intenção explícita** |

### Ação do calendário

| De | Para | Ator | Gatilho | Observação |
|---|---|---|---|---|
| `planejado` | `aprovado` | usuário | aprovar lote / aprovar plano | libera produção |
| `aprovado` | `gerado` | worker ou tela | produção | exige `contentGenerationId` |
| `gerado` | `aprovado` | usuário | aprovação final | exige mídia final em vídeo (`422 VIDEO_NOT_READY`) |
| `aprovado` | `publicado` | publisher | fila de publicação | grava `contentIdPublicado` |
| `planejado`/`aprovado`/`gerado` | `recusado`/`pulado` | usuário | ação manual | — |
| qualquer | `processando` | — | **nunca gravado** | estado morto (só existe numa guarda) |

### Geração / mídia

| De | Para | Ator | Gatilho |
|---|---|---|---|
| — | `video_processing` | worker/botão | `startAutomatedVideo`, fallback de fotos |
| `video_processing` | `video_ready` | reconciliador | job concluído |
| `video_processing` | `video_failed` | reconciliador | erro sem fallback |
| `video_failed` | `video_processing` | reconciliador | fallback de fotos (uma vez por item) |
| `video_failed` | `video_failed` | reconciliador | sem 2+ fotos — mensagem acionável |

### Publicação

| De | Para | Ator | Gatilho |
|---|---|---|---|
| — | `queued` | serviço | `createSocialPublication` |
| `scheduled` | `queued` | worker | horário vencido |
| `queued` | `publishing` | worker | dispatcher |
| `publishing` | `published`/`failed` | provider | resposta do canal |
| `failed` | `queued` | usuário | retry manual |

## Combinações ilegais ou ambíguas (com risco)

| # | Combinação | Risco | Guarda atual |
|---|---|---|---|
| 1 | `aprovado` + geração sem vídeo (Reels) | publicação falha em silêncio | `422 VIDEO_NOT_READY` + auto-cura |
| 2 | `gerado` + `contentGenerationId` nulo | peça “em produção” para sempre | claim com TTL inexistente |
| 3 | `materializationStatus = ready` + sem `executorOutputUrl` | UI diz pronto, mídia não existe | nenhuma |
| 4 | `video_failed` + ação `aprovado` | peça aprovada sem mídia | auto-cura só para itens de vídeo |
| 5 | publicação `failed` + ação `aprovado` | ninguém vê a falha na peça | retry manual escondido |
| 6 | plano `aprovado` + modo manual | peças aprovadas nunca publicam | invisível na aprovação |
| 7 | publicação `queued` com URL privada | canal rejeita a mídia | assinatura de URL (corrigido) |
| 8 | PATCH de configuração rebaixa plano para `em_revisao` | perde a aprovação sem avisar | exige `aprovar: true` no mesmo PATCH |

## Estados mortos / duplicados

- `content_calendar_items.status = processando`: declarado, checado numa guarda, nunca gravado.
- `video_processing` (geração) × `materializationStatus = processing` (projeto): dois “processando” para a mesma coisa.
- `draft_ready` × `ready` × `gerado`: três formas de dizer “rascunho pronto”.

## Máquina canônica proposta

```
                 ┌────────────── falha(código) ◄─────────────┐
                 ▼                                            │
RASCUNHO ─► PLANEJADO ─► LIBERADO ─► PRODUZINDO ─► REVISÃO ─► APROVADO ─► AGENDADO ─► PUBLICANDO ─► PUBLICADO
                 │                       │                               │
                 └── cancelado ──────────┴── recusado                     └── retry (falha de publicação)
```

Estados canônicos (8 + falha):

| Estado | Significado | Ação primária | Pré-requisito |
|---|---|---|---|
| `planned` | criada, não liberada | liberar | plano aprovado |
| `released` | liberada para produção | produzir | plano aprovado + permissão |
| `producing` | IA/worker trabalhando | acompanhar | mídia em processamento |
| `review` | rascunho com mídia pronta | revisar/aprovar | **mídia final** |
| `approved` | aprovada pelo usuário | agendar | mídia final + canal conectado |
| `scheduled` | na fila com data/hora | aguardar | canal conectado |
| `publishing` | enviando ao canal | aguardar | — |
| `published` | no canal | medir | — |
| `failed(code)` | erro em qualquer etapa | corrigir/tentar de novo | motivo legível |

Subestado ortogonal de mídia (derivado, não é status):

`media = pending | processing | ready | failed`

Regra: **estado = etapa; mídia = prontidão**. A UI mostra a etapa e usa `media` para
habilitar/desabilitar ações — nunca mistura os dois num único rótulo.

## Mapeamento legado → canônico

| Legado | Canônico |
|---|---|
| `planejado` | `planned` |
| `aprovado` sem geração | `released` |
| `gerado` sem mídia (Reels) | `producing` (media=processing) |
| `gerado` com mídia | `review` |
| `aprovado` com mídia | `approved` |
| `aprovado` sem mídia (legado) | `producing` (media=pending) → auto-cura |
| `publicado` | `published` |
| `recusado` / `pulado` | `cancelled` / `skipped` |
| `processando` | `producing` |
| `video_ready` / `video_failed` | `media=ready` / `media=failed` |
| `materializationStatus` | deriva `media` |
| `social_publications.status` | deriva `scheduled`/`publishing`/`published`/`failed` |

## Regras de implementação

1. **Uma função de transição** no servidor (`POST /pieces/:id/transition { action }`), com
   matriz de transições permitidas e códigos de erro.
2. **Nenhuma escrita direta** de status fora dessa função (rotas/workers chamam a função).
3. **UI deriva rótulo e ação** do estado canônico + `media`; não recalcula por conta própria.
4. **Idempotência** por chave (item + ação + versão).
5. **Evento por transição** (`piece_released`, `piece_produced`, `piece_approved`,
   `publication_queued`, `publication_failed`, `publication_published`) para o funil.
6. **Migração** lê o legado, grava o canônico e mantém um campo `legacyStatus` por um ciclo.
7. **Reconciliação** só pode mover estados para frente ou registrar `failed` com motivo.

## Critérios de aceite

- [ ] Matriz de transições coberta por testes (válidas e inválidas).
- [ ] Nenhuma combinação da tabela “ilegal/ambígua” pode ser criada pela API.
- [ ] Toda peça em `failed` tem código + texto + ação de recuperação.
- [ ] Nenhum estado sem próximo passo na UI.
- [ ] Contadores e listas derivam do mesmo estado canônico.
