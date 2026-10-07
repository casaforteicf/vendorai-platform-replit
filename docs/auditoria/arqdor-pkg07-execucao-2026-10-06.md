PR: #3247  
Status deste documento: **código implementado e validado localmente; não publicado em produção**.
## Matriz de fechamento
| Frente | Auditoria | Execução neste pacote | Estado |
| --- | --- | --- | --- |
| ARQ-PROJ | Projetos visuais, thumbnail, cliente, status, orçamento, progresso e próxima ação | Lista tabular substituída por cards; API expõe thumbnail do último render | Implementado |
| ARQ-NEW | Reutilizar CRM, evitar jornada duplicada e separar origem | Cadastro direto continua reutilizando lead/CRM; entrada separa **Novo pré-projeto** de **Projeto direto** e orienta promoção do pré-projeto aprovado | Implementado |
| ARQ-CONCEPT | Terreno, norte, recuos, área edificável, autosave, guiado/profissional | Terreno realmente opcional; contexto real separado do workspace técnico; frente, norte, declive, acesso, vista, recuos e estratégia; lote irregular por polígono com área edificável e contenção da implantação | Implementado |
| ARQ-AMB | Intenção → briefing → programa → layout → materiais → render → apresentação | Mantido o briefing mestre/DNA e o programa arquitetônico existentes; jornada tornou-se não linear para permitir revisão contextual | Mantido e integrado |
| ARQ-IMPORT | Importação real com preview, escala e geometria editável | DXF/IFC/DWG/SKP passam por preview antes de substituir geometria; confirmação humana e backup; RVT permanece fonte vinculada | Implementado |
| ARQ-VISION | Imagem/croqui → geometria com calibração e aprovação humana | Fluxo existente preservado: enviar → analisar → revisar → editável, modos Referência/Vetorizado/Sobreposição, confiança/alinhamento e aplicação humana | Mantido e integrado |
| ARQ-PLANTA | Briefing → programa → planta → validação; não gerar de texto solto | Frontend e API bloqueiam desenvolvimento de projeto vazio sem briefing/programa ou geometria real (`ARCH_BRIEF_REQUIRED`) | Implementado |
| ARQ-PRE | Eliminar duplicados/órfãos e usar cards visuais | `creationKey` idempotente + índice único parcial; lista visual com thumbnail, escopo, terreno, área, pavimentos, ambientes e última edição | Implementado |
| ARQ-UI | Barra única, controles contextuais, canvas maior, snap/cotas/nós/autosave/versões | Toolbar horizontal duplicada removida; rail/painel contextual mantido; navegação não linear; chrome superior simplificado; autosave/status/undo/redo/versões existentes preservados | Implementado |
## Alterações estruturais
### Entrada
- Novo pré-projeto abre diretamente em uma escolha de origem.
- Casa completa e ambiente usam a mesma entrada.
- Terreno é opcional e pode ser informado ou alterado depois.
- Origens disponíveis: IA, desenho do zero, importação, croqui/imagem, modelo/inspiração e entrada direta no editor.
### Editor
- Eliminada a segunda toolbar que repetia selecionar, parede, ambientes, aberturas, móveis e cotas.
- Ferramentas permanecem no rail/painel contextual.
- A jornada deixa de bloquear navegação entre áreas; apenas a apresentação final respeita bloqueios arquitetônicos.
- A barra superior mantém salvar, IA, pavimento, modos e ações principais.
### Terreno
- O padrão 12 × 30 m é explicitamente **workspace técnico** enquanto o usuário não confirmar um terreno real.
- Lote real aceita formato retangular ou polígono irregular.
- Área do polígono é calculada.
- A área edificável é obtida por interseção do polígono com os recuos configurados.
- A implantação é impedida de ultrapassar o polígono edificável.
- Norte, acesso de veículos, declive, vista/lazer e lado crítico continuam disponíveis para a inteligência de implantação.
### Integridade de dados
- Cada nova sessão de criação recebe um `creationKey`.
- O backend reutiliza o rascunho se receber o mesmo token.
- Um índice único parcial no PostgreSQL fecha a corrida entre autosave, clique repetido e múltiplas requisições.
### IA e importação
- Projeto vazio não é desenvolvido pela IA sem programa/briefing.
- Importação geométrica não substitui a planta antes de preview + confirmação.
- Imagem/croqui não vira planta silenciosamente; há revisão vetorial e aprovação humana.
## Critério técnico usado
O pacote só pode seguir para integração quando:
1. testes de jornada e geometria passam;
2. testes de persistência/API passam;
3. build de frontend passa;
4. bundle budget continua dentro do limite;
5. PR permanece mergeável com a base;
6. smoke visual/funcional é feito no ambiente de validação antes de qualquer publicação.
## Fora deste PR
- Nenhum deploy de produção.
- Nenhum merge automático.
- Nenhuma alteração destrutiva em projetos existentes.
- A publicação continua sujeita ao fluxo controlado de release.
# PKG-07 — Arqdor Core · execução da Auditoria Mestra 05/10

Data da execução: 06–07/10/2026  
Branch: `feat/arqdor-pkg07-ux-20261006`  
PR: #3247  
Status deste documento: **código implementado e validado localmente; não publicado em produção**.

## Matriz de fechamento

| Frente | Auditoria | Execução neste pacote | Estado |
| --- | --- | --- | --- |
| ARQ-PROJ | Projetos visuais, thumbnail, cliente, status, orçamento, progresso e próxima ação | Lista tabular substituída por cards; API expõe thumbnail do último render | Implementado |
| ARQ-NEW | Reutilizar CRM, evitar jornada duplicada e separar origem | Cadastro direto continua reutilizando lead/CRM; entrada separa **Novo pré-projeto** de **Projeto direto** e orienta promoção do pré-projeto aprovado | Implementado |
| ARQ-CONCEPT | Terreno, norte, recuos, área edificável, autosave, guiado/profissional | Terreno realmente opcional; contexto real separado do workspace técnico; frente, norte, declive, acesso, vista, recuos e estratégia; lote irregular por polígono com área edificável e contenção da implantação | Implementado |
| ARQ-AMB | Intenção → briefing → programa → layout → materiais → render → apresentação | Mantido o briefing mestre/DNA e o programa arquitetônico existentes; jornada tornou-se não linear para permitir revisão contextual | Mantido e integrado |
| ARQ-IMPORT | Importação real com preview, escala e geometria editável | DXF/IFC/DWG/SKP passam por preview antes de substituir geometria; confirmação humana e backup; RVT permanece fonte vinculada | Implementado |
| ARQ-VISION | Imagem/croqui → geometria com calibração e aprovação humana | Fluxo existente preservado: enviar → analisar → revisar → editável, modos Referência/Vetorizado/Sobreposição, confiança/alinhamento e aplicação humana | Mantido e integrado |
| ARQ-PLANTA | Briefing → programa → planta → validação; não gerar de texto solto | Frontend e API bloqueiam desenvolvimento de projeto vazio sem briefing/programa ou geometria real (`ARCH_BRIEF_REQUIRED`) | Implementado |
| ARQ-PRE | Eliminar duplicados/órfãos e usar cards visuais | `creationKey` idempotente + índice único parcial; lista visual com thumbnail, escopo, terreno, área, pavimentos, ambientes e última edição | Implementado |
| ARQ-UI | Barra única, controles contextuais, canvas maior, snap/cotas/nós/autosave/versões | Toolbar horizontal duplicada removida; rail/painel contextual mantido; navegação não linear; chrome superior simplificado; autosave/status/undo/redo/versões existentes preservados | Implementado |

## Alterações estruturais

### Entrada
- Novo pré-projeto abre diretamente em uma escolha de origem.
- Casa completa e ambiente usam a mesma entrada.
- Terreno é opcional e pode ser informado ou alterado depois.
- Origens disponíveis: IA, desenho do zero, importação, croqui/imagem, modelo/inspiração e entrada direta no editor.

### Editor
- Eliminada a segunda toolbar que repetia selecionar, parede, ambientes, aberturas, móveis e cotas.
- Ferramentas permanecem no rail/painel contextual.
- A jornada deixa de bloquear navegação entre áreas; apenas a apresentação final respeita bloqueios arquitetônicos.
- A barra superior mantém salvar, IA, pavimento, modos e ações principais.

### Terreno
- O padrão 12 × 30 m é explicitamente **workspace técnico** enquanto o usuário não confirmar um terreno real.
- Lote real aceita formato retangular ou polígono irregular.
- Área do polígono é calculada.
- A área edificável é obtida por interseção do polígono com os recuos configurados.
- A implantação é impedida de ultrapassar o polígono edificável.
- Norte, acesso de veículos, declive, vista/lazer e lado crítico continuam disponíveis para a inteligência de implantação.

### Integridade de dados
- Cada nova sessão de criação recebe um `creationKey`.
- O backend reutiliza o rascunho se receber o mesmo token.
- Um índice único parcial no PostgreSQL fecha a corrida entre autosave, clique repetido e múltiplas requisições.

### IA e importação
- Projeto vazio não é desenvolvido pela IA sem programa/briefing.
- Importação geométrica não substitui a planta antes de preview + confirmação.
- Imagem/croqui não vira planta silenciosamente; há revisão vetorial e aprovação humana.

## Critério técnico usado

O pacote só pode seguir para integração quando:
1. testes de jornada e geometria passam;
2. testes de persistência/API passam;
3. build de frontend passa;
4. bundle budget continua dentro do limite;
5. PR permanece mergeável com a base;
6. smoke visual/funcional é feito no ambiente de validação antes de qualquer publicação.

## Fora deste PR

- Nenhum deploy de produção.
- Nenhum merge automático.
- Nenhuma alteração destrutiva em projetos existentes.
- A publicação continua sujeita ao fluxo controlado de release.
