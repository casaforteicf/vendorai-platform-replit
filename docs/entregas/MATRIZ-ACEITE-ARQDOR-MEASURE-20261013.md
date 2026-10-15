# Matriz de aceite — MEASURE (F04)

Data 13/10/2026. Base: `docs/arqdor-studio-2-functional-audit.md` e design system na `main`; requisitos aprovados do ecossistema. **Inventário de aceite proposto, não auditoria de implementação ou homologação.** Responsável a designar; percentuais não apurados.

| ID | Requisito | Teste objetivo exigido | Estado | Prioridade |
|---|---|---|---|---|
| F04-L01-R01 | Foto com cotas manuais verificadas | Criar anotações dimensionais, unidades e evidência; salvar e reabrir | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R02 | Paredes, portas e janelas | Registrar tipologia, medidas e posição por ambiente | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R03 | Instalações, obstáculos e acabamentos | Registrar pontos e interferências com foto e revisão | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R04 | Conferência com projeto BIM | Vincular medições à revisão do projeto sem modificar geometria automaticamente | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R05 | Desvios e tolerâncias | Calcular diferença projeto×obra com precisão e alerta rastreável | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R06 | Importação de projeto e calibração | Verificar proveniência, escala, unidades e origem antes de usar dimensões | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R07 | Histórico, autoria e revisões | Editar sem perder snapshots e quem mediu/aprovou | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R08 | Pré-projeto derivado de medições | Gerar proposta revisável preservando valores medidos | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R09 | Integração orçamento e execução | Enviar quantitativos medidos com vínculo à revisão | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R10 | Offline e sincronização | Criar medições offline, recuperar rede e resolver conflito | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R11 | Concorrência multiaba | Simular duas abas alterando a mesma medida sem perda silenciosa | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R12 | Permissões por tenant | Verificar isolamento de fotos, medidas e projetos | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R13 | UI Studio 2.0 touch | Validar anotação/cotas em dispositivos desktop e Android | NÃO VERIFICADO EM CÓDIGO/QA | P1 |
| F04-L01-R14 | E2E e homologação | Executar foto→cota→comparação→salvar→reabrir e registrar trace/ambiente/SHA | NÃO VERIFICADO EM CÓDIGO/QA | P1 |

## Evidência exigida

SHA do código/teste, arquivo e rota reais, usuário/tenant, revisão BIM, entradas/saídas, logs, screenshot ou trace Playwright e conclusão observável. Não converter ausência de evidência em ausência de código. Nenhuma funcionalidade pode ser declarada pronta apenas por existir documentação ou UI. Desativar por flag as partes não homologadas; não efetuar merge/publicação desta matriz sem revisão.
