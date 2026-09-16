# ARQDOR — Contrato persistente de versão de render

Este documento define o contrato oficial para consolidar o Render Studio sem criar uma segunda fonte de verdade.

## Fonte oficial

`arch_ai_renders` é a fonte oficial de cada versão de render.

Cada registro representa uma versão imutável e deve ser ligado ao projeto e, quando aplicável, à versão pai.

Campos oficiais do histórico:

- `id`
- `tenantId`
- `projectId`
- `parentRenderId`
- `mode`
- `ambiente`
- `operationType`
- `materialId`
- `materialName`
- `selectionMetadata`
- `originalImageUrl`
- `resultImageUrl`
- `maskZones`
- `prompt`
- `motor`
- `costEstimateUsd`
- `status`
- `versionTag`
- `approvedBy`
- `approvedAt`
- `approvalNote`
- `createdAt`
- `concluidoEm`

## Operações de versão

`operationType` deve identificar por que a versão nasceu:

- `initial` — render inicial;
- `material` — troca/aplicação de material;
- `lighting` — ajuste de iluminação;
- `improve` — melhoria geral ou pontual;
- `approved` — compatibilidade de leitura para versões antigas; a aprovação oficial é definida por `approvedBy` + `approvedAt`.

## Material e seleção

Quando uma alteração vier do catálogo, `materialId` e `materialName` devem permanecer associados à versão gerada. O material não pode existir apenas no estado React/sessionStorage.

`selectionMetadata` registra as regiões efetivamente selecionadas no canvas (`x`, `y`, `w`, `h`, `label`) para permitir auditoria, comparação e futura reexecução da alteração.

## Aprovação

A aprovação é persistente e auditável:

- `approvedBy` deve vir do usuário autenticado;
- `approvedAt` registra o timestamp do backend;
- `approvalNote` guarda a observação da aprovação;
- uma versão aprovada nunca é sobrescrita; qualquer mudança gera uma nova versão filha.

## Custo

`costEstimateUsd` registra o custo estimado da geração quando o provedor/motor permitir mensuração. O campo permanece nullable para execuções antigas ou motores sem medição disponível.

## Regra de evolução

O backend é a fonte oficial. `sessionStorage` pode ser usado somente como cache/recovery temporário e jamais como origem definitiva do histórico.

Não criar tabela paralela de versões.

## Fluxo oficial

Projeto → Ambiente → Render V1 → Ajuste V2/V3/Vn → Aprovação → Especificação → Orçamento.

- toda alteração cria um novo registro filho;
- nenhuma versão aprovada é sobrescrita;
- catálogo/material selecionado permanece associado à versão que o utilizou;
- especificação aponta para o render aprovado;
- orçamento deriva da especificação, não do estado local do Studio.

## Estado atual confirmado

- catálogo real já é consumido via `/api/arch/catalogo`;
- seleção de material já é enviada para o fluxo de melhoria no frontend;
- existe sincronização posterior com item da especificação quando possível;
- especificação já possui ponte para orçamento;
- endpoint persistente de histórico por projeto foi criado no PR #1528;
- schema/migração para metadados persistentes de versão foram adicionados no PR #1528;
- o próximo passo é fazer os endpoints de geração/ajuste preencherem esses campos e conectar o `RenderStudioPage` ao hook persistente.

Relacionado: #1526, #1528.
