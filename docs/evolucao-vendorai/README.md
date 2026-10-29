# Programa de Evolução Vendor.ai

**Status:** documentação inicial, em revisão. **Sem cronograma de entrega.**

## Objetivo
Consolidar melhorias funcionais, técnicas, visuais e comerciais do ecossistema Vendor.ai, preservando o que existe, com decisões registradas antes de mudanças significativas.

## Método de execução
1. Auditar implementação real (código, banco, telas, logs e permissões).
2. Elaborar especificação por funcionalidade, com fluxos, campos, botões, integrações, atuação da IA e critérios de aceite.
3. Anexar referências visuais e alternativas; discutir regras de produto ainda não definidas.
4. Registrar decisão aprovada e abrir Issue de implementação ligada à especificação.
5. Implementar em branch/PR; executar lint, typecheck, testes de unidade, integração, isolamento de tenants e jornada visual.
6. Homologar com evidências; promover a produção apenas com controles de segurança, backup, healthcheck e rollback.
7. Atualizar status de tarefas a partir de evidências verificáveis. Nunca declarar publicação a partir de intenção ou do PR isoladamente.

## Papéis
- Decisões de produto e regras comerciais: titular do produto.
- Especificação, auditoria e acompanhamento: ChatGPT e ferramentas conectadas.
- Desenvolvimento/testes: Vendi ou implementador autorizado, quando demonstrada capacidade e permissão.
- GitHub: documentação, Issues, PRs e histórico; não substitui testes operacionais.

## Fontes de verdade
- Código e histórico de PRs: repositório GitHub.
- Estrutura de dados: migrations **e** introspecção do PostgreSQL real.
- Operação: logs, métricas, resultados de testes e healthchecks.
- Regras aprovadas: fichas/decisões versionadas neste diretório.

## Áreas
1. Plataforma central, Hub, Superadmin e personalização por tenant.
2. CRM Hub e Customer Intelligence.
3. Vendi, MCP, AI Hub, missões e agentes.
4. Arqdor Studio, Measure e documentação de projetos.
5. Praça.ai, rodadas de negócios e pagamentos.
6. ERP, catálogo, orçamentos, contratos, estoque e financeiro.
7. Obras, medições, cronograma e aceite.
8. Marketing, Prospector, Omnichannel e atribuição.
9. Agenda, Suporte, Portal e Pós-venda.
10. Monetização SaaS, Vendor Credits, comissões.
11. Agência de desenvolvimento de sites/apps/livros.
12. Segurança, infraestrutura, migrations, CI/CD, observabilidade e backups.

## Estados padronizados
**Não auditado** → **Em auditoria** → **Em discussão** → **Aprovado para implementação** → **Em desenvolvimento** → **Em teste** → **Homologado** → **Publicado e verificado**.
Estados complementares: **Bloqueado** e **Descartado** (registrar motivo). Não tratar 'documentado' como 'implementado'.

## Critério mínimo para qualquer entrega
Issue + PR + evidência de testes + validação de autorização/tenant + impacto em banco + registro de versão + prova do resultado. Mudanças sem efeito em produção podem encerrar como 'documentação aprovada'.

## Documentos
- [Backlog consolidado](BACKLOG.md)
- [Pendências de operação](OPERACAO-ATUAL.md)
- [Ficha-padrão](MODELO-FICHA.md)
