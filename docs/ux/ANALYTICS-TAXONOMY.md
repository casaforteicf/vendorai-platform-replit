# Taxonomia de eventos — Marketing

Data: 2026-11-26
Objetivo: medir o funil e as falhas para priorizar a melhoria com dados, não com impressão.

## Princípios

1. **Um evento por transição de estado** (não por clique), emitido no servidor.
2. **Sem PII**: ids internos e enums; nunca texto de conteúdo, e-mail ou telefone.
3. **Toda falha tem `reason_code`** da lista fechada abaixo.
4. **Frontend só emite intenção/visualização** (ex.: abriu revisão, pediu produção).
5. **Idempotência**: mesma transição + mesma versão não duplica evento.

## Propriedades comuns

| Propriedade | Tipo | Exemplo |
|---|---|---|
| `tenant_id` | string | `t_123` |
| `plan_id` | string | `mp_abc` |
| `piece_id` | string | `cal_xyz` |
| `tipo` | enum | `reels`, `feed`, `blog` |
| `canal` | string | `Instagram` |
| `status_from` / `status_to` | enum canônico | `review` → `approved` |
| `media_state` | enum | `pending`, `processing`, `ready`, `failed` |
| `source` | enum | `ui`, `worker`, `system` |
| `user_role` | enum | `tenant_admin`, `marketing`, `super_admin` |
| `reason_code` | enum | ver abaixo |
| `latency_ms` | number | tempo da etapa |
| `ts` | ISO | 2026-11-26T19:00:00Z |

## Eventos

| Evento | Quando | Propriedades extras | Origem |
|---|---|---|---|
| `marketing.plan.created` | plano gerado | `periodo_dias`, `campanhas` | API |
| `marketing.plan.approved` | plano aprovado | `latency_ms` desde criação | API |
| `marketing.batch.released` | lote liberado | `items` | API |
| `marketing.production.requested` | pedido de produção | `source` (ui/worker), `items` | API |
| `marketing.production.started` | job iniciado | `engine` (texto/imagem/vídeo/fotos) | worker |
| `marketing.production.completed` | peça pronta | `latency_ms`, `engine` | worker |
| `marketing.production.failed` | falha | `reason_code`, `engine` | worker |
| `marketing.video_build.requested` | botão “Montar vídeo com as fotos” | `photos` | UI |
| `marketing.review.opened` | revisão aberta | `piece_id` | UI |
| `marketing.piece.approved` | peça aprovada | `media_state` | API |
| `marketing.piece.blocked` | ação impedida | `reason_code` | API/UI |
| `marketing.publication_mode.changed` | manual ↔ automático | `from`, `to` | API |
| `marketing.publication.queued` | entrou na fila | `scheduled_for` | worker |
| `marketing.publication.published` | publicado | `provider`, `latency_ms` | worker |
| `marketing.publication.failed` | falhou | `reason_code`, `provider` | worker |
| `marketing.results.viewed` | aba Resultados aberta | `tab` | UI |

## Reason codes (lista fechada)

| Código | Significado | Ação de produto |
|---|---|---|
| `permission_denied` | sem permissão de Marketing | pedir ao admin |
| `quota_exceeded` | cota de gerações | comprar pacote/upgrade |
| `video_provider_missing` | sem Vertex/Replicate | usar fotos ou configurar |
| `too_few_photos` | menos de 2 fotos | enviar fotos |
| `media_missing` | peça sem mídia final | montar/gerar |
| `provider_error` | erro do provedor de IA | retry |
| `connection_missing` | canal não conectado | conectar |
| `token_expired` | token do canal expirou | reconectar |
| `unsupported_format` | formato sem publicação automática | publicar manual |
| `validation_failed` | dados incompletos | corrigir cadastro |
| `plan_not_approved` | plano em revisão | aprovar plano |

## Funil e métricas

```
Plano aprovado → Lote liberado → Produção concluída → Peça aprovada → Publicação → Resultado
```

| Métrica | Cálculo | Uso |
|---|---|---|
| Conversão por etapa | eventos consecutivos / entrada | achar o gargalo |
| Tempo por etapa (p50/p90) | `latency_ms` | expectativa do usuário |
| Taxa de bloqueio | `piece.blocked` / tentativas | medir atrito |
| Top motivos de falha | contagem por `reason_code` | priorizar correção |
| % automático vs manual | publicações por modo | adoção da automação |
| % de peças curadas | `video_build` / falhas de vídeo | eficácia do fallback |
| Uso do editor | `review.opened` → edição | decidir escopo do editor |

## Implementação

- **Servidor**: emitir na função única de transição (ver `MAQUINA-ESTADOS.md`) e nos
  serviços de produção/publicação; gravar em tabela de eventos ou log estruturado.
- **Frontend**: apenas `review.opened`, `results.viewed`, `video_build.requested` e
  `piece.blocked` quando a ação é impedida antes da API.
- **Dashboard**: uma tela “Diagnóstico do Marketing” (admin) com funil, falhas e tempos.
- **Retenção**: eventos agregados por 12 meses; brutos por 90 dias.

## Critérios de aceite

- [ ] Toda transição canônica emite evento.
- [ ] Toda falha tem `reason_code` da lista.
- [ ] Funil e top falhas disponíveis em um painel.
- [ ] Nenhuma PII nos eventos.
