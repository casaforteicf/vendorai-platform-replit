# Decisão VC-001-D01 — Referência visual aprovada: tela Início Vendor.ai

**Decisão do titular do produto:** APROVADA, em conversa de 24/10/2026 (fuso America/Sao_Paulo).
**Escopo da aprovação:** direção visual e comportamento conceitual da home. **Não** significa implementação, homologação ou publicação.
**Vinculação:** VC-001 / Issue #3628 / Programa PR #3624.

## Referência aprovada
Imagem original gerada e aprovada nesta conversa: `vendorai-vc001-home-aprovada.png` (captura conceitual 1536×1024, aproximadamente 2 MB). Foi preservada como artefato para posterior comparação. **A imagem ainda não foi incorporada ao repositório GitHub**; esta documentação não pretende substituí-la.

## Características visuais aprovadas
- Home dark premium Vendor.ai com cabeçalho, busca global e identificação do tenant.
- Banner visual institucional da empresa no topo.
- Grade com cards grandes e imagem destacada do negócio/cliente, não cards estáticos genéricos.
- Exemplos presentes no mockup: CRM, Arqdor, Obras, Praça.ai, Marketing, ERP, Suporte e Vendi.ai.
- Cards com título, descrição curta, indicadores, atividade/projeto/produto recente e ações principais/secundárias.
- Cores de identificação por módulo, textos legíveis sobre imagens com overlay.
- Rodapé operacional com atividades recentes e atalhos.
- Identidade personalizada por tenant.

## Interatividade pretendida a implementar/testar
- Clique principal abre módulo autorizado; botões de ação rápida executam operações reais.
- Hover/foco revela interações com acessibilidade; mobile deve oferecer alternativa ao hover.
- Imagens reais do tenant: uploads, produtos, campanhas, fotos de obras, renderizações e portfólio, conforme permissões.
- Preferência de imagem por módulo com opção manual e automática; comportamento exato ainda a detalhar.
- Contadores e itens recentes derivados de API, nunca valores fictícios.
- Estado de carregamento, falha, sem conteúdo, acesso negado e módulo não contratado.
- Não exibir informações de outro tenant.
- Menus laterais específicos do módulo; Início retorna ao hub; Financeiro dentro do ERP.

## O que ainda será confrontado com a aplicação real
1. Identificar componentes e rotas atuais responsáveis pelo hub.
2. Produzir capturas reais da home atual nos perfis desktop e mobile.
3. Comparar geometria, imagens, hierarquia, estados interativos, navegação e responsividade à referência aprovada.
4. Identificar as APIs existentes para indicadores, conteúdos recentes e banco de imagens.
5. Elaborar diff funcional/técnico, com mudanças mínimas para preservar recursos existentes.
6. Implementar somente em PR separado, homologar e obter comprovação.

## Ressalvas
- Nomes, números, rostos, fotos e atividades do mockup são **ilustrativos** e não correspondem necessariamente a dados ou pessoas reais.
- Aprovação da referência **não** aprova uso de uma fotografia específica, nem autoriza publicação em produção.
- Permissões, origens de imagem, licenças, conteúdo da busca global e detalhes de ação serão especificados antes de implementar.
