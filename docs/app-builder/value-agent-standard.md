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

## Relação com App Product, App Admin e VendorAI SaaS
O agente pertence ao App Product quando faz parte da experiência que foi vendida ao cliente. Sua configuração operacional básica pode ser administrada no App Admin. CRM avançado, automações, campanhas, inteligência, atribuição, scoring avançado e orquestração entre canais podem ser ampliados pelo VendorAI SaaS.

A ausência da assinatura SaaS não pode retirar do App Product a função essencial que justificou sua venda. O SaaS amplia gestão e inteligência; ele não transforma um app incompleto em produto funcional.

## Regra contra alucinação operacional
Uma fonte ou integração só pode ser marcada como `registry` se estiver disponível nos registries do App Builder. Caso contrário deve aparecer como `gap` e também como gap da proposta.

## Áreas reguladas
O agente pode informar, consultar fontes permitidas, organizar documentos, fazer pré-análise e qualificar. Não deve se apresentar como profissional habilitado nem produzir decisão profissional conclusiva quando isso exigir intervenção humana.

### Exemplo jurídico
Um app jurídico pode sugerir consulta/explicação de andamento processual ou legislação pública. Se a consulta judicial oficial não estiver integrada, a IA deve marcar a integração como gap, nunca simular que realizou a consulta.

## Gate de versionamento
A interface do Arquiteto IA bloqueia a aplicação da versão quando não houver, no mínimo: nome do agente, promessa de valor, serviço pré-lead e handoff. A mesma interface também exige a separação mínima entre App Product, App Admin e VendorAI SaaS antes de permitir versionamento. A publicação continua seguindo o fluxo normal de revisão humana do App Builder.