# VENDI-MISSION-INTEGRITY — 2026-10-21

Branch: fix/vendi-mission-completeness-20261021. Base: main cb9e99c.

## Problema e comportamento
A adaptação do plano substituía todas as etapas restantes e podia omitir a consulta de atividades. A conclusão não exigia resultados para cada passo. A triagem de tarefas vencidas podia propor mensagens a clientes.

Alterações: preservar os passos pendentes por ferramenta e parâmetros, mantendo multiplicidade; preservar critérios iniciais; recuperar resultados anteriores na retomada; exigir resultado bem-sucedido para cada passo do plano final; restringir o observador operacional a ferramentas de leitura no planejamento e na execução, inclusive em missões antigas aprovadas; avisos WhatsApp de aprovação somente com VENDI_APPROVAL_WHATSAPP_ENABLED=true. Falhas de ferramentas com escrita ou efeitos externos não geram repetição automática. Evidências de listas informam limite e countIsTotal=false.

## Validação e limites
- 5 testes Node passaram: regressão de etapa omitida, parâmetros, multiplicidade, restrição do observador e conclusão incompleta.
- Transpilação sintática dos quatro módulos alterados passou. git diff --check passou.
- Typecheck completo, build e testes integrados NÃO executados. Dependências da API indisponíveis neste checkout.
- Não equivale à verificação semântica de todos os critérios em linguagem natural. Não acrescenta totais globais nem relatório narrativo final.
- O código da main contém diferenças em relação à cópia extraída do container. Não copiar esses arquivos diretamente em produção; aplicar via Git e release homologada, conciliando o lote VENDI-3580 em andamento.
- Homologação Contabo, teste real CRM e promoção: pendentes. Nenhum container, banco ou canal de comunicação foi alterado.
- Próximo passo: build e validação em ambiente isolado Contabo; repetir a missão de leads, negócios e atividades e conferir os três resultados; verificar que a triagem não pede envios; testar pausa/retomada e falha de ferramenta sem repetir escrita.

Estado: implementado com testes focados locais; não homologado e não publicado.

## Conciliação com produção VENDI-3580
A captura do operador confirmou publicação de VENDI-3580, SHA 730c99b3dca0ee5b1dc0a338d8b2d80d7b66f119. Esta branch incorpora suas mudanças (fila, contexto transacional do tenant e diagnóstico de banco), resolvendo conflitos no supervisor sem removê-las. Dockerfile.deploy passa a executar os testes de integridade antes da instalação/typecheck/build. Build isolado da versão anterior 9845031 foi iniciado, mas não autoriza promoção: a versão conciliada precisa de novo build e homologação.
