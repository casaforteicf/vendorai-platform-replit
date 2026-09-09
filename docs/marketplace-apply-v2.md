# Marketplace Apply V2

Objetivo: alinhar o que a UI promete com o que o backend realmente instala.

## Regras
- Template comum não altera `tenant.vertical` nem `business_profile.vertical`.
- Módulo vertical pode alterar a vertical explicitamente.
- Template vazio/incompleto não pode ser aplicado.
- Aplicação deve informar contagens reais de agentes, funil e categorias.
- Categorias sugeridas devem ser aplicadas sem duplicação.
- Funil existente não pode ser ignorado silenciosamente; por padrão, criar um novo funil do template quando ainda não existir um funil com o mesmo nome.
- Agentes existentes são preservados; prompts só preenchem lacunas.

## Contrato esperado
Resposta do endpoint de apply deve retornar:
- `agentConfigUpdated`
- `promptsApplied`
- `funilCreated`
- `funilSkipped`
- `categoriesCreated`
- `categoriesSkipped`
- `businessProfileUpdated`
- `tenantVerticalUpdated`
