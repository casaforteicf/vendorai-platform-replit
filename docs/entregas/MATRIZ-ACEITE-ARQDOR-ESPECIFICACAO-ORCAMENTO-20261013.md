# Matriz de aceite — ESPECIFICACAO ORCAMENTO (F06)

Data 13/10/2026. Base: `docs/arqdor-studio-2-functional-audit.md` e design system na `main`; requisitos aprovados do ecossistema. **Inventário de aceite proposto, não auditoria de implementação ou homologação.** Responsável a designar; percentuais não apurados.

| ID | Requisito | Teste objetivo exigido | Estado | Prioridade |
|---|---|---|---|---|
| F06-L01-R01 | Fonte única BIM | Especificar por projeto, ambiente, elemento e revisão | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R02 | Quantitativos arquitetônicos | Calcular paredes, pisos, revestimentos, forros, esquadrias e demais categorias sem dupla contagem | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R03 | Quantitativos MEP | Consolidar instalações por redes e pontos com rastreabilidade | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R04 | Biblioteca de materiais | Distinguir texturas/modelos de itens comerciais e fornecedores | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R05 | Composições e pacotes | Montar serviços, produtos, fases, opcionais e recorrência | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R06 | Preços, custos e margens | Controlar unidade, versão, impostos e privilégios | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R07 | Orçamento versionado | Gerar R1/R2 com diferenças e histórico imutável | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R08 | Invalidação por revisão BIM | Mudança geométrica sinaliza orçamento/RFQ desatualizado sem mutação silenciosa | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R09 | Cronograma físico-financeiro | Distribuir fases, quantidades, pagamentos e responsáveis | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R10 | Cotação marketplace/RFQ | Enviar itens autorizados a fornecedores com rastreio e comparativo | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R11 | Propostas e documentos | Gerar versão aprovada em PDF e trilha de alterações | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R12 | Envio para execução parcial | Transferir itens/ambientes/fases sem perder saldo do orçamento | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R13 | Smart Specification Android | Testar 360/390/412px, seleção de projeto e componentes reais | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R14 | Permissões multi-tenant | Impedir acesso, preço e edição sem autorização | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R15 | Conferência reproduzível | Mesmo BIM/revisão produz mesmos quantitativos com critérios explícitos | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F06-L01-R16 | Homologação E2E | Projeto→especificação→orçamento→revisão→proposta→execução com SHA e trace | NÃO VERIFICADO EM CÓDIGO/QA | P1 |

## Evidência exigida

SHA do código/teste, arquivo e rota reais, usuário/tenant, revisão BIM, entradas/saídas, logs, screenshot ou trace Playwright e conclusão observável. Não converter ausência de evidência em ausência de código. Nenhuma funcionalidade pode ser declarada pronta apenas por existir documentação ou UI. Desativar por flag as partes não homologadas; não efetuar merge/publicação desta matriz sem revisão.
