# Agente de Valor + Captação — padrão oficial do App Builder

Todo app criado pelo Arquiteto IA deve incluir `definition.valueAgent`.

## Princípio
O agente precisa entregar valor real antes de pedir os dados do lead. A jornada padrão é:

`VALOR ÚTIL -> EXPLICAÇÃO/RESULTADO -> IDENTIFICAÇÃO DA NECESSIDADE -> TRIAGEM DINÂMICA -> QUALIFICAÇÃO -> CAPTURA CONSENTIDA -> CRM -> AGENDAMENTO/HANDOFF`

## Estrutura mínima
- `enabled`: ativo por padrão.
- `name`: identidade especializada no segmento.
- `promise`: promessa objetiva de valor pré-lead.
- `preLeadServices`: serviços úteis gratuitos ou de pré-análise.
- `publicDataSources`: fontes/integrações e sua disponibilidade (`registry`, `gap`, `unknown`).
- `intakeQuestions`: perguntas mínimas adaptativas.
- `qualification`: sinais, scores e roteamento.
- `handoff`: gatilhos, destino humano e SLA quando aplicável.
- `crm`: criação do lead, pipeline, campos e artefatos salvos.
- `safeguards`: limites profissionais, regulatórios e de privacidade.
- `missingCapabilities`: capacidades ainda não disponíveis.

## Regra contra alucinação operacional
Uma fonte ou integração só pode ser marcada como `registry` se estiver disponível nos registries do App Builder. Caso contrário deve aparecer como `gap` e também como gap da proposta.

## Áreas reguladas
O agente pode informar, consultar fontes permitidas, organizar documentos, fazer pré-análise e qualificar. Não deve se apresentar como profissional habilitado nem produzir decisão profissional conclusiva quando isso exigir intervenção humana.

### Exemplo jurídico
Um app jurídico pode sugerir consulta/explicação de andamento processual ou legislação pública. Se a consulta judicial oficial não estiver integrada, a IA deve marcar a integração como gap, nunca simular que realizou a consulta.

## Gate de versionamento
A interface do Arquiteto IA bloqueia a aplicação da versão quando não houver, no mínimo: nome do agente, promessa de valor, serviço pré-lead e handoff. A publicação continua seguindo o fluxo normal de revisão humana e versionamento do App Builder.
