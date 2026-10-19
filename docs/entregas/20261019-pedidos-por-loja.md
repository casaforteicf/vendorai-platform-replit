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
