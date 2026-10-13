# Arqdor Projeto — execução integrada dos cinco lotes
Data: 2026-10-12. Base: `main`. Branch: `feat/arqdor-projeto-geometria-preflight-20261012`.

## Regra central
O projeto BIM é a fonte única de geometria e revisão. Render, especificação, orçamento, importação e documentação só consomem o mesmo modelo versionado; nenhum módulo deve redesenhar a casa por inferência ou alterar um projeto aprovado sem confirmação. Preservar elementos, abertura, vínculos MEP e revisões.

## Lote 01 — Motor arquitetônico
**Código criado nesta branch:** validação de paredes, encontros, sobreposições, view-model, painel conectado ao ConceptPlanner, regras dimensionais para escada/laje/cobertura. **Não concluir:** junções ainda não recortam volumes; o validador BIM novo não constrói malhas 3D ou cria aberturas; nenhuma função automática de escada/cobertura está conectada ao editor. Gate: resolver tipagem, testes de geometria e casos de portas/janelas; alteração 2D e 3D refletida no mesmo snapshot após reabrir.

## Lote 02 — Editor profissional
Migrar componentes para tokens Studio 2.0 de forma escopada e gradual, restaurar controles responsivos; biblioteca por categorias e propriedades contextuais; seleção de conflitos e realce 2D/3D testados. Gate: QA visual desktop/mobile, navegação sem painéis sobrepostos, atalhos sem eliminar elementos durante desenho.

## Lote 03 — Importação e documentação
Preservar arquivos originais. Preview obrigatório IFC/DXF/fotos/PDF; reconstituir paredes e cotas apenas com proveniência e revisão do usuário; nunca estimar cotas métricas por foto isolada. Gerar pranchas/cortes/fachadas da geometria aprovada e comprovar export/reimport sem perda crítica.

## Lote 04 — Engenharia e orçamento
Instalações MEP com ancoragem e transações; quantificar a partir da revisão geométrica; especificação única por ambiente; preços, versões de orçamento e RFQ invalidados quando a geometria-base mudar. Gate: testes tenant-scoped e conflitos concorrentes; orçamentos reproduzíveis pela mesma revisão.

## Lote 05 — Qualidade/homologação
Executar Vitest dos novos módulos, typecheck direcionado e global com baseline, API/frontend builds, smoke 2D/3D/IFC/PDF e testes no ambiente de homologação. Verificar SHA, backup restaurável, healthchecks e rollback antes de considerar publicação. PR fica Draft até gates cumpridos. **Não usar GitHub Actions como executor obrigatório.**

## Evidência
Novo desenvolvimento neste PR é parcial. Código escrito não significa integração operacional nem publicação. Não promover em produção sem relatório do SHA, testes e homologação.
