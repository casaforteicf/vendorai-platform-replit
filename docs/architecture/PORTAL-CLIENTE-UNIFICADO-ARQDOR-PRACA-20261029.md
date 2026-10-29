# Portal Unificado Vendor.ai — Arquitetura aprovada e plano de execução
Data: 2026-10-29
Status: decisão de produto aprovada; **implementação não concluída**.

## Decisões aprovadas
1. **Uma identidade global do cliente:** uma conta e credencial para Portal do Cliente Vendor.ai, ARQDOR Cliente e Praça.ai.
2. **Entrada pelo Portal do Cliente existente**, não criar outro portal/login específico para ARQDOR.
3. Cliente pode se relacionar e comprar de **múltiplos tenants/parceiros** na mesma conta; cada tenant enxerga exclusivamente seus vínculos e recursos autorizados.
4. O portal recebe mensagens, propostas, projetos, orçamentos, compras e notificações de vários tenants, sempre indicando o remetente e observando preferências de comunicação.
5. ARQDOR Cliente usa a Tela 1 aprovada **dentro do portal**, sem duplicar cabeçalhos/menus; ARQDOR Profissional permanece no Studio técnico com sua baseline congelada.
6. Praça.ai é acessível com o mesmo login; projetos ARQDOR podem originar cotações e compras no Praça.ai sem recadastro.
7. Cotações: priorizar parceiros homologados do tenant, expandir somente com autorização; **identidade do cliente/empresa e prestador fica oculta até seleção de proposta e aceite mútuo**; higienizar anexos e metadados.
8. Comissão de 10% como padrão configurável; pagamentos intermediados apenas **depois** de integração financeira implantada e validada.
9. Orçamentos devem distinguir estimativa conceitual, orçamento detalhado validado e cotação real; prévias do cliente acompanham a transição para arquiteto/engenheiro, sem sobrescrever a versão técnica.
10. **ZERO REDUNDÂNCIA** e nenhuma alteração de layout aprovado sem autorização explícita.

## Evidência observada no repositório
- `lib/db/migrations/202609282245_global_customer_portal.sql`: `customer_portal_users` tem `tenant_id`, `password_hash` e UNIQUE(`tenant_id`, `email`). Trata-se de contas **por tenant**, não de identidade global comprovada; `customer_portal_sessions` e `customer_portal_access` dependem do usuário tenant-scoped.
- `artifacts/frontend/src/pages/arch/PortalCliente.tsx`: portal específico do ARQDOR já existe, incluindo projetos, ambientes, orçamento e renders.
- `artifacts/frontend/src/contexts/AuthContext.tsx`: contexto de autenticação da aplicação; é preciso reconciliar com as sessões do portal de clientes, não apenas reutilizar token arbitrariamente.
- `artifacts/frontend/src/lib/adaptiveModuleLauncher.ts`: ARQDOR usa rota `/arch/studio`; `portal_cliente` está sem rota nesse launcher.
- `artifacts/api-server/src/routes/praca_rounds.ts`: oportunidades de Praça.ai verificam `req.user.tenantId` e exigem conta de lojista; **não equivalem** ao acesso comprador com identidade global. Não habilitar tais endpoints diretamente para clientes.
- `artifacts/api-server/src/routes/praca_relay.ts`: rotas logísticas são escopadas por tenant. Preservar isolamento.
- `docs/arqdor/BASELINE-VISUAL-APROVADA-2026-10-29.md` e `docs/arqdor/TELA-1-CLIENTE-PROFISSIONAL-APROVADAS.md`: referências visuais, identidade e proibição de redundância permanecem obrigatórias.

## Modelo lógico recomendado (não executar migration sem auditoria)
- `customer_identities`: identidade global, credencial/sessão, verificação de contato, preferências; CPF e outros identificadores sensíveis separados/protegidos caso necessários.
- `customer_tenant_memberships`: `customer_identity_id`, `tenant_id`, `tenant_customer_id`, status, escopos, consentimentos, origem e trilha de auditoria.
- `customer_resource_grants`: permissões explícitas por projeto, contrato, compra, mensagem, cotação e fornecedor; nunca inferir pelo e-mail sozinho.
- `customer_inbox_events`: destinatário global, tenant remetente, tipo, recurso, estado de leitura e política de divulgação.
- Cotações: identificadores públicos opacos distintos dos IDs internos; tabela de dois aceites e data/evento de liberação de identidade; logs imutáveis quando possível.

## Migração segura de identidades
1. Inventariar contas e e-mails repetidos por tenant, hashes/sessões e políticas existentes.
2. Desenhar migração aditiva (sem `DROP` ou merge cego); manter logins atuais enquanto vínculo global não for confirmado.
3. Vincular contas por convite/verificação segura com participação do cliente; **não unir cadastros somente por coincidência de e-mail, nome ou telefone**.
4. Introduzir APIs globais do portal e sessões de cliente com escopos apropriados, mantendo autorização de tenant e recurso no backend.
5. Migrar funcionalidades por flags/piloto; testar contas de múltiplos tenants e tentativas de leitura cruzada antes de habilitar.
6. Integrar Praça.ai no contexto de comprador (sem assumir papel de lojista) e separar consentimento de mensagens transacionais e comerciais.
7. Medir regressões, testar rollback de código sem excluir dados, só então publicar.

## Critérios de aceite
- Um cliente autenticado visualiza apenas seus vínculos, compra de mais de um parceiro e acessa Praça.ai sem novo login.
- Tenant A não consegue consultar projetos, contatos, mensagens ou pedidos do vínculo com Tenant B.
- Cotação não expõe cliente, tenant solicitante nem prestador antes da seleção + aceite mútuo.
- Cliente acessa ARQDOR via portal existente; profissional mantém a tela aprovada do Studio.
- Não há menu, ação, Vendi ou informação redundante.
- Integração financeira não simula saldo, retenção, confirmação nem repasse sem evento financeiro real.

## Escopo desta entrega
**Somente documento e auditoria estática inicial.** Não aplicou migration, criou login, alterou permissões, publicou interfaces ou mexeu na produção.
