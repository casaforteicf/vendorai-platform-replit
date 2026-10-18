# Praça.ai — cotações diretas no AppVendor

Data: 2026-10-18

## Escopo

A tela **Cotações Praça.ai** fica no menu CRM do AppVendor e permite responder a solicitações com preço por item, frete, prazo e condições. A API do AppVendor usa a sessão assinada para identificar a loja e encaminha as chamadas ao Praça.ai por um token servidor-servidor.

Uma nova cotação cria um lead anônimo no CRM e uma conversa para o lojista. A identidade e os contatos do comprador só são liberados para a loja vencedora depois que o pagamento do pedido é confirmado no Praça.ai. O vendedor envia sua proposta dentro do AppVendor; o comprador compara as ofertas e paga no checkout do Praça.ai.

## Dependências e configuração

- A API e o checkout correspondentes estão na PR Praça.ai #49.
- Cadastro de cidade e UF da loja está na PR AppVendor #3563.
- Telas e proxy vendedor estão nesta PR AppVendor #3564.
- AppVendor API: `PRACA_AI_INTERNAL_API_URL` com a URL interna da API Praça.ai e `PRACA_ROUNDS_VENDOR_TOKEN`.
- Praça.ai API: o mesmo segredo `PRACA_ROUNDS_VENDOR_TOKEN`; configurar `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` em ambiente seguro e o webhook para `/api/webhooks/asaas`.

Nenhum segredo deve ficar no navegador, em logs ou no GitHub.

## Validação e pendências

Status: **código preparado em PR; build e homologação ainda pendentes; não publicado**.

Esta sessão não tinha checkout/terminal do repositório conectado. Build, typecheck, testes automatizados e migrações não foram executados. Homologar na Contabo com contas de teste, incluindo verificação de anonimização antes do pagamento, webhook, criação do pedido, confirmação de entrega e CRM.

A tela do lojista ainda não tem fluxo estruturado de expedição. O comprador pode confirmar a entrega no Praça.ai; o pedido fica aguardando repasse. A transferência ao lojista e a validação de conta Asaas vinculada ainda não estão implementadas. Não habilitar cobrança em produção antes da homologação financeira de ponta a ponta.
