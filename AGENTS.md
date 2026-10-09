# AGENTS.md — Regras globais de execução Vendor.ai e Arqdor

Vigência: 2026-10-09. Escopo: **todos os lotes presentes e futuros**, em todos os módulos e branches, inclusive CRM, Arqdor, render, BIM, obras, omnichannel, IA, marketing, administração e infraestrutura.

## Autorização e continuidade
- Depois que o solicitante autorizar um lote ou conjunto de melhorias, executar **todas as etapas cabíveis ao escopo autorizado em uma mesma execução** sem pedir repetidamente "segue", "faz" ou "posso continuar?".
- Encadear diagnóstico, implementação, correções relacionadas, testes, revisão de impactos, commits e atualização do registro mestre; fazer perguntas somente diante de decisões materiais não resolvidas ou bloqueios reais.
- Não encerrar após correção isolada quando ainda houver tarefas autorizadas e executáveis no mesmo lote. Se houver limitação da sessão/ferramenta, declarar exatamente o que ficou pendente, sem fingir execução em segundo plano.
- Cada lote e cada agente conserva seu escopo; não misturar CRM, Arqdor e infraestrutura sem necessidade. Trabalho paralelo exige branches isoladas e prevenção de conflitos.
- A regra vale automaticamente para novos lotes, sem nova adesão manual.

## Segurança e publicação
- Trabalhar pelo Git, não pelo Replit. Não contratar serviços pagos sem alinhamento.
- Produção imutável até promoção conforme o processo de releases previamente aprovado. Não fazer merge/deploy automaticamente por push na main; preservar dev, homologação, versões e rollback.
- Testar com as validações pertinentes e documentar resultados reais; builds não executados ou falhos **não** significam aprovação.
- Não interferir com outros agentes ou fluxos ativos. Não usar Tinyfish.

## Registro mestre obrigatório por lote
Manter arquivo rastreável em `docs/entregas/`, contendo pelo menos:
- identificador do lote, nome e versão;
- objetivo, escopo autorizado e itens concluídos/pendentes;
- branch, commits, PRs e arquivos alterados;
- impacto e dependências entre módulos/lotes;
- testes/checks/build (com resultado e evidência ou pendência);
- homologação, aprovação e situação de merge/deploy/produção;
- bloqueios reais, responsável e próximo passo;
- data de atualização.

Estados separados: planejado, em implementação, implementado sem validação, validado tecnicamente, homologado, aprovado e publicado. Nunca apresentar um estado posterior sem evidência.

## Comunicação
- Entregar relatório consolidado por lote ou marco significativo, em vez de interromper a cada pequeno commit.
- Informar precisamente: **lote, versão, commits/PR, resultado validado e o que falta**.
- Evitar solicitar ao usuário decisões já tomadas; links diretos para os artefatos e PRs sempre que possível.
- Não dizer que está trabalhando em background depois do término da interação; para recorrência fora da sessão, é necessária automação própria.
