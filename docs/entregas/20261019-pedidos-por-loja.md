# CICLO-01 — Pedidos por loja e aceite parcial — v1
Atualização: 19/10/2026. Estado: implementado sem validação integrada.
## Escopo e branches
Praça.ai PR #49 (feat/pracaai-cotacao-direta-ciclo); AppVendor PR #3564 (feat/pracaai-cotacao-direta-appvendor). Alterações versionadas nesta entrega; SHAs finais registrados nos corpos das PRs.
## Implementado nesta versão
- `PRACA_SUBORDERS_ENABLED` desativada por padrão. Criação de subpedidos por vendedor após gravar itens e antes de iniciar cobrança; exige comprador autenticado quando habilitada.
- Snapshot transacional dos itens e valores; valida soma exata contra pedido mestre. Descontos por maior resto em centavos, desempate estável. Frete permanece individual por loja.
- Consulta pelo comprador no pedido e pelo vendedor no AppVendor. Gateway usa tenant da sessão assinada, ignora tenant do navegador. Loja só recebe pedidos com pagamento confirmado e dados necessários à entrega depois disso.
- Foto privada (JPG/PNG, valida assinatura/tamanho), recebedor e quantidades por item. AppVendor comprime foto antes do envio. Request key evita duplicar comprovante em reenvio.
- Comprador aceita somente com declaração explícita de conferência ou rejeita por divergência; aceite idempotente. Não existe aceite automático por silêncio.
- Saldo de quantidades considera entregas reportadas e aceitas, impedindo sobre-entrega. Cálculo proporcional do valor dos itens em centavos; frete líquido só elegível no último aceite da loja.
- `release_status=blocked_provider` em todos os recebimentos. Nenhuma transferência externa ou promessa de retenção operacional.
- Fontes de subpedidos/itens/recebimentos/eventos relacionadas ao NSU mestre e MOV, quando auditoria habilitada. Histórico da loja filtrado por vendedor e mestre, com paginação bigint.
- Tela de Rodadas de Compra com Como funciona; nome ajustado na entrada da home. Rateio de frete do lote alterado para maior resto em SQL, evitando centavos perdidos.
## Correções relacionadas
- Remove segundo handler POST /orders legado que ainda estava no arquivo anterior; o handler 410 já impedia execução, mas código morto referenciava import removido.
- GET de pedido de convidado exige vínculo com sessão que criou o pedido (até 20 IDs recentes); login não autoriza consultar pedido de outro cliente.
- Sincronização CRM, benefícios e créditos não são executados antes do pagamento. Reprocessamento confiável pós-pagamento continua pendente.
- Logística antiga exige pagamento em transições; comprovante do entregador não conclui mestre nem disponibiliza crédito automaticamente. Crédito logístico fica pendente.
- Rotas logísticas legadas sem autenticação de vendedor para criar/prontificar/atribuir entrega passam a 410. Migração de consumidores dessas rotas necessária; não promover sem revisão.
## Validação real
PASS local:
- node scripts/test-suborders.mjs: rateio em 500 combinações, soma dos snapshots, rollback em divergência, flags, frações, frete final, aceite repetido, autenticação/titularidade e pagamento. Rota/lib reais com DB simulado.
- AppVendor node scripts/test-praca-suborders-proxy.mjs: loja assinada, tenant adulterado ignorado, cursor bigint e usuário sem loja.
- test-freight-totals.mjs e test-freight-legacy.mjs sobre arquivos integrados.
- test-negotiation-history.mjs e test-delivery-evidence.mjs com VM e dependências simuladas.
- Transformação sintática backend incluída nos testes.
Não executados: PostgreSQL/migrações/gatilhos reais, SQL de rateio das rodadas, build/typecheck completos, renderização visual, teste de navegador, pagamento/gateway, regeneração de clientes.
## Homologação e produção
Contabo releaseStatus(PRACA-49) retornou MCP Internal error nesta execução. Não comprova saúde ou build do candidato. Sem SSH disponível, sem merge/deploy.
Nova migração só instalada no bootstrap se PRACA_SUBORDERS_ENABLED=true. Não habilitar antes de homologação. Desligar a flag não remove tabelas, gatilhos NSU nem registros já instalados.
## Pendências explícitas
- Retenção/escrow, onboarding financeiro dos lojistas, split, repasses, webhooks de transferências e conciliação real do provedor.
- Cancelamento, disputa e estorno independentes por subpedido; disputas antigas do mestre bloqueiam seus subpedidos. Divergência do comprovante rejeita o aceite, sem executar estorno.
- Entrega parcial para cotação e rodada: continuam no fluxo integral existente. Nova entrega parcial cobre Marketplace somente.
- Reprocessamento pós-pagamento de CRM, comissões/benefícios com idempotência; comissões externas AppVendor ainda sem vínculo completo ao NSU.
- Identificação individual dos operadores administrativos (chave compartilhada atual insuficiente).
- SDK/OpenAPI dos novos endpoints, migração de consumidores logísticos antigos e compatibilidade completa dos segmentos especializados.
- Pedidos anteriores não têm backfill de subpedidos: exige valores históricos comprovados, não rateio inventado.
- Falha de snapshot deixa mestre pendente e bloqueia cobrança; checkout inteiro ainda não é transação única, com estoque VendorAI em outro banco.
## Próximo gate
Restabelecer executor Contabo, registrar manifestos dos dois SHAs, compilar, testar migrações em banco isolado e validar fluxos por comprador/loja antes de qualquer promoção.

## Continuação CICLO-02 — 19/10/2026

Implementado nesta continuação:

- Split por subpedido e por cotação/rodada com `walletId`, comissão da loja e vínculo do split ao subpedido; reconciliação idempotente de `PAYMENT_SPLIT_DONE`.
- Onboarding financeiro da loja com criação de subconta Asaas, configuração de escrow e estado de KYC, sem persistir/expor a chave retornada pelo provedor.
- Cancelamento pelo comprador e estorno parcial por subpedido; estorno do split usa a fração líquida da loja e o webhook confirma/nega o resultado.
- Entregas parciais acumulativas em cotações e rodadas, com chave idempotente, limite por item, aceite/rejeição do comprador e conclusão apenas quando todas as quantidades forem aceitas.
- Job pós-pagamento idempotente para CRM, negócio por loja, créditos e comissão; payout e conversão passam a aceitar `master_nsu` e `movement_nsu`.
- Operações financeiras administrativas novas exigem `x-admin-operator-id` e chave individual em `PRACA_ADMIN_OPERATORS_JSON`, com trilha em `praca_admin_events`.
- AppVendor ganhou proxy autenticado por sessão para cadastro financeiro e entrega parcial. O arquivo legado de navegação, que estava truncado no commit-base, foi recomposto a partir da última versão íntegra antes de adicionar Pedidos Praça.ai.

Flags, todas desativadas por padrão:

- `PRACA_PROVIDER_SETTLEMENTS_ENABLED`
- `PRACA_FINANCIAL_ONBOARDING_ENABLED`
- `PRACA_SUBORDERS_ENABLED`
- `PRACA_NSU_AUDIT_ENABLED`
- `ASAAS_PAYMENT_WEBHOOK_ENABLED`

Validação local desta revisão:

- Praça.ai: `pnpm run typecheck` aprovado; `PORT=5173 BASE_PATH=/ pnpm run build` aprovado.
- Praça.ai: testes de subpedidos, cliente de estorno Asaas, roteamento integrado de cobrança/webhook e comprovantes aprovados com dependências simuladas.
- AppVendor: typecheck da API aprovado; build do frontend e auditoria de bundle aprovados; proxies de subpedidos, entrega e NSU aprovados.
- AppVendor: o build completo da API continua bloqueado por guards preexistentes em `content.ts`, `media-plan-auto-production.ts` e `site_generator_core`, fora deste lote. A rota alterada compila no typecheck da API.
- `git diff --check` aprovado após normalização.

Rollback preparado:

1. Manter todas as flags acima em `false` interrompe o fluxo novo sem apagar registros.
2. Reverter o candidato para os SHAs-base `b74f105` (Praça.ai) e `81b1b0b` (AppVendor.ai).
3. Migrações são aditivas; não executar `DROP` em rollback operacional. Preservar eventos, solicitações e conciliações para auditoria.
4. Antes de promoção, criar backup do banco e da imagem/contêiner atual, registrar SHA e imagem exatos e comprovar restauração no ambiente isolado.

Homologação Contabo e promoção: pendentes até o SHA final ser enviado às PRs, as migrações serem executadas em banco isolado e os fluxos reais serem validados. Produção permanece intocada.
