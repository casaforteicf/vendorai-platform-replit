# FRETE-01 — Total com frete — v1
Atualização: 18/10/2026.
## Escopo
Marketplace, cotação direta e Rodadas de Compra: mostrar produtos, frete e total antes do pagamento. Branch Praça feat/pracaai-cotacao-direta-ciclo (PR #49); AppVendor feat/pracaai-cotacao-direta-appvendor (PR #3564).
## Implementado
- Marketplace: POST /checkout/freight usa carrinho da sessão e cálculo do servidor por vendedor. Checkout exibe composição por loja; entrega pelo vendedor ou retirada. Remove tarifas fixas e promessa fictícia de entrega expressa na tela.
- POST /checkout recalcula e exige expectedShipping igual ao valor atualizado; falha de cálculo não vira frete grátis. Usa frete individual na criação das entregas em vez de divisão igual.
- Regras de frete da loja: cidade + UF; limiar grátis só quando configurado; tarifa ausente ou loja indisponível bloqueia cálculo. Zero configurado continua permitido.
- Cotação e rodada exigem campo frete explícito (zero permitido). AppVendor mostra total com frete antes de enviar.
- Rodada compara custo incluindo frete (regra preexistente preservada); frete do lote é rateado por quantidade. Comprador vê produtos/frete/total de sua participação, sem receber dados de terceiros.
- Nomes da página de rodadas ajustados para Rodadas de Compra. Explicação do ciclo financeiro corrigida no AppVendor para liberação de identidade após pagamento.
## Validação
node scripts/test-freight-totals.mjs: PASS em ambiente local, serviço real e helper extraído com dependências simuladas. Cobre mesma cidade/UF distinta, tarifa ausente, limiar, frete zero, duas lojas, retirada e vendedor ausente; transformação sintática de quatro módulos backend.
Revisão manual React: hooks anteriores a retornos condicionais; requisição cancelável, debounce, resposta obsoleta ignorada e bloqueio de total até cotação atual.
Build completo, typecheck, renderização visual, integração com banco e pagamento real NÃO executados.
Contabo releaseStatus(PRACA-49): LOT_NOT_REGISTERED, BUILD=BLOCKED, PRODUCTION=untouched. Falta registro do manifesto por executor autorizado; sem merge/deploy.
## Dependências e limites
- Configuração de cidade/estado depende da PR #3563 no AppVendor. Regras existentes frete_mesma_cidade/frete_outra_cidade/frete_gratis_acima_de são utilizadas.
- Retirada usa modalidade já aceita pela API; disponibilidade operacional e prazo precisam ser confirmados pelo lojista. Não existe estimativa geográfica por CEP/distância.
- Não implementa transportadora, frete por endereço individual de cada participante, liberação financeira parcial, escrow ou subpedidos formais do carrinho.
- Arredondamento proporcional existente das rodadas permanece; reconciliação exata dos centavos por lote ainda precisa validação com PostgreSQL.
- Endpoint legado POST /orders e integrações de segmentos especializados não foram migrados neste lote. Carrinho anterior ao checkout pode continuar com estimativa legada; checkout é fonte do total confirmado.
## Próximo gate
Compilar os dois SHAs em homologação Contabo, testar sessão/checkout/cotações/rodada com dados de teste, validar schema cidade/UF e regras de frete e somente então promover.
