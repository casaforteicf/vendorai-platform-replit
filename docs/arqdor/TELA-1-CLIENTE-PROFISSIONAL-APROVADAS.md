# ARQDOR — Tela inicial por perfil (referências aprovadas)
Data de aprovação: 2026-10-29
Status: imagens da Tela 1 aprovadas pelo responsável; **não implementadas**.

## Arquivo visual definitivo
Pacote ZIP salvo na biblioteca ChatGPT do projeto:
`/Projetos/ARQDOR/Referencias-Aprovadas/ARQDOR_Tela1_Baselines_Aprovadas_2026-10-29.zip`
SHA-256: `93e307a8721bfacb58cf929f5f149e680aec4cd2f179b8073196663578597543`

Arquivos aprovados e hashes:
- `Tela1_Profissional_APROVADA.png`: `cad0382ed0f1740cdc24f8b4e9b02a2763051f587f85f46b8cb7f68bd775dcf4`
- `Tela1_Cliente_APROVADA.png`: `8e26cb2027af9e75735d92d9466424ebf9fa3ac6d025bd6b38b25cc70f3da9c5`
- Os originais da marca estão incluídos na pasta `Marca_Oficial/`. Os logos desenhados dentro dos mockups não são fonte da marca e deverão ser substituídos por **assets oficiais** sem redesenho.

## Comportamento aprovado
- **Tela inicial após login**: arquiteto/engenheiro autorizado entra na experiência Profissional; cliente autenticado do tenant entra na experiência Cliente.
- **Não determinar o papel somente por uma inferência visual ou e-mail**. Autorizar no servidor por perfil/papel, tenant, recursos contratados e permissões do projeto.
- ARQDOR Profissional: interface técnica com sete ambientes aprovados, modelagem 2D/3D/BIM e render profissional GPU (planejado).
- ARQDOR Cliente: projetos/ideias, render conceitual, orçamentos, cotações anônimas, propostas, contratações e solicitação de apoio profissional.
- Ideias, imagens prévias, referências, prompts e aprovações do cliente devem acompanhar a transferência para o profissional, com versão técnica separada.
- Cotações: parceiros homologados do tenant primeiro, expansão **somente autorizada**; comissão padrão configurável de 10%; intermediação de pagamentos apenas após integração financeira real; revelação de identidade exclusivamente após escolha e aceite mútuo.
- Estimativa conceitual, orçamento detalhado e cotações reais são resultados distintos; nenhuma medição técnica é inferida de imagem de IA sem validação.

## Baseline e bloqueio de mudanças
- Aplica-se `docs/arqdor/BASELINE-VISUAL-APROVADA-2026-10-29.md` com **zero redundância** e nenhuma alteração visual sem autorização explícita.
- Não criar variantes não aprovadas nem duplicar menus, botões, Vendi ou informações.
- Esta documentação **não é implementação, evidência de testes ou autorização de deploy**.

## Inspeção inicial do código (necessita validação funcional)
- `artifacts/frontend/src/lib/adaptiveModuleLauncher.ts`: ARQDOR abre `/arch/studio` para audiências professional/business; `portal_cliente` tem rota null.
- `artifacts/frontend/src/AppLegacy.tsx`: carrega `ArchWorkspace` e `ArchPortalCliente` separadamente.
- `artifacts/frontend/src/modules/arqdor/workspace/ArqWorkspace.tsx`: usa `ProjectHomeV2` e contém ferramentas técnicas e portal; ainda não é roteamento pós-login por perfil cliente/profissional comprovado.
- `artifacts/api-server/src/middlewares/auth.ts`: papéis gerais (`super_admin`, `tenant_admin`, `tenant_seller`, `partner`, `member`) não definem sozinhos arquiteto, engenheiro ou cliente.
- **Pendência de implementação**: identificar o modelo persistido de perfil profissional/cliente e as permissões de tenant, estabelecer redirecionamento pós-login seguro, validar a Tela 1 correspondente, integrar APIs e efetuar testes. Não modificar a produção sem validação.

## Critério de aceite da implementação
Login correto → tela adequada → apenas projetos autorizados → ações não redundantes e funcionais → anonimato preservado → handoff cliente-profissional com prévias intactas → render engine correto por modo → identidade original.
