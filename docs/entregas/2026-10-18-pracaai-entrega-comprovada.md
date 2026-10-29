# PRACA-49 — entrega comprovada e aceite do comprador
Versão: delivery-evidence-1. Atualização: 18/10/2026 (Brasília).
Escopo autorizado: lojista informa entrega com foto/validação, comprador confirma e autoriza liberação financeira.

## Implementado
- AppVendor PR #3564: formulário com câmera/arquivo JPG/PNG, compressão local, nome de quem recebeu e declaração de entrega integral. Proxy deriva o tenant da sessão assinada.
- Praça.ai PR #49: endpoint autenticado exige pedido pago pertencente à loja, expedição já registrada (ou retirada pronta), foto válida e ausência de disputa/cancelamento ativo.
- Foto privada armazenada no PostgreSQL em base64, até 700 KB decodificados. Não cria link público. Endpoint de leitura exige sessão do comprador e titularidade do pedido; resposta no-store/nosniff. R2 privado pode substituir este armazenamento em etapa posterior.
- Comprovante registrado é imutável por essa API; alterações de expedição ficam bloqueadas depois do envio.
- Comprador visualiza foto, data e recebedor, e marca explicitamente que recebeu todos os itens corretamente.
- Confirmação bloqueada sem foto/registro, para outro comprador ou durante disputa/cancelamento.
- Transação bloqueia o pedido, registra entrega e autorização de liberação única por pedido/lojista. Reenvio não cria nova autorização.
- Não há confirmação por silêncio ou prazo automático.
- Entrega parcial NÃO permite confirmar integralmente: o lojista e o cliente só declaram aceite após todos os itens daquele pedido. Divisão por itens/parcelas de entrega é próxima etapa; cada pedido de rodada já é individual.

## Limite financeiro
A liberação AUTOMÁTICA DE DINHEIRO ainda não está implementada: depende de subconta/wallet verificada, split/escrow habilitado e validação do Asaas em sandbox. A autorização fica com release_status=blocked_provider. Nenhuma transferência é disparada e nenhum dinheiro é declarado retido/liberado por este lote.
Próximo estágio: consumidor de autorizações com verificação canônica do saldo retido, rechecagem de disputa/cancelamento, ID idempotente do provedor e conciliação de timeout/webhook. Não ativar transferência sem esses requisitos.
Pedidos legados já entregues não são retroativamente declarados autorizados; não há migração de aceite presumido.

## Arquivos e migração
- Novo módulo deliveryEvidence.ts e componente MarketplaceDeliveryProof.tsx.
- Confirmações antigas removidas de quotes.ts/rounds.ts; novas rotas centralizadas no módulo de entrega.
- ensure-tables.ts adiciona colunas de comprovante e praca_delivery_acceptances de modo aditivo/idempotente. Migração não aplicada em banco real.
- AppVendor: PracaDeliveryProof.tsx, PracaOrders.tsx e proxy praca_rounds.ts.
- Base Praça.ai: 33088a01761e98803620f6255ae3b663ec829c02; base AppVendor: 8f5462544aa7e69926412279fa8000f095082e14.

## Validação
- node --experimental-vm-modules scripts/test-delivery-evidence.mjs: PASS. Rotas reais com banco simulado: dois tipos de pedido, auth, titularidade, foto obrigatória/privada, bloqueios, aceite explícito e idempotência.
- AppVendor: node --experimental-vm-modules scripts/test-praca-delivery-proxy.mjs: PASS. Tenant da sessão, sessão obrigatória, limite do payload e encaminhamento simulado.
- Transformação sintática TypeScript dos módulos backend alterados: passou.
- Checklist React aplicado: dependências de effects, cancelamento de fetch, campos rotulados, mensagens acessíveis, bloqueio de envio repetido e redução da foto antes do envio.
- Build/typecheck completos, testes com PostgreSQL real, prova visual e homologação Contabo ainda pendentes. Não considerar teste isolado como homologação.
- Estado: implementado com validação isolada; PRs de rascunho; sem merge/deploy.
- Bloqueio operacional permanece: manifesto PRACA-49 não registrado no operador conectado. É preciso registrar/localizar o lote e homologar os dois SHAs compatíveis no host.
