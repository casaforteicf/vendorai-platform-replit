# ARQ-PARAM-23 — quadro de esquadrias

Versão: 2026.10.12.23
Código: 81ffb7b4c24051e014c0c09966aaf165de6a6615
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Quadro derivado de customOpenings na documentação: uma linha por abertura, tipo, ID/parede, piso, largura/altura e peitoril. CSV inclui quantidade 1 por abertura. Dados omitidos recebem defaults explicitamente sinalizados para conferir; órfãos/medidas inválidas permanecem visíveis para correção. CSV UTF-8 BOM, ponto e vírgula, vírgula decimal, escape de aspas e neutralização de fórmulas. Sem alteração do modelo original.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptOpeningSchedule.ts
- artifacts/frontend/src/pages/arch/conceptOpeningSchedule.test.ts
- artifacts/frontend/src/pages/arch/ConceptOpeningSchedule.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalDocumentation.tsx

## Verificação
73 testes locais aprovados em 15 arquivos focados. TypeScript do componente documental e dependências aprovado. Novos testes de medidas autorais/defaults, órfãos/invalidade, exportação/escape e imutabilidade. Sem download real, navegador ou build completo.

## Pendências
Quadro cobre somente aberturas desenhadas, não esquadrias derivadas dos ambientes antigos. Sem produtos/perfis/vidros/fabricantes/preços nem integração de orçamento. Não agrupa tipologias iguais; quantidade por abertura. Quadro não incluído automaticamente no carimbo/prancha SVG. PDF/múltiplas vistas e validação real pendentes. Homologação/publicação Contabo adiadas pelo usuário; sem merge/main/deploy.
