# VC-001-C01 — Confronto inicial: home aprovada × código da tela Início

**Estado:** auditoria estática inicial. **NÃO** é teste visual/browser nem homologação.
**Referência oficial:** VC-001-D01; imagem original aprovada `vendorai-vc001-home-aprovada.png`, preservada na conversa, ainda não incorporada ao GitHub.
**Base analisada:** main `c713d1cc3852c7164bda58006df549d3715ec45a`.

## Arquivos identificados
- `artifacts/frontend/src/pages/TadCentralRoute.tsx`: controla acesso ao launcher, lê `nav-modules` e `tad-effective-modules`; fornece empresa, módulos habilitados e permitidos.
- `artifacts/frontend/src/pages/TadCentral.tsx`: home/launcher com tema escuro neon, mapa de módulos, cores, cards e seletor de tenant.
- `artifacts/frontend/src/lib/adaptiveModuleLauncher.ts`: metadados e autorizações do launcher; auditar rotas/destinos antes de modificar.
- `artifacts/frontend/src/components/layout/SidebarLayout.tsx`: shell de navegação e configuração de sidebar; validar menu contextual.
- `artifacts/frontend/src/pages/dashboard/Dashboard.tsx`: consulta indicadores oficiais e módulos de navegação; API útil a avaliar, sem assumir que métricas podem ser reutilizadas na home.

## Comparação preliminar verificável
| Requisito da referência | Situação no código lido | Intervenção sugerida |
|---|---|---|
| Identidade dark premium e cards de módulos | Já existe base dark neon, cores e iconografia em `TadCentral` | Preservar o funcionamento, adequar composição visual à imagem aprovada |
| Respeito a módulos/permissões do tenant | `TadCentralRoute` combina `nav-modules` com `tad-effective-modules`; fallback fecha acesso | Manter esta autorização e criar testes server-side e UI |
| Troca de empresa | `CompanySwitcher` e API `/api/auth/switch-tenant` no launcher | Preservar e testar separação de dados |
| Imagens reais do negócio em todos os cards | Arquivo `TadCentral.tsx` contém URLs externas Unsplash para Arqdor, Obras e vitrine; origem real por tenant **não comprovada** | Criar seleção de mídia autorizada por tenant, com opção de escolha e fallback |
| Indicadores reais, atividades e ações rápidas por card | Há dashboard com APIs e cards no launcher, mas **não foi provado** um contrato de dados específico por módulo | Definir API agregadora com cache, escopo, erro/zero e permissões; reutilizar dados existentes |
| Clique, hover e mobile | Há estilos hover; comportamento completo e mobile não verificados nesta leitura | Testes E2E, teclado, toque e ações efetivas sem botões falsos |
| Exatamente oito cards de destaque da referência | Launcher oferece mais módulos, conforme habilitação | Definir composição destacada e acesso a módulos adicionais sem ocultar produtos autorizados |
| Rodapé atividades recentes/atalhos | Não confirmado no trecho auditado | Verificar arquivo completo antes de propor adição |
| Conteúdos de imagem licenciados | URLs de demonstração externas identificadas | Priorizar ativos do tenant/R2, direitos de uso e fallback local |

## Diretriz funcional definida na conversa
Tela Início visual e interativa; cards com imagens **do próprio negócio**, CRM, Arqdor, Obras, Praça.ai, Marketing, ERP, Suporte e Vendi; valores reais e ações rápidas; marca/identidade por tenant; desktop e mobile. Não substituir a referência visual original por outra imagem.

## Implementação proposta sem destruição de recursos
1. Mapear o componente inteiro e rotas usadas realmente pelo `/tad`.
2. Capturar tela real autenticada (desktop/mobile) por browser autorizado e comparar com PNG aprovado.
3. Inventariar coleções de imagens disponíveis por tenant (campanhas, produtos, renders, obras, portfólio, brandkit) e controlar uso/licença/acesso.
4. Definir serviço leve `tenant-module-card-snapshot` ou adaptar APIs existentes para indicadores/atividade/imagem. Evitar requests excessivos por card.
5. Implementar cartão de imagem com overlay acessível, CTA principal real e ações rápidas; fallback sem conteúdo.
6. Preservar `authorizedLauncherModules` e checagem efetiva server-side, com testes multi-tenant.
7. Testar 8 módulos, usuários com diferentes permissões, tenant sem imagens, rede lenta, mobile/toque e navegação por teclado.
8. Anexar captura da implementação e comparar com arte aprovada; aprovar antes de publicar.

## Decisão pendente (não bloquear auditoria)
**Regra exata de seleção de imagem:** preferência manual pelo tenant, seleção automática de dados reais do módulo ou híbrida com prioridade manual; definir em revisão, sem presumir aprovação.

## Restrições
- Não alterar o código antes de aprovar especificação técnica.
- CI continua com falhas e Cloudflare apresentou 401 nas consultas anteriores. Não publicar sem controles.
- A imagem gerada é conceitual; dados/números e fotos ilustrativos não devem ser codificados como dados reais.
