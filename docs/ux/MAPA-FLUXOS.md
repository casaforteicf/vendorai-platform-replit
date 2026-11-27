# Mapa de fluxos — Marketing (atual × alvo)

Data: 2026-11-26
Base: código da `main` + fluxos exercitados nas sessões de uso.
Objetivo: explicitar onde o fluxo se divide, quem executa cada etapa e o que precisa
ser fundido para a experiência ficar previsível.

## Atores

| Ator | Papel |
|---|---|
| Usuário (owner/admin) | aprova plano, libera lote, aprova peça, escolhe modo de publicação |
| Usuário com permissão de Marketing | mesmo, quando o gate `canReleaseMarketingBatch` permite |
| Worker do backend | produz rascunhos, cura Reels, enfileira e publica |
| IA (texto/imagem/vídeo) | gera conteúdo; vídeo pode cair para o motor de fotos |
| Canais (Meta, LinkedIn, TikTok, YouTube) | recebem a publicação |

## Fluxo atual

```
PLANO
  gerado ──(revisar)──► em_revisao ──(aprovar)──► aprovado
     ▲                                  │
     └────────(PATCH sem aprovar)───────┘

AÇÕES DO CALENDÁRIO
  planejado ──(aprovar lote / aprovar plano)──► aprovado
      │                                            │
      │                          ┌─────────────────┴─────────────────┐
      │                          ▼                                   ▼
      │                 worker (modo automático)            tela ("Produzir plano completo")
      │                          └──────────────┬──────────────────┘
      │                                         ▼
      └──────────────(usuário edita)──────► gerado + contentGenerationId
                                                   │
REVISÃO                                            ▼
  (tela de revisão)  gerado ──(aprovar, exige mídia final)──► aprovado
                                                   │
PUBLICAÇÃO                                         ▼
  modo manual ─────────────────────────────► peça parada (publicar à mão)
  modo automático ──(data/hora)──► queued ──► publishing ──► published
                                                   └────────► failed (retry manual)

RESULTADOS
  publicações + content-performance + negócios fechados (CRM)
```

### Fluxos paralelos que existem hoje

| Fluxo | Onde entra | O que produz | Vínculo com a peça do plano |
|---|---|---|---|
| Estúdio de vídeo manual | `/content-studio/video` | projeto de vídeo (IA ou fotos) | **nenhum** |
| Editor/timeline | `/content-studio/video/edicao` | MP4 exportado | **nenhum** (não devolve para a peça) |
| Fallback de fotos | revisão / worker | MP4 de fotos | sim (botão/auto-cura) |
| Publicação manual | `OrganicCalendarPublisher` / ação da peça | publicação | sim |
| Retry de falhas | `MediaPlanFailedRetryBridge` / “Reprogramar falhas” | nova tentativa | sim |

## Entradas e o que cada uma pressupõe

| Rota | Intenção do usuário | Estado que a tela assume | Risco |
|---|---|---|---|
| `/content?tab=visao-geral` | “onde estou?” | plano existe | CTA pode levar a tela sem a ação |
| `/content?tab=planejamento` | revisar/aprovar plano e lote | plano em revisão | aprovar plano aprova ações `planejado` |
| `/content?tab=campanhas` | ver campanhas | plano aprovado | “a preparar/em produção” divergem da aba de conteúdos |
| `/content?tab=conteudos` | revisar peças | peças geradas | contadores já divergiram por injeção DOM |
| `/content-studio/video` | criar vídeo **ou** revisar peça | ambíguo | mesma URL para Estúdio e Revisão |
| `/content-studio/video/edicao` | editar vídeo | projeto existente | projeto não vinculado à peça |
| `/midias` | gerenciar mídia | — | fallback exige upload/import |

## Divergências estruturais

1. **Dois produtores** (worker e tela) para a mesma ação — resolvido por *claim* no banco,
   mas o usuário vê dois caminhos e dois estados de progresso.
2. **Dois motores de vídeo** (IA e fotos) com estados diferentes
   (`video_processing` × `photo_video`), e o editor trata os dois como “projeto”.
3. **Dois modos de publicação** (manual/automático) que mudam o destino da peça, mas não
   aparecem no momento da aprovação.
4. **Duas superfícies de resultado** (aba Resultados e inteligência de campanha) sem
   atribuição entre si.
5. **Revisão e Estúdio na mesma URL**: voltar/atualizar troca de tela e perde contexto.
6. **Editor desconectado**: editar/exportar não atualiza a peça aprovada.
7. **Estados paralelos** (plano, calendário, mídia, materialização, publicação) sem uma
   máquina única — ver `MAQUINA-ESTADOS.md`.

## Fluxo alvo

```
PEÇA (uma entidade, um cartão)
  Planejar ─► Liberar ─► Produzir ─► Revisar ─► Aprovar ─► Agendar ─► Publicar ─► Medir
      │           │           │          │          │          │          │
      └─ pré-requisitos explícitos em cada etapa (IA, fotos, canais, permissão)
      └─ uma tela por etapa, um CTA primário, próximo passo sempre visível
```

Regras do alvo:

- **Uma peça = um cartão** com estado canônico + subestado de mídia + erro (se houver).
- **Um produtor** (worker). A tela só *pede* a produção; progresso vem de um único evento.
- **Uma revisão** com URL própria por peça (`/marketing/revisao/:id`), sem colidir com o Estúdio.
- **Editor é opcional** e devolve a versão para a peça (não um projeto paralelo).
- **Publicação é uma fila**; manual/automático é configuração visível na peça.
- **Resultados** por peça e por campanha, com atribuição declarada.

## O que fundir ou retirar

| Item | Ação | Motivo |
|---|---|---|
| Bridges de Conteúdos & Criativos | fundir no componente nativo | contadores/barras duplicados, cliques errados |
| Views do Estúdio (`studio`, `projects`, `create`) | manter como criação manual | é outro trabalho, não a revisão do plano |
| Revisão do material | rota própria | hoje divide URL com o Estúdio |
| “Produzir plano completo” na tela | manter como *pedido* ao worker | evita dois produtores |
| Editor/timeline | manter, mas vinculado à peça | hoje exporta para fora do funil |
| Duas superfícies de resultado | unificar em abas | leitura fragmentada |

## Critérios de aceite do fluxo

- [ ] Toda peça exibe **um** próximo passo e **uma** CTA primária.
- [ ] Nenhuma tela mostra contador diferente da lista correspondente.
- [ ] Nenhuma ação fica habilitada sem pré-requisito (vídeo, canal, permissão).
- [ ] Voltar/atualizar preserva a peça e a etapa (URL por peça).
- [ ] Falha de produção/publicação aparece na peça com motivo e ação de recuperação.
- [ ] Publicar e medir usam a mesma chave (peça → publicação → resultado).

## Perguntas abertas

1. O editor completo (timeline) deve continuar no produto ou virar edição mínima (fotos, texto, ordem, duração)?
2. A publicação manual continua existindo para todos os formatos?
3. Quem aprova peça e libera lote: admin do tenant, permissão explícita de Marketing ou ambos?
