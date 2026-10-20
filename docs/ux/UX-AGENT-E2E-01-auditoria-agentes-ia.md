# UX-AGENT-E2E-01 — Auditoria de agentes e IA em produção

Data: 2026-10-20. Documento de especificação/testes. Não comprova homologação e não modifica produção.

## Exigência
Cada agente e cada ação de IA deve demonstrar efeito real e rastreável no processo de negócio, não apenas texto de sucesso, HTTP 200 ou interface de chat.

## Matriz por agente
agentId; papel declarado; trigger/manual/agenda/webhook; tenant e permissões; configuração e modelo; prompt/contexto; ferramentas permitidas; ferramentas efetivamente chamadas; execução externa/BD; artefato ou registro produzido; validação de dados; custo/tokens/créditos e cotas; logs com traceId; casos positivos/negativos; impedimentos; SHA implantado; status comprovado.

## Jornadas obrigatórias
- SDR/Prospector: descobrir fonte comprovável, qualificar corretamente, impedir duplicação, registrar lead e próxima atividade.
- Closer/Comercial: consultar oferta correta, produzir proposta versionada, encaminhar negociação e não alterar preços sem autorização.
- Marketing: recuperar contexto de empresa/produto/campanha corretos; gerar e persistir material revisável; não contaminar tenants.
- Financeiro/Cobrança: reconhecer vencimento real, respeitar aprovação, registrar interação e jamais efetuar pagamento sem autorização.
- Agendamento: verificar responsável, disponibilidade real, confirmar criação e evitar eventos duplicados.
- Suporte/Pós-venda: abrir e acompanhar OS vinculada, gerar evidência e encaminhar atendimentos complexos.
- JARVIS: orquestrar ações entre módulos com entendimento contextual, continuidade, resultados verificáveis e transparência sobre limitações.
- Vendi/operador: diagnosticar, testar, preparar PRs, registrar testes e só executar produção sob gates explícitos; rejeitar instruções não autorizadas.
- Arqdor IA: preservar geometria e projeto-fonte, registrar render, documentos e alterações com rastreabilidade.
- Agentes gestores/automações: provar agendamento, disparo, execução, reexecução idempotente, alertas e histórico.
- Assistentes unificados: launcher visível e funcional no desktop/mobile; diferenciar agentes sem criar motores redundantes.

## Testes transversais
1. Teste positivo completo: pedido -> ferramenta -> efeito real -> consulta persistida -> usuário visualiza.
2. Falha de API e timeout: status honesto, retry seguro, sem sucesso fictício nem ações duplicadas.
3. Permissões: restrições por usuário, perfil, plano, vertical e tenant; impedir leitura/escrita de outro tenant.
4. Grounding: citar o registro-fonte usado, impedir invenção de preços, clientes, estágios e dados.
5. Consistência e regressão: mesmo cenário, variações de linguagem, trocas de contexto, retomada de sessão.
6. Segurança: prompt injection em documentos/mensagens, acessos proibidos, credenciais ocultas, auditoria de ações.
7. Orçamento: registrar tokens/créditos, cota mensal e saldo; monetários exclusivamente a superadmin.
8. Telemetria: request/trace IDs, estado de execução, timestamps e resultado por ação, sem dados sensíveis no relatório.

## Estados possíveis
- E2E aprovado e versionado em produção
- E2E aprovado apenas em ambiente controlado
- Código presente sem validação de execução
- Execução parcial ou resultado de baixa qualidade
- Simulação/mock ou sem integração
- Falha reproduzida
- Bloqueado por infraestrutura/acesso

## Issues a reconciliar
#1089 JARVIS Core, #3434 agentes gestores, #1616 gateway, #3066 contexto Marketing, #2897 Browser Agent, #2896 visibilidade de ações, #1764 regressão, #3570 integração APIs. Não recriar problemas fechados ou supor status de produção sem evidência.

## Evidência deste ciclo
Consultas de status de produção e Browser Agent pelo conector Contabo retornaram erro interno. Nenhuma jornada de IA em produção foi validada nesta sessão.

## Gates para implementação
Primeiro conectar observabilidade e confirmar SHA. Depois executar cenários seguros em tenant autorizado com dados de teste. Não disparar mensagens reais, alterar clientes, criar cobranças ou publicar sem autorização e isolamento. Publicação somente após validações, rollback e testes de integração.
