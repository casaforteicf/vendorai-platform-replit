# PRACA-49 / APPVENDOR-3564 — NSU mestre e histórico de negociações
Versão: nsu-ledger-1. Data: 18/10/2026 (Brasília).

## Modelo implementado
- praca_negotiations: NSU mestre sequencial e permanente, com referência à compra Marketplace, cotação direta ou lote/rodada. Protocolos existentes são preservados.
- praca_negotiation_links: identificador MOV sequencial por entidade e FK para o NSU mestre. Subpedidos, propostas e entregas não podem trocar de mestre.
- praca_negotiation_events: sequência única por evento, operação, referência à entidade e ao mestre, valores operacionais antes/depois, ator quando identificado e datas.
- FK composta garante que evento e entidade pertençam ao mesmo mestre. UPDATE/DELETE nos registros de auditoria são recusados por gatilhos. Administradores do banco ainda podem alterar o esquema/desabilitar gatilhos; isto não é prova criptográfica de inviolabilidade.
- Gatilhos AFTER INSERT/UPDATE/DELETE capturam movimentações na mesma transação da fonte; se a gravação de auditoria falhar, a movimentação falha.
- 30 fontes contempladas: compra/itens/vínculo CRM/repasse/comissão, entrega/prova/eventos, disputa, evento de pagamento Asaas, crédito logístico com entrega vinculada, cotação/itens/destinatários/propostas/preços/vínculos CRM, lote/participação/lance/histórico de lance/pedido/vínculo CRM, expedição, disputa/eventos, cancelamento/eventos, aceite/liberação e evento Asaas de estorno com cobrança reconhecida.
- Eventos externos ignorados sem pedido reconhecido e ajustes bancários sem entrega não são atribuídos artificialmente a uma negociação; permanecem nas fontes para conciliação.
- Comissão de vendor_payouts é registrada com valores antes/depois. Comissões externas no banco AppVendor ainda precisam receber/vincular este NSU; não foram migradas neste lote.

## Sigilo e acesso
- Administração: aba Histórico NSU e GET /api/admin/negociacoes/:nsu, protegidos pelo middleware admin existente.
- Comprador: GET /api/negotiations/:type/:id/history exige sessão e titularidade, com filtro de escopo e paginação.
- Lojista: proxy AppVendor usa tenant da sessão assinada; endpoint interno valida token, loja vencedora e pedido pago antes de retornar o histórico daquele pedido.
- Rodada tem um mestre operacional compartilhado, mas cada pedido/participação tem vínculo próprio. O histórico do comprador/lojista não retorna outros compradores, lances, fornecedores concorrentes ou valores internos.
- Fotos, nomes, contatos, notas livres e credenciais não são copiados para a auditoria. Os anexos e documentos seguem em suas fontes privadas, identificáveis pela entidade vinculada.
- Valores, IDs do Asaas e alterações financeiras detalhadas só são retornados no endpoint administrativo; o endpoint externo seleciona campos limitados.
- Interface: histórico em cotações, pedidos de rodadas, Meus Pedidos, AppVendor e aba administrativa.
- Ator vem do evento original ou do contexto PostgreSQL app.actor_type/app.actor_id. Se a fonte não identifica um operador, grava system; não se presume que o dono do pedido realizou uma alteração. Identificação individual de administradores segue limitada pelo acesso administrativo atual por chave compartilhada.

## Migração, ativação e registros antigos
- Migração aditiva em lib/db/migrations/20261018_negotiation_nsu.sql; registro mestre sem reaproveitar protocolos de gateways.
- installNegotiationAudit usa transação e advisory lock; chamado após bootstrap e após criação das tabelas dinâmicas de propostas.
- PRACA_NSU_AUDIT_ENABLED=true habilita instalação e endpoints. Padrão desligado, sem consultar tabelas ausentes.
- Depois que os gatilhos forem instalados, desligar a variável fecha as APIs e evita nova instalação, mas não remove gatilhos nem apaga o histórico.
- Migração exige manutenção/homologação: instala gatilhos e registra snapshots das fontes. Revisar volume/tempo antes de aplicar em produção.
- Snapshot marca o estado atual na data de registro; created_at/joined_at originais ficam como dados de origem. Não inventa transições antigas nem autoria.
- Conversas e alterações históricas sem evento persistido não podem ser reconstruídas. A cobertura completa começa na ativação da auditoria.

## Validação executada e limites
- node --experimental-vm-modules scripts/test-negotiation-history.mjs: PASS, com banco simulado. Sessão/token, titularidade, escopo, paginação, cursor bigint, filtro de loja e flag.
- AppVendor: node --experimental-vm-modules scripts/test-praca-nsu-proxy.mjs: PASS, sessão assinada e preservação de cursor com upstream simulado.
- Transformação sintática TypeScript dos módulos backend alterados: passou.
- PostgreSQL real/gatilhos/migração/backfill: NÃO executados. Ambiente local sem PostgreSQL e lote de homologação não registrado.
- Builds, typecheck completos e revisão visual: pendentes. Testes isolados não substituem esses gates.
- Não há execução financeira, liberação automática, merge ou deploy neste lote.
- Estado: implementação preparada, validação isolada de API; migração/auditoria ainda não homologadas, ativação desligada.
