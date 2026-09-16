# VendorAI App Builder — Mobile App Standard V2.2

## Objetivo

Padronizar todos os apps mobile criados pelo App Builder em uma experiência consistente, moderna, white-label e preparada desde a arquitetura para comércio, ERP, PDV, estoque, financeiro e VendorAI.

O padrão visual parte de uma linguagem de apps de varejo modernos: navegação inferior persistente, Home com informação útil e acesso rápido, catálogos em grade, busca, categorias, histórico, perfil, notificações, menu e estados vazios bem definidos. O padrão é universal e não depende do segmento.

## Regra central

O tenant pode mudar marca, cores, conteúdo, ordem e capacidades habilitadas. Não pode quebrar safe-area, hierarquia, acessibilidade, estados de carregamento, navegação, espaçamento mínimo ou comportamento dos componentes oficiais.

## Shell oficial

### Header

- respeita safe-area Android/iOS;
- perfil à esquerda;
- marca/logo ao centro;
- notificações à direita;
- variações somente quando justificadas pelo caso de uso;
- conteúdo nunca entra sob status bar, notch ou câmera.

### Bottom navigation

- até 5 destinos;
- texto + ícone;
- item ativo sempre evidente;
- respeita safe-area;
- conteúdo tem padding inferior suficiente para nunca ficar escondido.

## IDs canônicos

Quando uma tela existir, o Arquiteto IA deve preferir `home`, `catalog`, `search`, `categories`, `product-detail`, `cart`, `checkout`, `orders`, `order-detail`, `promotions`, `stores`, `profile`, `notifications` e `menu`.

As páginas `catalog`, `cart` e `orders` ativam componentes estruturados do Runtime.

## Catálogo real

A data source `catalog.products` lê somente produtos ativos do catálogo real do tenant e retorna nome, SKU, marca, categoria, mídia, preço, promoção, estoque/disponibilidade, prazo e destaque. O frontend nunca escolhe o tenant da consulta.

## Compras realizadas no app

O carrinho é persistente por App Product e o fechamento usa a action `commerce.checkout.start`.

No servidor, o checkout:

- revalida o catálogo;
- usa preço atual e promoção vigente;
- valida e reserva estoque local controlado;
- usa idempotência;
- cria cobrança no Asaas configurado para o tenant;
- acompanha pagamento e recorrência pelo lifecycle já existente;
- registra eventos no outbox de commerce.

A regra é fixa: confirmou a compra, o checkout é criado automaticamente. Não existe um toggle por produto para desativar essa geração.

## Customer Identity — CPF

O CPF é usado como identificador de correspondência, não como chave primária técnica.

O backend:

1. normaliza e valida o CPF;
2. cria um fingerprint HMAC-SHA256 usando segredo da plataforma;
3. mantém o documento bruto cifrado usando a infraestrutura de criptografia existente;
4. faz matching sempre dentro do tenant;
5. nunca publica CPF bruto no histórico, analytics ou eventos de commerce.

A action oficial `viewer.identity.cpf.link` permite ao App User vincular explicitamente o próprio CPF. A ação é de risco médio e precisa estar habilitada na versão publicada.

Se já houver compras externas com o mesmo fingerprint, elas são associadas ao App User no momento do vínculo e passam a aparecer em `Minhas compras`.

Se o CRM já possuir o mesmo CPF em `leads.documento` e o App User estiver ligado ao contato, o Identity Resolver pode associar a compra ao cliente existente.

## Compras realizadas fora do app

Uma venda também pode nascer em:

- ERP;
- PDV / frente de caixa;
- e-commerce;
- marketplace;
- integração própria do cliente.

O serviço canônico `ingestExternalPurchase()` recebe a venda já autenticada pelo adapter e normaliza os dados para `external_purchases`.

O contrato mínimo inclui:

- `sourceKey` e `sourceKind`;
- `externalOrderId`;
- CPF, quando informado pelo consumidor;
- data/hora da venda;
- itens e quantidades;
- subtotal, desconto e total;
- loja/unidade;
- terminal/caixa;
- vendedor, quando disponível;
- meio de pagamento;
- status.

Não foi criado endpoint público genérico sem autenticação. Cada adapter de ERP/PDV deve autenticar seu fornecedor e somente então chamar o serviço interno de ingestão.

## Idempotência de compras externas

A chave lógica é:

`tenant + sourceKey + externalOrderId`

O mesmo evento reenviado não cria outra compra. Uma atualização posterior pode mudar a mesma venda para `cancelled`, `refunded`, `partially_refunded` ou `voided`.

## Compra antes do cadastro no app

Se a compra externa chegar com CPF e ainda não existir App User correspondente:

1. a venda é preservada;
2. fica relacionada ao fingerprint do CPF;
3. não é atribuída arbitrariamente a outro usuário;
4. quando o consumidor vincula o mesmo CPF no app, as compras pendentes daquele tenant são reclamadas automaticamente;
5. a tela `Minhas compras` é recarregada com o histórico anterior.

## Histórico unificado

A data source `commerce.orders` agora combina:

- checkout/pedido feito dentro do App Product;
- compras externas vinculadas ao mesmo App User.

A UI mostra status, itens, total, data, origem (`App`, `PDV/Caixa`, `ERP`, `E-commerce`, `Marketplace` etc.), identificador externo e loja quando disponível.

O consumidor passa a enxergar o relacionamento inteiro com a empresa, e não apenas o que comprou dentro do aplicativo.

## Outbox e VendorAI

Tanto compras internas quanto externas alimentam `app_runtime_commerce_events`.

Compras externas emitem eventos como:

- `commerce.external_purchase.created`;
- `commerce.external_purchase.paid`;
- `commerce.external_purchase.cancelled`;
- `commerce.external_purchase.refunded`;
- `commerce.external_purchase.partially_refunded`;
- `commerce.external_purchase.voided`.

O outbox é o contrato para adapters e consumidores de CRM, Customer Intelligence, fidelidade/cashback, marketing, financeiro, fiscal, ERP, agentes e automações.

## Source of truth

Cada integração deve declarar autoridade por entidade. Exemplos:

- ERP/PDV pode ser autoridade da venda, estoque, fiscal e financeiro;
- App Product é autoridade da sessão/carrinho;
- provedor de pagamento é autoridade do status da transação;
- VendorAI é autoridade de lead, inteligência, segmentação e automação.

Quando ERP ou PDV for a autoridade da venda, VendorAI mantém uma projeção operacional e eventos. Cancelamentos/estornos devem ser confirmados pela fonte oficial ou por um adapter oficial.

## Segurança

- isolamento por tenant;
- CPF bruto cifrado em repouso;
- matching por HMAC, não por hash simples;
- CPF bruto fora de analytics e outbox;
- nenhuma origem externa pode selecionar outro tenant por payload;
- compras externas deduplicadas;
- ações sensíveis não viram formulário genérico;
- segredos fora de templates;
- nenhuma publicação automática pelo Arquiteto IA.

## Arquitetura de integração obrigatória

Toda geração mobile deve definir `integrationArchitecture` com os domínios necessários: catálogo, estoque, commerce, financeiro, ERP/PDV, fiscal, VendorAI, identidade, engajamento, localização e analytics.

Para cada domínio registrar `sourceOfTruth`, direção, provider/registry, entidades, eventos, actions, permissões, modo de sincronização, health check e fallback. Capacidade inexistente deve continuar como `gap`.

## Status V2.2

Implementado na branch atual:

1. padrão visual Mobile V2.2 no Arquiteto IA;
2. catálogo real;
3. ProductGrid/ProductCard e detalhe;
4. carrinho persistente;
5. checkout automático real com Asaas;
6. reserva de estoque local controlado;
7. pedidos e lifecycle financeiro;
8. Customer Identity por CPF protegido;
9. action de vínculo de CPF;
10. ingestão canônica de compras externas;
11. deduplicação por sistema de origem e ID da venda;
12. histórico unificado de compras;
13. origem da compra na interface;
14. outbox para compras internas e externas.

Ainda dependem do fornecedor escolhido:

- adapter/webhook específico do ERP;
- adapter do PDV/frente de caixa;
- adapter do e-commerce/marketplace;
- fiscal/NF quando a fonte oficial for externa;
- regras específicas de cashback/pontos;
- APIs de estorno/devolução do fornecedor quando aplicável.
