# VENDI-TYPECHECK-20261022 — v1

Atualizado em 22/10/2026. Estado: frontend validado localmente, validação integrada bloqueada; sem homologação ou publicação deste lote.

## Objetivo e versão
Corrigir os erros comprovados pelo typecheck completo do frontend da imagem 3593 e preservar os fluxos de CRM, Marketing, Arqdor e operação. Branch isolada: `fix/typecheck-contabo-20261022`. Base remota: `d60222ec1d6a0eb9a760967b39c0aa570c6f0cd9`, árvore `36ac3a2aaa14a865d5e41a250955e0fb45166854`. O commit que contém este registro versiona os arquivos correspondentes. PR em preparação; sem merge.

## Alterações
- Cabeçalhos HTTP tipados sem valores undefined; opções de React Query na posição correta e com as chaves de cache geradas.
- Campos opcionais e eventos de telefone tratados corretamente no cadastro de clientes; valor monetário enviado como número ao criar negócios.
- Revisão de orçamento importado movida para o componente que possui o estado e a interface de criação. A edição deixa de referenciar setters exclusivos da criação.
- Consulta e contratos do domínio de instalação restaurados com base na resposta real de `/work-cards/:id/installation`; consulta habilitada somente nas etapas de instalação da execução.
- Referências ausentes de estado, toast, imports e funções corrigidas; scripts dinâmicos isolados como módulos.
- Callbacks, efeitos, tipos de buffers, legendas de vídeo e seleção de etapas ajustados sem desativar strict nem adicionar ts-ignore.
- OpenAPI corrigido: indentação indevida nos filhos/sócios; contratos alinhados aos campos existentes no backend, incluindo representante, metadados, atribuição de leads, cores/rede de parceiros, atividades, catálogo e URL de logo. Tipos e validadores regenerados em processos separados, com teste que detecta descarte de campos de atribuição/metadados. A função representante_comercial e SKU do site público foram preservados na origem.

## Validação local
Dependências instaladas com pnpm 10.26.1, conforme packageManager do repositório; lockfile preservado.

| Verificação | Resultado |
|---|---|
| Typecheck das bibliotecas (`tsc --build`) | OK |
| Typecheck MCP | OK, saída 0 |
| Frontend TypeScript completo, sem cache | OK, saída 0 em execução sem cache |
| Build Vite frontend | OK, build final em 23,90 s |
| Limites de bundles | OK, todos os limites críticos |
| Testes de resumo/integridade Vendi | 11 passaram |
| Contratos de cadastro, responsável e marca | 3 passaram |
| Regressões de quantidade, rascunho criptografado, recuperação e Concept mobile | 12 passaram, 4 arquivos |
| Auditoria UI | Bloqueada tanto na base quanto nesta revisão: HTTP 175/170, feedbacks 58/56; sem aumento nesses indicadores |
| API TypeScript completo com heap 4096 MiB | Falhou com 508 diagnósticos; não declarar API aprovada |

Evidências desta sessão: `/tmp/vendorai-frontend-confirm3.log`, `/tmp/vendorai-libs-confirm3.log`, `/tmp/vendorai-contract-tests.log`, `/tmp/vendorai-codegen-final.log`, `/tmp/vendorai-mcp-typecheck.log`, `/tmp/vendorai-frontend-build-final.log`, `/tmp/vendorai-bundle-final.log`, `/tmp/vendorai-vendi-tests-final.log`, `/tmp/vendorai-frontend-tests-final.log`, `/tmp/vendorai-api-typecheck.log`, `/tmp/vendorai-ui-baseline.log`, `/tmp/vendorai-ui-audit.log`. São logs locais de validação, não logs da Contabo.

## Impacto e pendências
A API completa antes encerrava por falta de memória; a execução local revelou 508 erros, incluindo construcao (66), browser-agent (49) e browser-discovery (43). Não foram corrigidos neste conjunto de alterações de frontend/contrato. Precisam de triagem própria e comparação da versão de base antes de promoção.

Não alterar o baseline de auditoria nem silenciar erros para aprovar o gate. Preservar autenticação, restrições por tenant e revisão de importação.

## Homologação e publicação
Pendente validar o commit em ambiente isolado da Contabo, conforme AGENTS.md. Não há ferramenta de shell SSH arbitrário disponível nesta sessão; o operador conectado requer lote/manifesto registrados. Não foi alegada execução remota nem alterado container ativo. Sem deploy da API, troca de frontend, merge ou promoção em produção neste lote. Preservar a versão/backup existente.

Próximo passo: versionar o PR, validar na Contabo e tratar os diagnósticos da API e o gate UI antes da promoção. Responsável técnico: Codex; execução remota depende do operador registrado ou terminal SSH do proprietário.
