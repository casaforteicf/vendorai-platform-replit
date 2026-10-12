# Arqdor Studio 2.0 — identidade visual oficial
Aprovado em 2026-10-11. Fonte: mockup Arqdor Render Pro aprovado pelo responsável do produto.

## Objetivo
Unificar Concept, Render, Measure, Biblioteca, Mobiliário, Especificações/Orçamentos e Studio IA com a linguagem visual de um software profissional para arquitetos. Não aplicar esses estilos ao CRM ou ao restante do Vendor.ai indiscriminadamente.

## Identidade
- A marca oficial e o logotipo original devem ser usados sem recriação, recorte nem alteração de proporção.
- Grafite como base, superfícies sutis e texto claro; acento verde Arqdor usado apenas em seleção, ação principal e estado positivo.
- Estilo discreto, técnico, densidade informacional elevada mas legível; não usar dashboards de cards dentro do editor.
- Fonte Inter; fallback IBM Plex Sans, Segoe UI, sans-serif. Números técnicos tabulares.
- Desktop: menus 12px; comandos 11–12px; parâmetros 11px; título de painéis 13px; títulos de seções 14–16px.
- Contraste e acessibilidade devem prevalecer sobre densidade. Ajustes responsivos no mobile/touch.

## Tokens-alvo
| Token | Valor |
| --- | --- |
| canvas | #171F22 |
| surface | #20282A |
| panel | #263034 |
| elevated | #303A3D |
| border | #3A4649 |
| text | #EEF2EF |
| muted | #AAB8B5 |
| accent | #176D59 |
| accent-hover | #21856C |
| selection | #4AC59A |
| danger | #EA7373 |
| font | Inter / IBM Plex Sans |
| header | 52px desktop |
| sidebar-left | 156px expanded, 56px collapsed |
| sidebar-right | 300px expanded, collapsible |
| storyboard | 154–184px resizable |

## Layout canônico
Topo: projeto, módulos, sincronização, histórico global, ajuda.
Esquerda: ferramentas do módulo em itens compactos com tooltip.
Centro: viewport/canvas dominante; nunca encoberto por cards irrelevantes.
Direita: propriedades contextuais, materiais, seleção e controles.
Base: cenas, pavimentos, versões, histórico, comparações ou ambientes conforme contexto.
Painéis redimensionáveis/recolhíveis, com restauração do último layout por usuário/dispositivo.

## UX transversal
- Seleção contextual com indicação clara de objeto, camada e propriedades.
- Desfazer/refazer, autosave, feedback de sincronização e histórico preservado.
- Atalhos consistentes, dicas curtas, foco visível, navegação por teclado.
- Modo simplificado, profissional e apresentação; não duplicar o aplicativo.
- Não esconder comandos críticos apenas em hover em dispositivos touch.
- Não oferecer ação visual sem backend real; estados de indisponibilidade honestos.
- Render: fidelidade arquitetônica > fotorrealismo > estética; versões preservadas; 3 imagens por geração, quando suportado pelo fluxo existente.

## Rollout
1. Design tokens e primitivas compartilhadas escopadas em .arqdor-studio-v2.
2. Render: remover estilos claros legados e divergências, validar contraste; navegação e edição continuam funcionais.
3. Concept: canvas e propriedades, cotas, layers, seleção e materiais.
4. Measure: foto e sobreposições de medições, tabelas e validação.
5. Biblioteca, móveis e orçamento: catálogo técnico, filtros, propriedades e tabelas.
6. Testes de navegação desktop/mobile, regressão funcional e acessibilidade.
7. Homologação e promoção controlada sem publicação automática em produção.

## Observações
Este documento é a especificação aprovada, não evidência de que todas as telas foram migradas.
A documentação antiga docs/arqdor-ui-reference.md tem tokens laranja e contexto Planner 5D: permanece como histórico, mas esta especificação prevalece para identidade e visual. Inspirar-se em Lumion/V-Ray apenas nos padrões operacionais, sem copiar assets ou interface proprietária.
