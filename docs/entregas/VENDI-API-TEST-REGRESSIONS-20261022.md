# VENDI-API-TEST-REGRESSIONS-20261022 — versão 1

Atualizado em 22/10/2026. Estado: implementado e verificado localmente; homologação desta versão pendente. Sem merge ou deploy.

## Escopo, base e dependências
Continuidade autorizada para resolver as 72 falhas históricas e erros de execução da suíte completa da API, preservando isolamento entre tenants, CRM e Vendi. Branch `fix/api-test-regressions-20261022`, base remota `1183a8df93a5c3199af5993f48b7c4c4df65d860` da branch `fix/api-typecheck-20261022` (PR #3594), árvore `957bab277af1a2fd947a47591b7b50c0f3e28839`. Depende de #3594 e #3593. PR #3596: https://github.com/casaforteicf/vendorai-platform-replit/pull/3596 (rascunho). Implementação remota `ac3618541592556c7465c75700da93ee876545af`, árvore testada `1a614204db5b07f83885579b86f55a62fe1d60e5`. O commit posterior altera somente este registro.

## Correções de produto
- Atividades: GET, PATCH e DELETE por ID passam pela função existente `canAccessActivity`, além dos filtros de tenant e demais regras já presentes. Uma negativa de escopo impede leitura e mutações; testes cobrem a negativa sem operações de escrita.
- Mensagens: POST verifica acesso à conversa antes de resolver mídia, despachar ou inserir mensagem. A negativa não insere mensagem.
- Marketing: a classificação de formato explicitamente declarado como conversão prevalece sobre menções secundárias a prova/CTA. Corrige Landing Page classificada como prova.

Nenhuma alteração de esquema, permissões do banco, infraestrutura, credenciais ou dependências. Dados e recursos em produção não foram modificados.

## Correções da suíte e motivos
As 72 falhas não representavam 72 bugs do produto. Foram corrigidos contratos antigos de mocks e fixtures, além das falhas de autorização e classificação descritas acima:
- Consultas Drizzle simuladas são awaitable antes/depois de limit, orderBy e joins; preservam inspeção dos filtros pelos testes e suportam subqueries. Mocks parciais mantêm exports de tabelas reais sem executar consultas reais pelo db original.
- Fixtures de análise incluem validação de lead e leitura do contexto do tenant antes do lock e dos limites de uso. Mantidos asserts de cooldown, limite horário, concorrência e escopo.
- Fixtures CRM incluem responsável e lead ativo; fechamento comercial inclui etapa/função/responsável válidos e transação. O teste com catálogo válido ainda exige o guardrail PLANO_OBRIGATORIO quando o plano falta.
- Arquivar negócio exige motivo e preserva registro; excluir lead é exclusão lógica. Testes verificam timestamps e ausência de DELETE físico em vez de exigir HTTP 204 de fluxos antigos.
- Storage isola o serviço de proteção de pastas, incluindo teste de negativa HTTP 423 e ausência de acesso ao arquivo, além dos casos entre tenants.
- Consentimento de cônjuge simula ausência real de duplicata; propostas mantêm casos de negativa por tenant e responsável.
- Testes Vendi em .mts usam o executor Vitest configurado, mantendo todos os asserts; deixam de executar por node:test fora da contagem da suíte.
- Contratos estáticos refletem normalização da chave de tenant, precedência de allowWrite=false, composição com perda e preço mestre por join. E-mail verifica autenticação e guard por rota, sem depender de número fixo de comentários.
- OAuth WhatsApp usa ID numérico e segredo fictício pareados e mock de banco; não depende de carregar todos os schemas nem de credenciais reais.
- Arqdor preserva o algoritmo existente: teste de pátio usa lote 15x28; teste novo confirma espinha linear no limite de profundidade 15x30. O algoritmo não foi alterado para satisfazer fixture incompatível.
- Relevância VIE mantém limiar 60: fixture relevante contém contexto suficiente; teste adicional comprova que sinal setorial de 59 pontos continua excluído. Nenhum limiar foi reduzido.

## Evidências
Ambiente local isolado, Node 24.19.0 / pnpm 10.26.1. Não substitui a validação obrigatória na Contabo.
- Base do lote: suíte completa com 72 falhas, 1111 aprovados, um ignorado, quatro suites sem execução e um erro não tratado.
- Suíte completa final: `vitest run` — 205 arquivos passaram; 1221 testes passaram, um ignorado; zero falhas e zero erros não tratados. Log `/tmp/vendorai-test-repair-all-final2.log`, duração 28,93 s.
- TypeScript completo da API: zero erros, `NODE_OPTIONS=--max-old-space-size=4096 tsc -p artifacts/api-server/tsconfig.json --noEmit`. Log `/tmp/vendorai-test-repair-typecheck-final2.log`.
- Build API e worker: passou via `node build.mjs`; log `/tmp/vendorai-test-repair-build.log`, 3,667 s.
- `git diff --check`: passou.
- Consulta real somente leitura ao plugin VendorAI Contabo2, `vendi_contabo_status(action=homologHealth)`: resposta `{"status":"ok"}`. Isto confirma somente saúde do ambiente existente, não instalação nem validação desta versão.

Os logs mencionados são temporários desta sessão. Registrar evidência durável no host isolado na próxima execução. O commit deste registro versiona os arquivos testados; PR/commit remoto serão acrescentados após criação.

## Pendências e próximo passo
1. Revisar o PR e executar tipos/build/testes do commit em ambiente isolado na Contabo, guardando logs permanentes e verificando os fluxos autorizados/rejeitados por empresa e responsável.
2. Homologar antes de qualquer promoção. Não houve merge, restart, alteração Nginx ou publicação Pages neste lote.
3. O plugin conectado oferece saúde e operações fixas em lotes previamente registrados, sem shell arbitrário. Não é possível instalar este commit ou registrar seu manifesto por essa ferramenta; depende da sessão SSH do operador/fluxo de release autorizado.
4. O teste de navegador visual depende de `VISUAL_QA_BROWSER_TEST=1` e continua ignorado conforme a configuração existente; não foi desabilitado teste neste lote. Testes unitários não comprovam migrações/RLS nem a jornada completa em ambiente real.

Responsável por implementação/registro: Codex. Execução SSH/registro no host: operador da VPS. Estado de homologação, aprovação, merge e produção: pendentes para esta versão.

## Correção do build Contabo — continuidade 3596/3597
- Operador registrou VENDI-3596 para `db354ba468243572477d85652607a69d30cc9882`. Build remoto falhou no Step 5: `ERR_MODULE_NOT_FOUND` para Vitest. O Dockerfile executava `node --test` antes de instalar dependências, embora os dois arquivos já usem Vitest. Log informado pelo operador: `/root/vendorai-mcp-backup/build-3596-20261023-010515.log`. Nenhum deploy solicitado.
- `Dockerfile.deploy` agora instala dependências primeiro e executa os mesmos dois arquivos com `pnpm --filter @workspace/api-server exec vitest run`, preservando os gates de tipos e builds seguintes.
- Validação local direcionada: Vitest 4.1.8, 2 arquivos, 11 testes aprovados, exit 0. Docker build completo corrigido ainda não executado; validação Contabo pendente. A chamada inicial ao pnpm global local abortou por incompatibilidade do gerenciador/ausência de TTY; o binário Vitest já instalado foi executado diretamente, sem reinstalar dependências.
- Próxima tentativa deve usar novo manifesto/lote VENDI-3597 para não sobrescrever o manifesto imutável 3596. Sem merge ou mudança em produção.
