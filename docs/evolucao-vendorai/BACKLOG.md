# Backlog mestre — propostas em triagem

> Estes itens ainda não foram homologados um por um. Confirmar estado no código e nas telas antes de abrir implementação. Prioridade P0 = integridade, segurança ou fluxo crítico comprovadamente bloqueado; P1 = operação essencial; P2 = expansão.

| Área | Itens a auditar e detalhar | Primeiro critério de aceite |
|---|---|---|
| Plataforma | Hub por módulo, navegação contextual, SSO, personalização por tenant, Superadmin, notificações | Troca de módulo funcional, permissões e experiência mobile |
| CRM | Criar lead, converter em negócio, estágio/atividades, perguntas, editar pipeline, integração com comunicação | Fluxo lead→negócio→proposta com persistência e auditoria |
| Vendi | MCP OAuth, missão persistida, operador, autorização, orquestração IA, PR→CI→homologação→deploy | Missão piloto completa, evidências e rollback acessível |
| Arqdor | Planta 2D/3D paramétrica, medidas, aberturas, renders, biblioteca, especificações, quantitativos, anexos | Projeto→especificação→orçamento, sem perda de dados |
| Praça.ai | Vitrine, cotações, rodadas, NSU, pedidos, frete, retenção, comissão, integração com CRM | Transação de teste com regra comercial e auditoria |
| ERP | Catálogo universal, orçamento, custos, estoque, comissões, caixa, recebimentos | Proposta→contrato→financeiro com consistência |
| Obras | Transferência do fechamento, diário, cronograma físico-financeiro, medição, aceite | Medição validada refletida corretamente no financeiro |
| Marketing | Prospector, campanhas, funis, OAuth e-mail, canais, consentimento | Origem do lead atribuída e jornada rastreável |
| Agenda/Suporte | Agenda integrada, SLA, chamados, portal, garantia, pós-venda | Solicitação→atendimento→resolução com rastreabilidade |
| SaaS | Planos, Vendor Credits, comissões, assinaturas, faturamento e retenção | Cobrança e consumo auditáveis por tenant |
| Agência | Sites, apps, ebooks, projetos de terceiros, templates, CI/CD | Projeto piloto com entrega validada |
| Infra | CI vermelho, Cloudflare 401, migrations, RLS, MCPs paralelos, armazenamento | Gates aprovados, acesso correto e deploy seguro |

## Regra de decisão
As regras comerciais, a arquitetura de dados e a experiência visual exigem revisão antes da implementação quando representarem mudança material. Correções claramente delimitadas podem ser propostas em PR sem mudar produtos e sem publicação irrestrita.
