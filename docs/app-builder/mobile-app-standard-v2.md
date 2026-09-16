# VendorAI App Builder — Mobile App Standard V2.2

## Objetivo

Padronizar todos os apps mobile criados pelo App Builder em uma experiência consistente, moderna, white-label e preparada desde a arquitetura para comércio, ERP, PDV, estoque, financeiro e VendorAI.

O padrão visual parte de uma linguagem de apps de varejo modernos: navegação inferior persistente, Home com informação útil e acesso rápido, catálogos em grade, busca, categorias, histórico, perfil, notificações, menu e estados vazios bem definidos. O padrão é universal e não depende do segmento.

## Regra central

O tenant pode mudar marca, cores, conteúdo, ordem e capacidades habilitadas. Não pode quebrar safe-area, hierarquia, acessibilidade, estados de carregamento, navegação, espaçamento mínimo ou comportamento dos componentes oficiais.

## Shell oficial

Header com safe-area, perfil à esquerda, marca ao centro e notificações à direita. Bottom navigation com até 5 destinos, texto + ícone, estado ativo evidente e safe-area obrigatória.

## IDs canônicos

Quando uma tela existir, o Arquiteto IA deve preferir `home`, `catalog`, `search`, `categories`, `product-detail`, `cart`, `checkout`, `orders`, `order-detail`, `promotions`, `stores`, `profile`, `notifications` e `menu`. `catalog`, `cart` e `orders` ativam componentes estruturados do Runtime.

## Catálogo e checkout

`catalog.products` lê o catálogo real do tenant. O carrinho é persistente por App Product e `commerce.checkout.start` revalida catálogo, promoção e estoque no servidor, usa idempotência, reserva estoque controlado, gera cobrança real no Asaas do tenant e publica o lifecycle no outbox.

A regra comercial é fixa: confirmou a compra, gera checkout automaticamente.

## Customer Identity — CPF

O CPF é dado de correspondência, não chave primária técnica. O backend normaliza e valida o documento, cria fingerprint HMAC-SHA256, mantém o CPF bruto cifrado e nunca publica o valor bruto em histórico, analytics ou eventos de commerce.

A action `viewer.identity.cpf.link` permite que o App User solicite o vínculo do próprio CPF. É uma action de risco médio, habilitada explicitamente na versão publicada. Apps com histórico omnichannel devem incluí-la em `definition.settings.runtimeAccess.actions.keys`.

A tela `orders` possui um componente dedicado para informar CPF e encontrar compras realizadas no caixa, PDV, ERP, e-commerce e demais canais. Compras que chegaram antes do cadastro ficam preservadas pelo fingerprint e são vinculadas ao App User quando o mesmo CPF é informado.

Se o CRM já possuir o CPF em `leads.documento` e houver App User ligado ao contato, o Identity Resolver também consegue associar a compra.

## Purchase Gateway

Uma venda pode nascer no App Product, ERP, PDV/frente de caixa, e-commerce, marketplace ou integração própria. O serviço interno `ingestExternalPurchase()` é o contrato canônico para adapters autenticados.

Cada compra externa carrega `sourceKey`, `sourceKind`, `externalOrderId`, CPF quando fornecido, data/hora, itens, valores, loja, terminal, vendedor, meio de pagamento e status quando disponíveis.

Não existe endpoint público genérico sem autenticação. O adapter específico do fornecedor autentica a origem, transforma o payload e então chama a ingestão canônica.

## Idempotência

Compras externas são únicas por `tenant + sourceKey + externalOrderId`. Reenvio atualiza a mesma venda. Cancelamento, estorno parcial, estorno total ou anulação atualizam o registro original em vez de criar outra compra.

## Histórico unificado

`commerce.orders` combina pedidos feitos dentro do app e compras externas ligadas ao App User. A UI mostra status, itens, total, data, origem (`App`, `PDV/Caixa`, `ERP`, `E-commerce`, `Marketplace`), identificador externo e loja quando disponível.

## Outbox e VendorAI

Compras internas e externas alimentam `app_runtime_commerce_events`. Eventos externos incluem criação e mudanças de status como `paid`, `cancelled`, `refunded`, `partially_refunded` e `voided`.

Esse outbox é o contrato para CRM, Customer Intelligence, fidelidade/cashback, marketing, financeiro, fiscal, ERP, agentes e automações.

## Source of truth

ERP/PDV pode ser autoridade de venda, estoque, fiscal e financeiro; o App Product é autoridade da sessão/carrinho; o provedor de pagamento é autoridade do status da transação; VendorAI é autoridade de lead, inteligência, segmentação e automações. Quando ERP/PDV for a autoridade da venda, VendorAI mantém uma projeção operacional sem alterar silenciosamente a origem.

## Segurança

- isolamento por tenant;
- CPF cifrado em repouso;
- matching por HMAC, não hash simples;
- CPF bruto fora do outbox/analytics;
- compras externas deduplicadas;
- ações sensíveis não viram formulário genérico;
- segredos fora do template;
- nenhuma publicação automática pelo Arquiteto IA.

## Arquitetura obrigatória

Toda geração mobile deve definir `integrationArchitecture` para catálogo, estoque, commerce, financeiro, ERP/PDV, fiscal, VendorAI, identidade, engajamento, localização e analytics. Para cada domínio: source-of-truth, direção, provider/registry, entidades, eventos, actions, permissões, sync, health check e fallback. Capacidade inexistente continua como `gap`.

## Status V2.2

Implementado na branch atual: padrão Mobile V2.2; catálogo real; grid/detalhe; carrinho; checkout Asaas; reserva de estoque; pedidos; Customer Identity por CPF; action de vínculo; ingestão canônica de compras externas; deduplicação; histórico unificado; origem da compra na UI; e outbox para compras internas/externas.

Dependem do fornecedor escolhido: adapter/webhook específico de ERP, PDV, e-commerce ou marketplace; fiscal/NF externo; regras específicas de cashback/pontos; e APIs de estorno/devolução do fornecedor.
