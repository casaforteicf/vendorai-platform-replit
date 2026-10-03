# Casos de regressão do Arquiteto IA

Casos que devem virar testes automatizados quando surgirem falhas reais:

- app válido perde páginas/customizações em modo `revise`;
- segunda passagem reduz segurança ou remove permissões necessárias;
- Action inexistente passa pela validação;
- app pré-tenant recebe recurso operacional/publicação antes do vínculo;
- score alto mesmo com gaps críticos;
- definição visual incompatível com o renderer atual;
- proposta ignora data source já existente e cria gap falso;
- papéis recebem privilégios maiores que o necessário;
- versão criada pela IA altera versão publicada em vez de criar rascunho novo.