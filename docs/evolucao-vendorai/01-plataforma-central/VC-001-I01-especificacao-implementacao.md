# VC-001-I01 — Especificação executável: Início TAD com cards fotográficos interativos
Status: **pronto para desenvolvimento em PR separado**, sujeito às verificações de integrações e autorização. Design de referência VC-001-D01 aprovado pelo titular. Nenhuma publicação autorizada por esta ficha.
Referências: Issue #3628; PR documental #3624; confronto C01. Captura da tela atual foi fornecida na conversa. **O PNG original do mockup aprovado ainda deve ser anexado de modo durável ao repositório**; não substituir por referência semelhante.

## Princípios não negociáveis
- Manter TAD atual, rotas e acessos; **evoluir**, não reconstruir.
- Aproximar layout e composição do mockup aprovado: banner institucional + cards grandes fotográficos, overlays legíveis, dados e ações do próprio negócio, atividades recentes e atalhos.
- Nunca usar números ilustrativos, fake cards ou botões sem execução real.
- Respeitar tenant, módulos contratados, direitos efetivos e privacidade.
- Financeiro sob ERP e navegação contextual de cada módulo.
- Sem cronograma artificial.

## Componentes inspecionados
- `artifacts/frontend/src/pages/TadCentral.tsx`: launcher atual, cards, temas, prévias e CompanySwitcher.
- `artifacts/frontend/src/pages/TadCentralRoute.tsx`: consulta `nav-modules` e `tad-effective-modules` com falha fechada.
- `artifacts/frontend/src/lib/adaptiveModuleLauncher.ts`: catálogo/destinos a examinar integralmente antes de editar.
- `artifacts/frontend/src/components/layout/SidebarLayout.tsx`: navegação e contexto.
- `artifacts/frontend/src/pages/dashboard/Dashboard.tsx`: indicadores e snapshots já disponíveis para possível reutilização.
A existência no código não comprova execução em produção.

## Entregas de interface
1. Cabeçalho: marca, busca real existente, novidades, perfil/tenant; não duplicar barra superior.
2. Banner: imagem institucional autorizada do tenant com alternativa segura. Não usar nome/rosto ilustrativo do mockup como dado real.
3. Grade: cards com imagens do negócio; composição responsiva inspirada no mockup, com ajuste à largura real e módulos autorizados, sem ocultar módulo permitido.
4. Card por módulo: ícone, nome, subtítulo, fotografia/thumbnail autorizada, overlay, no máximo dois indicadores principais, item recente e CTA 'Abrir'. Mostrar ação secundária apenas se API/rota válida existir.
5. Complementos: atividades recentes intermodulares e ações rápidas somente quando suas APIs autenticadas forem implementadas/validadas.
6. Estados: carregando, vazio, sem imagens, erro, módulo sem acesso, tenant sem módulos. Sem efeito de hover indispensável para funcionamento mobile.

## Fontes de imagens
- Priorizar itens reais já vinculados ao tenant: projetos/render do Arqdor, obra/foto autorizada, produto Praça.ai, campanha/portfólio Marketing, identidade institucional de Brand Kit.
- CRM, ERP, Suporte e Vendi: imagens institucionais escolhidas pelo tenant quando não houver acervo visual apropriado; não expor fotos pessoais ou documentos sigilosos.
- Confrontar as APIs já existentes e links de R2; não criar duplicação de arquivos sem necessidade.
- Proposta técnica: seleção manual por tenant tem precedência; na ausência, selecionar item real público/autorizado do módulo; por último fallback de marca. **Regra de priorização deverá ser confirmada no refinamento antes de desenvolvimento de configuração editável.**
- Definir crop, tamanho, compressão, cache e alt text. Proteger links assinados/privados.

## Métricas sugeridas para validar por API existente
CRM: leads novos, negócios ativos, próxima tarefa.
Arqdor: projetos ativos, aprovações pendentes, último projeto/render.
Obras: obras em execução, medições pendentes, última obra.
Praça.ai: pedidos, cotações e produto autorizado em destaque.
Marketing: campanhas ativas, leads atribuídos, campanha recente.
ERP: contas a receber, pagamentos previstos; visíveis só aos autorizados.
Suporte: chamados abertos e próximos atendimentos.
Vendi: missões ativas, histórico efetivamente concluído.
Cada indicador exige definição da fonte, escopo temporal e autorização; preferir agregado backend com cache e limites.

## Interações
- CTA principal navega à rota que já existe e está autorizada.
- Ação secundária só aparece com URL/operador válidos, não faz mutation sem validação.
- Card inteiro pode permitir abertura de detalhe/interação desde que sem conflito com botões internos e com acessibilidade teclado.
- Mobile: card empilhado e ações sempre acessíveis; foco, teclado e leitor de tela.
- Evento de clique não habilita permissão: API sempre verifica tenant/role.

## Implementação segura
A. Mapear todos os subcomponentes/rotas; levantar arquivos de marca e provedores de imagem existentes.
B. Desenhar contrato de `card-snapshot` reutilizando endpoints, explicitando acesso e fallback; não assumir endpoint já existente.
C. Trabalhar em branch separada da branch documental; alteração incremental de `TadCentral` e componentes auxiliares.
D. Isolar dados dos módulos em funções/serviços tipados; nenhuma chamada N+1 pesada sem cache.
E. Testar módulos não habilitados, acesso negado, ausência de mídia, tenant de setor diferente, rede lenta e uso em smartphone.
F. Comparar screenshots reais com imagem aprovada lado a lado (desktop + mobile), revisar alterações antes do merge.
G. Homologar com usuário autorizado e dados de teste; publicar apenas após CI verde, Cloudflare regularizado e fluxo Vendi comprovado, com rollback.

## Critérios de aceite objetivos
- Contrato de autorização intacto e testado para pelo menos dois tenants/perfis.
- Todas as imagens exibidas têm tenant/proveniência correta e fallback visível.
- Dados exibidos correspondem a consultas reais; ausência de dado é representada honestamente.
- 100% dos CTAs visíveis navegam ou executam ação válida, com tratamento de falha.
- Cards, banner e área de atividades correspondem visualmente à referência aprovada, inclusive mobile, mediante comparação documentada.
- Sem regressão das rotas e menus; testes automatizados e revisão de segurança aprovados.
- Commits, PR, evidências e versão de implantação registrados na Issue.

## Critérios que impedem publicação
CI crítico vermelho; credenciais Cloudflare inválidas; isolamento multi-tenant não validado; qualquer card com números falsos ou destino inoperante; ausência de evidência de restauração/rollback.
