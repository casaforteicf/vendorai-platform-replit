# ARQDOR — Contrato persistente de versão de render

## Fonte de verdade

`arch_ai_renders` é a fonte oficial do histórico de versões do Render Studio.

Cada nova geração ou ajuste cria um registro novo. Versões anteriores não são sobrescritas.

## Relação entre versões

- `id`: versão atual;
- `parentRenderId`: versão de origem;
- `operationType`: operação que gerou a versão (`initial`, `material`, `lighting`, `improve`, `approved`);
- `materialId` / `materialName`: material aplicado quando houver;
- `selectionMetadata`: região alterada;
- `costEstimateUsd`: custo real quando o provedor disponibilizar;
- `approvedBy`, `approvedAt`, `approvalNote`: governança de aprovação.

## Cache do navegador

`sessionStorage` é apenas cache de recuperação e compatibilidade temporária com o Studio legado. Nunca deve substituir o histórico persistido no backend.

Na abertura ou troca de projeto/ambiente, o backend vence o cache.

## Aprovação persistente

A aprovação pertence à versão persistida, não ao estado React local.

O fluxo consolidado usa `RenderStudioPage.tsx` como entry point de persistência e `RenderStudioCore.tsx` como núcleo funcional. O núcleo deve:

1. identificar a versão aprovada pelo `approvedVersionId` ou por `approvedBy + approvedAt`;
2. preservar autor, data e observação no estado hidratado;
3. impedir que uma versão já aprovada volte a executar a ação de aprovação;
4. direcionar a jornada para `Especificação` quando a etapa recuperada for `Aprovar`;
5. exibir o status persistido de aprovação fora do estado local do Legacy.

A remoção futura do Legacy deve eliminar essa ponte e consumir a aprovação diretamente do modelo persistente.

## Regra de evolução

Não criar uma segunda tabela de versões para o Render Studio. Novos recursos — comparação, aprovação, especificação, Fidelity e custo — devem referenciar o `render_id` oficial ou metadados associados a ele.
