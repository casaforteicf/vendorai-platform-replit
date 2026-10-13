# Matriz de aceite — MOBILIARIO (F05)

Data 13/10/2026. Base: `docs/arqdor-studio-2-functional-audit.md` e design system na `main`; requisitos aprovados do ecossistema. **Inventário de aceite proposto, não auditoria de implementação ou homologação.** Responsável a designar; percentuais não apurados.

| ID | Requisito | Teste objetivo exigido | Estado | Prioridade |
|---|---|---|---|---|
| F05-L01-R01 | Catálogo paramétrico | Criar módulos com largura, altura, profundidade e unidades | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R02 | Componentes internos | Inserir portas, gavetas, divisórias, prateleiras e regras dimensionais | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R03 | Ferragens e materiais | Selecionar peças e materiais com referências persistentes | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R04 | Validação de medidas | Rejeitar configurações impossíveis, tolerâncias e colisões | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R05 | Inserção no BIM | Vincular objeto a ambiente e revisão preservando posição | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R06 | Edição 2D/3D sincronizada | Alterar dimensões e conferir geometria nas duas vistas | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R07 | Integração Measure | Usar cotas verificadas e sinalizar discrepâncias | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R08 | Biblioteca universal | Salvar modelos reutilizáveis com origem, direitos e versões | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R09 | Quantitativos e lista de peças | Gerar peças/ferragens reproduzíveis por revisão | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R10 | Orçamento de mobiliário | Atualizar composições sem duplicar itens nem perder revisões aprovadas | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R11 | Exportação para fabricação | Validar formato suportado e medidas resultantes, sem prometer CNC não implementado | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R12 | Revisões e histórico | Retomar modelo e versões sem alterar contratos anteriores | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R13 | Acesso e multi-tenant | Testar permissões e isolamento por empresa | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F05-L01-R14 | QA visual e E2E | Executar catálogo→inserção→edição→lista de peças→orçamento→reabrir | NÃO VERIFICADO EM CÓDIGO/QA | P1 |

## Evidência exigida

SHA do código/teste, arquivo e rota reais, usuário/tenant, revisão BIM, entradas/saídas, logs, screenshot ou trace Playwright e conclusão observável. Não converter ausência de evidência em ausência de código. Nenhuma funcionalidade pode ser declarada pronta apenas por existir documentação ou UI. Desativar por flag as partes não homologadas; não efetuar merge/publicação desta matriz sem revisão.
