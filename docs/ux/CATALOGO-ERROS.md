# Catálogo de erros — Marketing

Data: 2026-11-26
Método: extração das mensagens do código (API, serviços e toasts) e das telas exercitadas.
Objetivo: padronizar causa, recuperação e CTA de cada erro antes da melhoria.

## Legenda

- **CTA hoje**: ✅ tem ação clara · 🟡 parcial (texto orienta, mas sem botão) · ❌ não tem
- **Origem**: `API` (rota/serviço) · `UI` (toast/estado de tela) · `LOG` (só registro)

## Planejamento e produção

| # | Mensagem (trecho) | Origem | Causa | Recuperação | CTA hoje | Ação proposta |
|---|---|---|---|---|---|---|
| 1 | “O Plano de Mídia precisa estar aprovado antes da produção.” | API 422 | plano não aprovado | aprovar o plano | 🟡 | botão “Ir para planejamento” no erro |
| 2 | “Aprove primeiro a direção do Plano de Mídia antes de liberar um lote…” | UI toast | lote liberado cedo | aprovar plano | 🟡 | idem |
| 3 | “Permissão de Marketing necessária para liberar ou registrar produção deste lote.” | API 403 | usuário sem permissão explícita | admin libera permissão | 🟡 (texto orienta) | botão “Solicitar ao administrador” |
| 4 | “Existem N ações do lote atual aguardando aprovação…” | API 409 | gerar novo lote sem decidir o atual | aprovar/recusar lote | ✅ (mensagem) | manter |
| 5 | “Limite mensal de geração atingido…” / 402 | API 402 | cota do plano | comprar pacote/upgrade | 🟡 | CTA de compra (já existe no QuotaSafe) |
| 6 | “Production automática pausada pelo circuit breaker…” | LOG | erro de cobrança/quota do provedor | corrigir cobrança; retry | ❌ | expor banner com motivo + retry |

## Revisão e aprovação

| # | Mensagem | Origem | Causa | Recuperação | CTA hoje | Ação proposta |
|---|---|---|---|---|---|---|
| 7 | “Este vídeo ainda não tem arquivo final. Gere ou monte o vídeo antes de aprovar…” | API 422 | Reel aprovado sem MP4 | montar vídeo / gerar | ✅ (botão “Montar vídeo com as fotos”) | manter |
| 8 | “Envie pelo menos 2 fotos do negócio para a Biblioteca…” | API 422 | fallback sem fotos | enviar 2 fotos | 🟡 | botão “Abrir Biblioteca” |
| 9 | “Geração de vídeo indisponível: configure o provedor Google Vertex/Veo…” | UI (detalhe do projeto) | nenhum provedor de vídeo | usar fallback de fotos | 🟡 | trocar por mensagem de produto + CTA |
| 10 | “Vídeo não encontrado na Biblioteca deste tenant” | UI | asset da URL não é vídeo do tenant | escolher outro vídeo | ✅ (estado vazio com ações) | manter |
| 11 | “Não foi possível carregar a fila de produção” | UI toast | falha de API/tenant | recarregar | 🟡 | botão “Tentar de novo” |
| 12 | “Não foi possível aprovar” | UI toast | 403/422/rede | ver motivo | 🟡 | detalhar causa + CTA |
| 13 | “Aprovação em lote interrompida” | UI toast | erro no meio do lote | refazer | ✅ | manter |

## Publicação

| # | Mensagem | Origem | Causa | Recuperação | CTA hoje | Ação proposta |
|---|---|---|---|---|---|---|
| 14 | “A conexão do Instagram expirou. Reconecte em Configurações → Integrações.” | API/UI | token expirado | reconectar | 🟡 | botão direto para a conexão |
| 15 | “O Reel precisa ter um vídeo anexado antes da publicação automática.” | API 422 | vídeo ausente | montar/gerar | 🟡 | link para a peça |
| 16 | “Imagem não disponível para publicar o Feed/Story.” | API 422 | mídia sem URL pública | regerar/trocar | ❌ | CTA “Corrigir mídia” |
| 17 | “Este formato ainda não possui publicação automática para Instagram.” | API 422 | formato incompatível | publicar manual | 🟡 | explicar e oferecer manual |
| 18 | “O Feed aceita no máximo 10 imagens por publicação.” | API 422 | carrossel grande | reduzir | ✅ | manter |
| 19 | “Não foi possível enfileirar publicação orgânica agendada” | LOG | erro de criação da publicação | retry | ❌ | erro na peça + retry |
| 20 | `instagram_connection_incomplete` / `connection_not_found` / `meta_not_connected` | API (código cru) | conexão ausente | conectar | ❌ | traduzir para texto de produto |

## Contexto e resultados

| # | Mensagem | Origem | Causa | Recuperação | CTA hoje | Ação proposta |
|---|---|---|---|---|---|---|
| 21 | “Nenhuma informação aprovada relacionada foi encontrada. A IA foi orientada a não inventar dados.” | UI | biblioteca/catálogo sem fonte aprovada | cadastrar/aprovar | ✅ (link Biblioteca) | manter |
| 22 | “Ainda não há dados suficientes para aprender com o ciclo.” | UI | sem posts medidos | publicar/conectar canais | 🟡 | link para publicar |

## Padrões a corrigir

1. **Código cru na tela** (`instagram_connection_incomplete`, `scheduled_reel_missing_video`):
   todo erro precisa de `code` interno + `message` de produto + `action`.
2. **Erro sem CTA** (itens 6, 16, 19, 20) — o usuário não tem o que fazer.
3. **Texto técnico no lugar de orientação** (item 9) — o detalhe pode ficar em “ver mais”,
   mas a mensagem principal deve dizer “o que fazer”.
4. **Erro só em log** (6, 19) — falhas de worker precisam aparecer na peça.
5. **Contrato único**: `{ code, message, action: { label, href|intent } }` para API e UI.

## Critérios de aceite

- [ ] 100% dos erros com `code` estável e `message` em pt-BR.
- [ ] Todo erro exibido tem um CTA (ou instrução explícita de contato).
- [ ] Nenhum código técnico cru em toast/tela.
- [ ] Falha de worker/publicação aparece na peça com motivo e retry.
