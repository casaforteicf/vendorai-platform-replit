# UX-E2E-01 — Auditoria de efetividade funcional por ação

Data: 2026-10-20. Estado: plano de auditoria e evidências iniciais. Nenhum teste autenticado de produção foi concluído.

## Definição de aprovação
A ação só é considerada ENTREGUE quando: (1) há acesso autorizado, (2) o clique dispara handler e API reais, (3) a operação produz o resultado do requisito, (4) há persistência e reabertura, (5) os vínculos downstream e permissões continuam corretos, (6) há evidência da versão publicada/tenant e teste mobile/desktop. Uma resposta HTTP 200 isolada não prova entrega.

## Campos de rastreabilidade por ação
actionId | intenção | tela/rota | botão ou comando | entrada e pré-condições | handler/frontend | endpoint/backend | tabelas/eventos | efeitos no módulo destino | saída esperada | status de resposta | evidência de persistência | autorização/tenant | desktop/mobile | SHA deployed | evidência | classificação | issue/pr.

Classificações: aprovado E2E; código com integração não testada; simulado; parcialmente funcional; erro reproduzido; inacessível/oculto; restrito corretamente; bloqueado por ambiente.

## Jornadas obrigatórias (executar em tenant autorizado com dados de teste)
| Jornada | Resultado esperado |
|---|---|
| Login/tenant | Sessão e escopo preservados, isolamento entre empresas |
| Lead/criação | Criar, editar, reabrir, responsável, histórico, contatos PF/PJ |
| Prospector | Buscar empresas reais, abrir detalhes e converter sem registros duplicados |
| Pipeline | Consultar, criar e editar etapas mantendo estágios, negócios e regras |
| Proposta | Compôr produtos/serviços, versões, PDF, cronograma e vínculos |
| Contrato | Gerar a partir de proposta e vincular aceite e histórico |
| Fechamento → Operações | Enviar itens/fases corretos, criar tarefas e responsáveis conforme vertical |
| Operações | Atualizar status, checklist, evidência, cronograma e aceite |
| Portal do Cliente | Token, itens publicados, autorização, comentários e aprovação |
| Biblioteca | Enviar, localizar, reutilizar, compartilhar e manter acesso restrito |
| Marketing | Contexto correto de tenant/campanha/produto, criação, revisão e publicação |
| Omnichannel | Receber/enviar, associar contato e manter histórico |
| Agenda | Tarefa automática/manual com responsável e prazo, sem duplicatas |
| ERP | Pagamentos, parcelas, comissões e conciliação com escopo de privacidade |
| Agentes IA | Acionamento verdadeiro, registro de execução, permissões e custo |
| Arqdor | Salvar/reabrir projeto, medidas, render e especificações sem distorção |
| Praça.ai | Cotação, fornecedor, pedido, entrega, aceite e financeiro vinculados |
| Exportar/Imprimir | Gerar documento completo e baixar/abrir sem erro |
| Busca/global/configuração | Filtrar, salvar configurações, recarregar e verificar permissões |

## Evidência inicial de inspeção estática
- Em adaptiveModuleLauncher.ts, PDV/Parceiros/Portal têm route:null no lançador. Não comprova ausência de implementação fora dele.
- Em TadCentralRoute.tsx, erro na API de módulos/permissões resulta em nenhuma permissão exibida, preservando segurança.
- Em UnifiedAssistantLauncher.tsx, botões legados de JARVIS, Dev IA e Marketing são deliberadamente ocultados e acionados por lançador consolidado; testar acessibilidade e click real.
- Issues abertas pertinentes: #3572 pipeline HTTP 500, #3570 404/500, #3527 representante HTTP 500, #3052 portal único, #3529 navegação, #1764 estabilização.
- Consultas de leitura vendi_contabo_status(status), vendi_contabo_status(prodHealth) e browser_agent_status retornaram erro interno do conector neste ciclo. Não é possível classificar ações da produção como aprovadas ou defeituosas com base nesse erro.

## Plano de execução
Fase 1: restaurar observabilidade/contato com ambiente e confirmar SHA frontend/backend.
Fase 2: inventário automatizado de rotas, botões e handlers, com deduplicação semântica.
Fase 3: testes E2E autenticados com rastreamento frontend→API→banco→evento/documento/portal; registrar sucesso e falha.
Fase 4: corrigir P0 e consolidar ações com adaptadores sem remover serviços antigos.
Fase 5: regressão multi-tenant, mobile, permissões, acessibilidade, rollback e evidência de versão ativa.

## Regra de publicação
Não aplicar alterações em produção sem gates, autorização e comprovação da versão. Nenhuma ação deve ser marcada como entregue somente porque existe no código ou porque o botão é visível.
