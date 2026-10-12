# UI 2.0 — Lote 01: abas principais por serviço

**Estado:** implementado em branch, aguardando validação. Não homologado nem publicado.

## Entrega
- Barra horizontal de serviços: Início, CRM, Marketing, ERP, IA, Marketplace, Arqdor, Suporte e Configurações.
- Rota ativa destacada e navegação com rolagem horizontal em telas compactas.
- Sidebar legada preservada (menu interno atual). Não duplicar funcionalidades nem alterar regras de autorização.
- Arqdor é ocultado quando o tenant não é elegível; ERP respeita o entitlement de navegação já existente.
- Superadmin puro preserva a interface administrativa anterior.
- Flag `VITE_UI20_SERVICE_TABS=true` habilita apenas a prévia; padrão desligado.

## Limitações / próximas etapas
1. Validar as rotas de entrada de Suporte e Marketing no roteador real; revisar eventuais links diferentes entre verticais.
2. Substituir sidebar geral por menu **contextual por serviço**, preservando menus verticais e operações existentes.
3. Usar catálogo autorizado de serviços vindo do backend para os demais módulos (não inferir autorização por links).
4. Aplicar dashboard personalizado por role/tenant/entitlements, sem métricas falsas.
5. Implementar e testar experiência mobile e teclado/leitor de tela.
6. Testar navegação regressiva, troca de tenant, sessão expirada e ausência de entitlement.
7. Executar typecheck e testes do frontend/homologação Contabo antes de qualquer ativação.

## Aceite
- Entrar em cada serviço, navegar às rotas existentes e voltar sem recarregar página inteira.
- Não expor qualquer serviço não autorizado; backend deve recusar rotas e APIs proibidas.
- Produção inalterada até homologação e publicação controlada.

O uso de uma feature flag é somente mecanismo de rollout visual; não confere permissões.
