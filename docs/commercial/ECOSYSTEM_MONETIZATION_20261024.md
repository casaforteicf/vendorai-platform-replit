# ECOSYSTEM-MONETIZATION-20261024 — catálogo integrado e governança de preços

**Estado:** proposta versionada, sem cobrança ativa ou alteração de preços em produção.  
**Fontes de verdade:** `lib/db/migrations/529_vendor_current_products_catalog.sql`, `lib/db/migrations/528_unlimited_users_vendor_credits_model.sql`, `docs/commercial/VENDORAI_COMMERCIAL_MODEL_V1.md`.  
**Formato de importação:** `docs/commercial/ecosystem-monetization-20261024.json`.

## 1. Regras mandatórias

- Preservar o catálogo institucional existente e SKUs ativos; não recriar planos, não substituir preços, não reativar SKUs legados.
- **Usuários ilimitados em todos os planos** (migration 528): não introduzir cobrança por assento.
- Vendor Credits representam consumo comercial por operação, não dinheiro ou tokens brutos do provedor. O uso só deve ser debitado após resultado bem-sucedido, com idempotência.
- Uma capacidade técnica é diferente de um produto comercial vendável. Financeiro é uma área do ERP; Arqdor Market usa Praça.ai, sem marketplace paralelo.
- Cada proposta de tarifa deverá ter `status: proposta` até aprovação comercial, revisão jurídica, custos, impostos, provedor de pagamento, QA e implantação controlada.
- Proibir dupla cobrança: inclusão em bundle, assinatura adicional, transação marketplace, comissão de representante e uso por créditos exigem bases de incidência distintas e auditáveis.
- Ofertas comerciais não dão ao agente autorização automática para criar cobranças, mudar preços, contratar fornecedores ou publicar campanhas.
- Todos os produtos devem preservar isolamento por tenant, perfis, consentimentos e eventos de auditoria.

## 2. Catálogo existente confirmado no código (migration 529)

| SKU | Produto | Preço mensal (R$) | Credits/mês |
|---|---|---:|---:|
| vendor-prepaid | Vendor Pré-Pago | 0 | 0 |
| vendor-start-monthly | Vendor Start | 49 | 500 |
| vendor-sales-monthly | Vendor Sales | 149 | 1500 |
| vendor-prospector-v2-monthly | Vendor Prospector | 197 | 2500 |
| vendor-marketing-monthly | Vendor Marketing | 197 | 2500 |
| vendor-service-monthly | Vendor Service | 197 | 2000 |
| vendor-agents-monthly | Vendor Agents | 197 | 2500 |
| vendor-intelligence-monthly | Vendor Intelligence | 197 | 1500 |
| vendor-finance-monthly | Vendor Finance | 149 | 1000 |
| vendor-build-monthly | Vendor Build | 297 | 2000 |
| arqdor-monthly | Arqdor | 197 | 2500 |
| vendor-commerce-monthly | Vendor Commerce | 149 | 1000 |
| vendor-complete-monthly | Vendor.ai Complete | 697 | 7500 |

Esses preços são **identificados no código**, não auditados contra estado vivo de produção. O documento comercial V1 é anterior e descreve uma geração legada de produtos (Growth etc.). Em caso de conflito, reconciliar com catálogo ativo e histórico antes de qualquer alteração.

## 3. Oferta previamente discutida — Fundadores

- Nome: **Complete Fundadores**; primeiro grupo de **100 clientes**.
- Preço de referência: **R$ 697/mês**; desconto 30% por 12 meses: **R$ 487,90/mês**.
- Vendor Credits mensais: **7.500**, conforme regra comercial previamente discutida.
- Implantação de referência: **R$ 5.000**. Não substituir automaticamente o preço de implantação institucional legado.
- Representante: **15% padrão ajustável**; ainda definir precisamente evento de reconhecimento, recorrência, impostos, descontos e estorno.
- Necessário criar/identificar campanha elegível, vigência, regras de renovação e exclusões; NÃO sobrescrever o SKU padrão `vendor-complete-monthly` nem aplicar desconto em todos os tenants.
- Oferta histórica/planejada: **não comprovada como oferta cadastrada e ativa em produção**.

## 4. Propostas comerciais adicionais (NÃO APROVADAS)

### Arqdor
- Free 0; Creator 79; Studio Pro 199; Studio + Engenharia 349; Business 699 por mês.
- Como já existe **Arqdor R$ 197** no catálogo, esses nomes e preços são apenas alternativas de empacotamento; não publicar simultaneamente ofertas sobrepostas sem decisão comercial.
- Renders, alta resolução, bibliotecas, projetos/armazenamento e processamento intensivo devem seguir métricas e Vendor Credits; não cobrar render visualizado ou download sem nova geração.
- Arqdor opera render, Measure, Studio, especificação, orçamento, memorial e documentação; ofertas técnicas enviadas para Praça.ai quando solicitado.

### Praça.ai
- Comissão por categoria **hipotética**: indústria/materiais 3%; produtos gerais 6%; decoração 8%; serviços 10%; imóveis exigem contrato próprio.
- Planos de vendedor (hipótese): Free 0; Loja Pro 99; Business 299; Enterprise 799 por mês.
- O `vendor-commerce-monthly` **já existe a R$ 149**, mas NÃO corresponde automaticamente a um plano de vendedor Praça.ai; preservar distinção entre software de gestão e serviços do marketplace.
- Comissão transacional: apenas em negócio liquidado/segundo base contratual; frete declarado pelo vendedor, tributos, cancelamento, repasse, retenção, disputas e devoluções são configuráveis.
- Leilões reversos, rodadas e compras coletivas: NSU mestre e NSUs filhos; sem comissão duplicada.
- Identidade de comprador/fornecedor deve ser protegida em fase cega; revelar apenas segundo regras de fechamento e lei aplicável.

### Vendi IA
- Propostas de produtos autônomos: Assistente 49; SDR 199; Closer 299; Marketing 249; Financeiro 199; Cobrança 199; Suporte 149; Comprador 149; Desenvolvedor a partir de 499; Enterprise sob proposta.
- **Vendor Agents já custa R$ 197 e inclui 2.500 Vendor Credits** no catálogo. As especialidades acima NÃO devem ser vendidas por cima de uma inclusão existente sem regra explícita de add-on.
- Separar direito ao agente, consumo por Vendor Credits, terceiros (WhatsApp, busca, meios de pagamento etc.) e serviço humano.
- Execução autônoma exige ferramentas autorizadas, auditoria, limites e aprovações para ações sensíveis.

### Vendor.ai — serviços e adicionais
- Propostas antigas discutidas de CRM Start 149, Business 297, Complete 697, Enterprise 1497 e módulos isolados NÃO substituem o catálogo atual de migration 529.
- Adicionais propostos devem preferir SKUs já existentes: Marketing, Service, Finance, Build, Prospector, Intelligence, Agents e Commerce.
- Implantação simplificada a partir de R$ 990 e empresarial R$ 5.000: **serviços opcionais sujeitos a escopo e aprovação**.
- Não cobrar usuário adicional: contradiz a política oficial de usuários ilimitados.

## 5. Ciclo de monetização entre sistemas

1. Marketing, Praça.ai ou indicação cria demanda e origem comercial.
2. CRM associa pessoa, empresa, tenant e oportunidade.
3. Arqdor converte necessidade em projeto, medidas, especificações e quantitativos.
4. Praça.ai recebe requisição e ofertas, devolve preço, frete e prazo com versão.
5. CRM aprova proposta e contrato; ERP gera pedido e registros de cobrança.
6. Obras/serviço recebe escopo aprovado, acompanha entrega e aceite.
7. Suporte e Vendi identificam recompra, manutenção, indicação e expansão.
8. Cada linha de receita guarda `tenant_id`, `product_sku`, `order_id`, `billing_basis`, `currency`, `amount`, `discount`, `commission_rule`, `transaction_reference` e status.
9. Produtos de software, comissão transacional, Vendor Credits, implantação e repasses são lançamentos de natureza diferente; proibir empilhamento não contratado.

## 6. Telas e componentes recomendados (implementação futura)

Superadmin → Comercial e Monetização:
- Catálogo oficial: nome, SKU, tipo, mercado, módulos cobertos, estado, preço, créditos, custo e margem.
- Tarifas Praça.ai por categoria/segmento; comparador de preço final.
- Campanhas comerciais: Fundadores, elegibilidade, vigência, desconto, implantação e representantes.
- Vendi: direitos por produto/agente, métricas, créditos e custo real.
- Simulador com GMV, assinaturas, conversão, churn, impostos, custos, comissões e margem de contribuição.
- Governança: revisão, aprovação dupla para publicação de preço, trilha de auditoria e rollback de tabela.

Portal do cliente:
- Mostrar somente produtos elegíveis para segmento, inclusões existentes, saldo de créditos e histórico de consumo.
- Upsell contextual sem cobrança silenciosa; não repetir venda de capacidade incluída.

## 7. Critérios de aceite antes de ativar preços

- Reconciliar produtos existentes no banco real com SKUs da migration 529 e assinaturas em vigor.
- Definir juridicamente incidência de taxas e retenção de fundos do marketplace.
- Calcular custo unitário e margem para IA/render/prospecção por operação usando telemetria.
- Validar política de não cobrança dupla e usuários ilimitados.
- Testar migrações, API, permissões, casos de cancelamento/reembolso e idempotência.
- Publicar sob aprovação explícita, backup, healthchecks e rollback; auditar resultado.
