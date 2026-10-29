# Matriz executável de aceite — Arqdor Projeto, lotes 01–05

Atualizado: 13/10/2026. **Base documental:** `docs/entregas/ARQDOR-PROJETO-5-LOTES-20261012.md` da branch do PR [#3503](https://github.com/casaforteicf/vendorai-platform-replit/pull/3503), inspecionada em 13/10; histórico de integração [#3507](https://github.com/casaforteicf/vendorai-platform-replit/pull/3507). **Não equivale a teste, homologação ou verificação de produção.**

## Convenções

- ID `F01-Lnn-Rnn`: requisito observável; aceite independente.
- Situações: `CÓDIGO DOCUMENTADO` (apenas no PR), `PARCIAL` (artefatos existem mas requisito sem evidência plena), `NÃO COMPROVADO` (sem prova no escopo examinado), `VALIDADO` (exige logs/testes verificáveis), `HOMOLOGADO` (uso real comprovado), `PUBLICADO` (SHA na produção verificado). Nesta matriz **nenhum item é VALIDADO/HOMOLOGADO/PUBLICADO**.
- Dono operacional: **a designar**, sem presumir que autor de PR é responsável atual.
- Evidência mínima: branch e SHA, teste, entrada, resultado esperado/observado, log/trace/screenshot, ambiente, revisão de projeto, tenant, flag quando aplicável.
- Dependência arquitetural: **BIM versionado único**; Render, Measure e Orçamento consomem, não recriam geometria.
- Criticidade: P1 bloqueia uso conforme aprovado; P2 representa qualidade e acabamento não essencial.

| ID | Requisito / comportamento verificável | Estado da evidência consultada | Aceite objetivo e teste requerido | Vínculo | Prioridade |
|---|---|---|---|---|---|
| F01-L01-R01 | Paredes reais com espessura/altura e IDs estáveis | CÓDIGO DOCUMENTADO | Editar parede; validar cotas e persistência após reabrir, mesmos IDs | #3503 | P1 |
| F01-L01-R02 | Junções entre paredes/recorte de volumes 3D | PARCIAL (diagnóstico sem recorte) | L/T/X sem sobreposição de malhas nem fendas; teste geométrico 3D | #3503 | P1 |
| F01-L01-R03 | Portas e janelas vinculadas à parede, com abertura na malha | NÃO COMPROVADO | Mover/redimensionar abertura e verificar recorte no 2D/3D, salvamento e reabertura | #3503 | P1 |
| F01-L01-R04 | Escadas paramétricas vinculadas a pavimentos | PARCIAL (validação isolada) | Criar/editar escada, níveis e degraus; renderizar malha e reabrir sem perdas | #3503 | P1 |
| F01-L01-R05 | Laje com aberturas para escadas | PARCIAL (validação isolada) | Abrir vão, conferir integridade geométrica e revisão persistida | #3503 | P1 |
| F01-L01-R06 | Cobertura paramétrica conectada à geometria | PARCIAL (validação isolada) | Escolher tipos/inclinações; verificar malha, compatibilidade e persistência | #3503 | P1 |
| F01-L01-R07 | Edição unificada 2D/3D e revisão/snapshot | NÃO COMPROVADO | Editar numa vista, conferir atualização na outra; fechar/reabrir snapshot equivalente | #3503 | P1 |
| F01-L01-R08 | Diagnósticos não destrutivos e destaque do conflito | CÓDIGO DOCUMENTADO | Conflito detectado com explicação, sem mutação silenciosa; reteste em UI | #3503 | P2 |
| F01-L02-R01 | Chrome Studio 2.0 conforme modelo visual aprovado | PARCIAL (tokens e chrome) | Barra grafite, toolbar esquerda, viewport principal, propriedades direita, rodapé de revisões | #3503/#3507 | P1 |
| F01-L02-R02 | Seleção e edição por propriedades contextuais | NÃO COMPROVADO | Seleção consistente 2D/3D; parâmetros alteram BIM e podem desfazer/refazer | #3503 | P1 |
| F01-L02-R03 | Biblioteca por categorias e objetos reutilizáveis | NÃO COMPROVADO | Inserir objeto, editar parâmetro, persistir e reutilizar com vínculo à revisão | #3503 | P1 |
| F01-L02-R04 | Responsividade desktop/touch e atalhos | NÃO COMPROVADO | QA viewport, painéis sem sobreposição; atalhos sem eliminar elementos durante desenho | #3503 | P2 |
| F01-L03-R01 | Importar IFC/DXF com prévia e proveniência | NÃO COMPROVADO | Salvar original, exibir prévia, revisar mapeamento e registrar origem por elemento | #3503 | P1 |
| F01-L03-R02 | Importar foto/PDF sem inventar métricas | NÃO COMPROVADO | Exigir confirmação/referência dimensional; rejeitar inferência métrica sem escala | #3503 | P1 |
| F01-L03-R03 | Gerar cortes/fachadas/pranchas a partir do BIM | NÃO COMPROVADO | Alterar revisão BIM e conferir atualização coerente dos derivados | #3503 | P1 |
| F01-L03-R04 | Roundtrip exportação/reimportação | NÃO COMPROVADO | IFC/DXF conforme suporte implementado, sem perda crítica de elementos/cotas/IDs | #3503 | P1 |
| F01-L04-R01 | MEP ancorado em elementos/projeto com transações | NÃO COMPROVADO | Editar eletro/hidro; checar relações, colisões, concorrência e rollback | #3503/#3426 | P1 |
| F01-L04-R02 | Quantitativos reproduzíveis por revisão BIM | NÃO COMPROVADO | Calcular duas vezes mesma revisão; resultados equivalentes e rastreáveis | #3503 | P1 |
| F01-L04-R03 | Especificação única por ambiente | NÃO COMPROVADO | Alterar material por ambiente, refletir corretamente nos consumidores | #3503/#3507 | P1 |
| F01-L04-R04 | Orçamentos/RFQ versionados e invalidação ao mudar base | NÃO COMPROVADO | Modificar BIM, marcar dependências desatualizadas sem sobrescrever orçamento aprovado | #3503 | P1 |
| F01-L04-R05 | Segurança multi-tenant e concorrência | NÃO COMPROVADO | Acesso cruzado negado; edições concorrentes detectadas sem perda silenciosa | #3503 | P1 |
| F01-L05-R01 | Gates pnpm, libs, backend, frontend, bundle e Vitest | NÃO EXECUTADOS NESTA AUDITORIA | Logs reais com SHA reconciliado e comparação com baseline | #3503 | P1 |
| F01-L05-R02 | Testes E2E Projeto 2D/3D/IFC/PDF | NÃO EXECUTADOS NESTA AUDITORIA | Traces Playwright e fluxos reais, dados autorizados, sem mocks no aceite | #3503 | P1 |
| F01-L05-R03 | QA visual comparado à identidade aprovada | NÃO EXECUTADOS NESTA AUDITORIA | Screenshots desktop/touch comparados ao mockup de referência | #3503/#3507 | P1 |
| F01-L05-R04 | Homologação isolada e permissões | NÃO EXECUTADOS NESTA AUDITORIA | Registro ambiente, SHA, tenants/papéis e resultado real | #3503 | P1 |
| F01-L05-R05 | Publicação segura, backup e rollback | NÃO EXECUTADOS NESTA AUDITORIA | Evidência de backup recuperável, release real, logs e rollback planejado/testado | #3503 | P1 |

## Sequenciamento e posse

1. **Primeiro:** reconciliar #3503 contra #3507/`main`, especialmente `ConceptPlanner.tsx`, estilos Studio e tokens. Não sobrescrever integração atual.
2. **Motor:** fechar R01–R07 e só então consumir o snapshot nos derivados; validações isoladas não contam como BIM pronto.
3. **Editor:** concluir R01–R04 e comparar com referência **aprovada**.
4. **Importação e engenharia:** dividir por interfaces/API; evitar duas branches concorrentes em `ConceptPlanner.tsx`.
5. **Qualidade:** registrar logs/evidências por requisito, cumprir gates, homologar no ambiente isolado; qualquer novidade incompleta permanece flag off.

## Resultado inicial

- Requisitos catalogados: **26**; **0 comprovadamente homologados por esta auditoria documental**.
- Percentual implementado, testado, homologado e publicado: **não apurado**, até comparar código efetivo, executar testes e validar VPS.
- O inventário não converte ausência de evidência em afirmação de ausência de implementação. Não efetuar merge/publicação com base nesta matriz.
