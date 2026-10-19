# Praça.ai — rodadas de negócios

Data: 2026-10-18

## Fluxo

O Marketplace continua como entrada. O comprador pode criar uma demanda padronizada ou participar de um lote aberto em seu município. Demandas compatíveis são agrupadas por item, especificação, unidade, cidade/UF e data necessária.

Lojistas habilitados participam pelo AppVendor.ai. Eles veem a demanda e o melhor preço, sem conhecer o comprador nem os concorrentes, e podem enviar lances decrescentes. A rodada fecha no prazo e cria um pedido individual para cada comprador participante, que decide se aceita e paga pelo Praça.ai.

O comprador e a loja são identificados um ao outro somente depois da confirmação do pagamento. O pedido fica visível no CRM como lead, e o comprador confirma a entrega no Praça.ai depois de receber o material.

## PRs e configuração

- Praça.ai checkout, rodadas e confirmação de entrega: PR #49.
- Telas e API de lojista AppVendor.ai: PR #3564.
- Cidade e UF da loja: PR #3563.
- AppVendor API: configurar `PRACA_AI_INTERNAL_API_URL` e `PRACA_ROUNDS_VENDOR_TOKEN`.
- Praça.ai API: configurar o mesmo token e webhook Asaas; não expor esses valores no frontend, logs ou repositório.

## Estado e pendências

- O código está em PRs de rascunho. Não houve merge, deploy ou aplicação de migração nesta sessão.
- Build, typecheck e testes não foram executados porque não havia checkout/terminal conectado.
- A homologação Contabo precisa validar encerramento, concorrência de lances, isolamento por município, anonimização, pagamento, webhook, atualização do CRM e confirmação de entrega.
- A confirmação de entrega registra o estado do pedido; o repasse automático após entrega ainda exige onboarding/verificação da conta Asaas vinculada do lojista (walletId) e implementação/validação da transferência. Não há escrow operacional ou transferência automática no código atual.
- A gestão estruturada da expedição pelo lojista e o fluxo de disputa também permanecem pendentes.
- Não habilitar cobranças reais antes de homologar o ciclo financeiro completo.

