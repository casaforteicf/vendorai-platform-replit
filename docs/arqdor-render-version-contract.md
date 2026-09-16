# ARQDOR — Contrato persistente de versão de render

Este documento define o contrato oficial para consolidar o Render Studio sem criar uma segunda fonte de verdade.

## Fonte oficial

`arch_ai_renders` é a fonte oficial de cada versão de render.

Cada registro representa uma versão imutável e deve ser ligado ao projeto e, quando aplicável, à versão pai.

Campos oficiais do fluxo:

- `id`
- `tenantId`
- `projectId`
- `parentRenderId`
- `mode`
- `ambiente`
- `originalImageUrl`
- `resultImageUrl`
- `maskZones`
- `prompt`
- `motor`
- `status`
- `versionTag`
- `operationType`
- `materialId`
- `materialName`
- `selectionMetadata`
- `costEstimateUsd`
- `approvalNote`
- `approvedBy`
- `approvedAt`
- `createdAt`
- `concluidoEm`

## Regra do navegador

`sessionStorage` e `localStorage` não podem ser fonte oficial de versões. Eles podem ser usados apenas para cache/recovery temporário quando:

- a API ainda não respondeu;
- um job foi interrompido durante geração;
- a sessão caiu antes de o backend devolver o histórico.

Se o backend devolver uma ou mais versões, elas sempre vencem qualquer cache local.

## Adaptador do Render Studio

`renderStudioPersistentAdapter.ts` é a ponte entre o DTO persistente e o modelo já consumido pela tela atual.

Responsabilidades do adaptador:

- mapear versão persistida para `RenderStudioVersion`;
- reconstruir o rótulo V1/V2/V3 a partir de `versionNumber` e `operationType`;
- manter mais recente primeiro apenas na apresentação;
- converter `selectionMetadata[]` em rótulo de seleção quando necessário;
- converter `costEstimateUsd` para número de forma segura;
- localizar a versão aprovada;
- aplicar cache local somente quando o backend ainda não possui histórico.

Isso permite conectar a tela sem reescrever o Render Studio inteiro.

## Regra de evolução

Os endpoints de geração e ajuste devem preencher os metadados persistentes no momento da criação da versão. A aprovação deve persistir a observação no mesmo registro aprovado.

Não criar tabela paralela de versões.

## Fluxo oficial

Projeto → Ambiente → Render V1 → Ajuste V2/V3/Vn → Aprovação → Especificação → Orçamento.

- toda alteração cria um novo registro filho;
- nenhuma versão aprovada é sobrescrita;
- catálogo/material selecionado deve permanecer associado à versão que o utilizou;
- especificação deve apontar para o render aprovado;
- orçamento deve derivar da especificação, não do estado local do Studio.

## Estado atual confirmado

- catálogo real já é consumido via `/api/arch/catalogo`;
- seleção de material já é enviada para o fluxo de melhoria no frontend;
- existe sincronização posterior com item da especificação quando possível;
- especificação já possui ponte para orçamento;
- histórico persistente está sendo consolidado no PR #1528;
- hook `usePersistentRenderHistory` já lê material/operação/seleção/custo/aprovação;
- adaptador `renderStudioPersistentAdapter.ts` já converte histórico persistente para o modelo atual da tela e mantém cache apenas como recuperação.

Relacionado: #1526, #1528.
