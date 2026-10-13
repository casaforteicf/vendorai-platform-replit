# Handoff de homologação e publicação — Arqdor Studio 2.0

PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3494
Branch de trabalho: `feat/arqdor-studio-2-design-system-20261011`
Estado de entrega: **PR não homologado, não autorizar publicação direta.**
Responsável por homologação: executor/CI autorizado.

## 0. Travamentos / observações
- Commits UI-02 a SEC-UI-29 incluem visual e alterações funcionais em Render, histórico, cache e avaliadores de autorização.
- `artifacts/api-server/src/lib/arqdor-project-access.ts`: avaliadores de lead e obra foram criados, mas **não estão conectados às rotas**. Não declarar ACL individual completa como implementada.
- Auditar que nenhum arquivo alterado toca migração de banco, política de produção, ou contém alteração indesejada fora do escopo.
- Manter a produção imutável enquanto não houver SHA homologado. Não executar deploy/merge ao falhar gates.

## 1. Preparação
```bash
git fetch origin
git switch feat/arqdor-studio-2-design-system-20261011
git pull --ff-only
git rev-parse HEAD
git diff --name-status origin/main...HEAD
git diff --check origin/main...HEAD
corepack enable
pnpm install --frozen-lockfile
```
Registrar o SHA exato. Ler `docs/PADRAO-TAREFA-VENDI.md` e validar regras de branch/release vigentes.

## 2. Gates obrigatórios
```bash
pnpm run typecheck
pnpm run build
```
Executar suíte de testes existente relevante, além de testes dedicados para alterações neste PR. Build aprovado exige saída completa dos comandos, não apenas status parcial.

## 3. Cenários funcionais e de segurança
1. Render Studio: shell, inspector, navegação, contraste, responsividade, acessibilidade de tabs/botões/fields, biblioteca de materiais (erro, retry, seleção).
2. Troca de material: seleção de região, detecção/confirmacão de máscara, imagem do material, preservar geometria/câmera e gerar **nova** versão com `parent_render_id`.
3. Improve/lighting: metadados de material ausentes quando não aplicáveis; preservar versão anterior.
4. Reabrir projeto: histórico persistido vence cache, resposta vazia oficial não ressuscita render antigo; falha de rede ativa apenas recovery identificado; projeto/ambiente sem mistura.
5. Múltiplas abas, troca rápida de projeto, logout/login em computador compartilhado: sem render de outra sessão.
6. API: usuários sem token, tenant diferente, usuários do mesmo tenant com/sem autorização, acesso de pré-projeto, arquivos/URLs assinadas. **Não assumir ACL completa**: a integração desse recurso é uma pendência separada.
7. Regressões em Concept, Construction Hub, CRM e telas não Arqdor.

## 4. Pré-release obrigatório
- PR revisado e sem conflitos; migrations e alterações com risco identificadas.
- Gates verdes sobre o mesmo SHA que será publicado; branch homologada em staging isolado.
- Capturas de QA visual da identidade oficial; conferência do logo original, sem recriação.
- Backup restaurável, plano e responsável pelo rollback; changelog.
- Checklist de módulos entregues x pendentes divulgado; desabilitar funcionalidades não homologadas por flags se necessário.
- Não publicar um subconjunto que altere a autorização real inadvertidamente.
- Obter **aprovação explícita do usuário para a versão exata** após homologação e preparar release controlada, sem merge/deploy automático por push.
- Publicação somente na janela autorizada, com monitoramento de erros, funções Render e latência. Rollback ao primeiro sinal de regressão relevante.

## 5. Relatório final do executor
Enviar: SHA testado, relação de arquivos alterados, resultado completo de typecheck/build/testes, evidências QA, riscos, bloqueadores, confirmação do backup, URL de staging, rollback e decisão `APTO PARA APROVAÇÃO` ou `BLOQUEADO`.
**Não declarar publicado até confirmar deployment e saúde da versão em produção.**

## Verificação complementar — 12/10/2026 (sem liberação)
- SHA de referência do PR #3494: `dfdd2af53922ffd65257c97be5483d4fc63b4eeb`; comparar sempre com HEAD atualizado antes dos testes.
- Comparação com `main`: branch divergente, 44 commits à frente e 3 atrás no momento desta verificação. Conciliar antes de homologar.
- Operador da Contabo consultado com `releaseStatus` e lote `ARQDOR-3494`: `LOT_NOT_REGISTERED`, `BUILD=BLOCKED`, `PRODUCTION=untouched`. Não existe build homologado comprovado desse lote.
- Avaliadores de projeto em `artifacts/api-server/src/lib/arqdor-project-access.ts` presentes, porém não conectados. Não impor ACL parcial a projetos sem lead ou obra: definir política de propriedade, participantes e papel administrativo primeiro e aplicar com testes negativos por recurso.
- Protocolo de validação: executar comandos reais do documento no ambiente de trabalho autorizado, registrar logs e SHA; testar Render/Concept, cache entre sessões, assinaturas de URLs, multitenancy e responsividade antes da decisão de publicação.
- Sem aprovação explícita de versão homologada, **não realizar merge ou deploy**.

## Correção incremental de autorização e situação de build
- Adicionado `canAccessArqdorLinkedProject` no módulo `arqdor-project-access.ts`: combina apenas permissões comprovadas por lead ou responsável de obra, com negação conservadora por padrão.
- **Não conectar o avaliador a todas as rotas ainda:** projetos sem lead/obra, administradores, colaboradores, convidados e modelos Concept precisam de regra oficial e testes. A instalação indiscriminada negaria acessos legítimos.
- Tentativa real de `vendi_contabo_operate(build, ARQDOR-3494)` falhou no comando SSH/operador. Verificação anterior retornou `LOT_NOT_REGISTERED`. Não há evidência de build aprovado e não houve deploy.
- Próximo executor com acesso ao host deve registrar o lote no operador autorizado, fornecer SHA exato, rodar gates de compilação, testes e homologação isolada. Não improvisar registro alterando o banco ou scripts em produção.
