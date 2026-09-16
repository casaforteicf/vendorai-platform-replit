# ARQDOR — Contrato persistente de versão de render

Este documento define o contrato oficial para consolidar o Render Studio sem criar uma segunda fonte de verdade.

## Fonte oficial

`arch_ai_renders` é a fonte oficial de cada versão de render.

Cada registro representa uma versão imutável e deve ser ligado ao projeto e, quando aplicável, à versão pai.

Campos já existentes e obrigatórios no fluxo:

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
- `approvedBy`
- `approvedAt`
- `createdAt`
- `concluidoEm`

## Metadados ainda não persistidos

O frontend hoje mantém parte dos dados de versão apenas em memória/sessionStorage:

- tipo da operação (`initial`, `material`, `lighting`, `improve`, `approved`)
- `materialId`
- `materialName`
- rótulo da seleção/região
- observação de aprovação
- custo da geração

Esses dados NÃO devem continuar tendo o navegador como fonte oficial.

## Regra de evolução

Antes de remover `sessionStorage` como fallback, o backend deve persistir os metadados acima de forma compatível e migrável. Não criar tabela paralela de versões.

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
- histórico persistente está sendo consolidado no PR #1528.

Relacionado: #1526, #1528.
