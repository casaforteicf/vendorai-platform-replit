# ARQDOR Studio 2.0 — Baseline visual aprovada e congelada
**Aprovada pelo responsável em 29/10/2026. Alterações dependem de autorização explícita.**

## Estrutura que deve permanecer intacta
- Sete ambientes, nesta ordem: **Projetos → Modelagem 2D/3D → Materiais → Render → Especificações → Orçamento → Entrega**.
- Navegação principal única, sem duplicar menus de módulos nas barras superior e lateral.
- Topo compacto com projeto ativo, salvamento, histórico, alternância de tema e acesso ao Vendi IA.
- Área central predominante; ferramentas contextuais; painéis de projeto/propriedades recolhíveis e redimensionáveis; sem painel inferior permanente redundante.
- Materiais utilizáveis como catálogo sem projeto; aplicar somente a projeto aberto e com elemento, ambiente, pavimento ou destino explícito.
- Ferramentas internas e complementares: BIM, terreno, engenharias, Measure, marcenaria, mobiliário, iluminação, edição localizada de render, versões, documentação, colaboração e permissões, sem proliferar módulos principais.
- **Especificações do Projeto** abrangem elementos construtivos, disciplinas, memorial técnico, fichas, quantitativos, documentação e revisões.
- Temas claro/escuro com a mesma organização e identidade.
- Identidade oficial do kit `ARQDOR_Identidade_Visual_Para_Agente(1).zip`; referência prioritária `06_Referencia_original_aprovada.png`. Símbolo em degradê verde, logo, proporções e tipografia originais; não redesenhar. Não afirmar haver SVG no ZIP sem verificar.
- Todos os controles devem usar funções reais e preservar projeto, dados, permissões, histórico, APIs e fluxo de trabalho existentes.

## Política obrigatória de alterações
**É proibido sem autorização expressa do responsável:** modificar a estrutura aprovada, posição/hierarquia de áreas, navegação, ordem dos ambientes, identidade visual, fluxo principal ou remover/desativar funcionalidades; também não criar nova interpretação visual e declará-la aprovada.

**Permitido antes da autorização:** diagnosticar, inventariar recursos, detalhar estados e botões, testar e propor ajustes para revisão, sem mudar a baseline.

Para qualquer alteração aprovada, documentar: antes/depois, motivo, aprovação explícita, impacto em funcionalidades e testes.

## Fonte visual e limites
A referência visual é a **prancha geral de sete ambientes e ferramentas contextuais que o responsável aprovou na conversa**. A tela avulsa de Projetos apresentada depois foi rejeitada e **não** substitui a baseline.
Este arquivo registra a decisão; **não inclui ainda os bytes da prancha aprovada nem substitui os arquivos oficiais da marca**. Não altera código executável nem publica alterações em produção.

## Processo seguinte
Detalhar uma tela de cada vez preservando a baseline; inventariar componentes e testar funções reais antes de propor implementação.

## Regra adicional aprovada — ZERO REDUNDÂNCIA (29/10/2026)
**Nenhuma tela do ARQDOR (profissional ou cliente) pode apresentar repetição desnecessária de menus, navegação, botões, atalhos, painéis, indicadores ou informações.**
- Uma única navegação principal por experiência: não repetir as mesmas opções na lateral e no topo.
- Uma única ação primária por contexto: não repetir `Novo projeto`, `Orçamento`, `Cotações`, `Contratações` ou outra ação em diferentes regiões da mesma tela.
- Uma única instância visível do assistente Vendi; abertura contextual, preferencialmente recolhível.
- Não criar painel de ações rápidas que apenas replique o menu principal ou botões já exibidos.
- Informações resumidas não devem repetir dados sem valor adicional. Ações dentro de cartões são admitidas **apenas se forem específicas daquele item**, não cópias genéricas dos mesmos controles.
- Exceções justificadas por acessibilidade, responsividade ou contexto precisam ser documentadas e aprovadas expressamente antes de alterar a baseline.
- Antes de gerar mockup ou implementar, executar revisão de redundâncias e confrontar com esta regra; mockup que a viole **não deve ser apresentado como aprovado**.
