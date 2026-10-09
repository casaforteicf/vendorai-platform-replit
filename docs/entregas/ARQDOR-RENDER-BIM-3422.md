# Registro Mestre — ARQDOR-RENDER-BIM-3422

Atualização: 2026-10-09
Lote: ARQDOR-RENDER-BIM-3422
Versão: desenvolvimento da branch `codex/arqdor-3d-model-foundation` (sem release)
Módulos: Arqdor / Render Studio / Blender / importação OBJ-FBX / revisão BIM
Responsável executor: agente ChatGPT responsável pelo PR #3422; homologação/produção não atribuídas
Escopo autorizado: GLB, render fotográfico 4K, vídeo/passeio virtual, importação, materiais, geometria e pré-quantitativos sob revisão
Fonte: https://github.com/casaforteicf/vendorai-platform-replit/pull/3422
Regras: https://github.com/casaforteicf/vendorai-platform-replit/pull/3429 (AGENTS.md vigente para o trabalho, ainda não integrado à main)

## Status segregados
- Implementado sem validação completa: arquivos e rotas privadas GLB; worker Blender; presets 4K; geração de vídeo; conversor OBJ/FBX isolável e desabilitado por padrão; relatório de malhas/materiais, classificação preliminar, caixas de limites, topologia de paredes, loops de bordas e quadro preliminar de esquadrias.
- Validado tecnicamente neste lote: **não**. Nenhum build ou teste na Contabo executado nesta atualização. O corpo anterior do PR descreve testes de versões precedentes, que **não** validam os commits recentes.
- Homologado: **não**.
- Aprovado para produção: **não**.
- Publicado: **não**. PR aberto e Draft; sem merge/deploy.
- SKP, IFC, reconhecimento confiável de vãos, quadro de fabricação e instalações BIM: **pendentes**, não considerá-los implementados.

## Rastreabilidade
Branch: `codex/arqdor-3d-model-foundation`
PR: #3422 (Draft).
Head inspecionado em 2026-10-09: `cebb15956984702403d3be99d622490e77c37537`.
Referências finais recentes: `b1a90d0`, `f82dcba`, `daeb03f`, `cebb159`.
Principais arquivos afetados pelo lote:
- `tools/blender-server/arqdor_feature_contracts.py`
- `tools/blender-server/test_arqdor_feature_contracts.py`
- `tools/blender-server/arqdor_convert_obj_fbx.py`
- `tools/blender-server/blender_render.py`
- `tools/blender-server/main.py`
- `tools/blender-server/ARQDOR_3D.md`
- `artifacts/api-server/src/routes/arqdor_model_files.ts`
- `artifacts/api-server/src/lib/arqdor-model-files.ts`
- `artifacts/api-server/src/services/blenderService.ts`
- `artifacts/frontend/src/pages/arch/render-studio/RenderStudioGlbViewer.tsx`

## Evidências e dependências
- GitHub: metadados do PR #3422 lidos diretamente; aberto, Draft, sem merge; head indicado acima.
- `AGENTS.md`: consultado na branch `docs/regra-global-lotes-20261009` do PR #3429 (commit `c9467d2`); PR de regras ainda aberto.
- Vendi Browser Agent: leitura de status confirma `ok=true`, `configured=true`, runtime CDP e autonomia ligada. A consulta de conexões com `tenantKey=casaforteicf` falhou com `tenant_not_found`. Isso **não** prova falha de Contabo, mas impede afirmar acesso ao terminal ou homologação por essa rota.
- Contabo: sem log de terminal, comandos de build, evidência de execução Blender/GPU, FFmpeg ou homologação nesta atualização. Não substituir isso por estado de GitHub Actions.
- Dependências: worker Blender isolado; volume privado persistente; modelo real representativo; isolamento de tenants; configuração dos ambientes de homologação; conversores externos SKP/IFC para preservação adequada de geometrias/metadados.

## Bloqueios e próximo passo
1. Recuperar a conexão Vendi específica para acesso à Contabo de homologação sem solicitar novamente uma autorização já concedida.
2. Validar no ambiente isolado Contabo o HEAD exato com testes Python, checks TypeScript, build e conversão OBJ/FBX real; registrar comandos, logs e SHA.
3. Executar revisão de segurança do fluxo síncrono de conversão, acesso a arquivos e relatórios; impedir aprovação automática de dados BIM.
4. Homologar visualmente e funcionalmente em ambiente separado; manter PR em Draft até evidências.
5. Prosseguir com reconhecimento geométrico de aberturas e conversores SKP/IFC em lotes correlatos, sem interferir em agentes CRM/infra.

**Controle de publicação:** nenhuma alteração em produção ou main foi autorizada implicitamente por este registro. GitHub Actions não é bloqueio.


## Atualização complementar — Vendi e homologação (09/10/2026)

- Consulta de conexões com `tenantKey=vendorai`: **bem-sucedida**; tenant `1d4ea673-58d0-413a-a554-c9aca72a3121` e conexão de homologação `homolog.appvendorai.com` encontrados. O erro `tenant_not_found` anterior se referia à chave `casaforteicf`, não à indisponibilidade geral do Vendi.
- Tentativa **somente leitura** pelo Vendi na conexão salva da homologação: **falhou**, código `VENDI_HOMOLOG_AUTH_EXCHANGE_FAILED` com HTTP 401 / `upstream_token_rejected` (runId `4191a2a3-e088-4382-b228-a343e2cdb3a7`). Não houve ação de escrita.
- Acesso de terminal à Contabo, builds, testes de Blender/FFmpeg e homologação deste HEAD: **não executados, sem evidência**. A conexão de navegador não equivale a SSH nem a execução de comandos no host.
- Impedimento atualizado: autenticação do Vendi na homologação (token upstream rejeitado); precisa de diagnóstico do mecanismo de troca de credenciais, sem modificar produção. Continuar tarefas independentes e preparar validação isolada quando conexão funcional estiver disponível.


## Marco de desenvolvimento — associação de bordas e esquadrias (09/10/2026)

Objetivo: cruzar contornos fechados candidatos de paredes com objetos classificados
provisoriamente como portas/janelas. **Não certifica vãos de malha.**

- Implementação: `associate_boundary_candidates` compara caixas espaciais de
anéis de bordas com caixas de portas/janelas no mesmo referencial, sem alterar
malhas, dimensões ou quantitativos; gera `boundaryOpeningReview` no relatório
OBJ/FBX, com `openingConfirmed=false`, `fabricationReady=false`.
- Arquivos: `tools/blender-server/arqdor_feature_contracts.py`,
`tools/blender-server/arqdor_convert_obj_fbx.py`,
`tools/blender-server/test_arqdor_feature_contracts.py`.
- Commits: `914b795`, `be8de0a`, `56899cc`.
- Teste adicionado: sobreposição de contorno/esquadria e caso de objeto distante;
**não executado no ambiente Contabo**; sem evidência de Blender real ou build do HEAD.
- Dependência: acesso à homologação via Vendi segue bloqueado pelo HTTP 401
`VENDI_HOMOLOG_AUTH_EXCHANGE_FAILED/upstream_token_rejected` constatado antes.
- Estados: **implementado sem validação técnica**, não homologado, não aprovado,
não publicado. O PR #3422 permanece Draft. Próximas ações: recuperar autenticação
Vendi, executar testes/build e conversão no ambiente isolado Contabo, inspecionar
topologia em projeto real, revisar falsos positivos e não liberar quadro de fabricação.


## Marco de segurança — correlação geométrica (09/10/2026)

**Versão:** desenvolvimento, sem release. **Escopo:** robustez da identificação
preliminar dos contornos e esquadrias, sem alterar produção nem aprovar BIM.

- `342662c`: limite de 2000 relações/objetos, validação dos registros
de relações espaciais e rejeição de limites com NaN, infinito ou min > max.
- `0d86e18`: cenários de teste para dados topológicos inválidos, itens nulos,
carga acima do limite e manutenção de `openingConfirmed=false`.
- Arquivos: `tools/blender-server/arqdor_feature_contracts.py` e
`tools/blender-server/test_arqdor_feature_contracts.py`.
- **Evidência:** commits gravados no PR #3422. **Não houve execução de
`unittest` na Contabo nem no checkout exato desta revisão**; o ambiente local
não dispõe de checkout GitHub obtido por rede. Testes escritos ≠ testes passados.
- Dependência operacional: autenticação do Vendi para homologação ainda teve
401 `upstream_token_rejected` na última tentativa; não foi executado deploy.
- **Estados:** implementado sem validação técnica integral; homologado NÃO;
aprovado NÃO; publicado NÃO.
- **Próxima ação:** executar `python -m unittest -v test_arqdor_feature_contracts.py`
no checkout exato na Contabo de homologação e anexar saída e SHA; validar Blender,
conversores, build TypeScript e UI isolada antes de integrar.


## Marco de estabilização — 09/10/2026

- Head antes das correções: `c4defa5b4cea681cee72ed32dbb3cb97e56e3af9` (PR #3422 Draft).
- Correção `d9752f1`: rejeitar arestas duplicadas e limitar vértices / orçamento explícito de arestas da inspeção de contornos.
- Testes adicionados `1aff234`: duplicatas, `max_edges` inválido e limite de 200000 vértices.
- Arquivos: `tools/blender-server/arqdor_feature_contracts.py` e `tools/blender-server/test_arqdor_feature_contracts.py`.
- Verificação nesta sessão: tentativa local `git ls-remote https://github.com/casaforteicf/vendorai-platform-replit.git HEAD` **falhou por DNS** (`Could not resolve host: github.com`). Os novos testes **não foram executados**; nenhum build/Blender real na Contabo foi executado.
- O Vendi na homologação continua com último erro observado `VENDI_HOMOLOG_AUTH_EXCHANGE_FAILED 401 upstream_token_rejected`. Não alegar indisponibilidade do servidor Contabo com base nesta falha de autenticação.
- Estado: **implementado sem validação técnica integral**. Homologação: não. Aprovação: não. Publicação: não. PR permanece Draft.
- Próxima ação: autenticar o caminho Vendi/Contabo para homologação; no checkout do commit correto executar `python3 -m unittest -v test_arqdor_feature_contracts.py` no diretório `tools/blender-server`, `python3 -m py_compile arqdor_feature_contracts.py arqdor_convert_obj_fbx.py`, build e validação de conversão em Blender; registrar logs/exit codes/head testado e corrigir falhas antes de qualquer promoção.


## Correção de falso positivo no perímetro de paredes — 09/10/2026
- **Lote/versão:** ARQDOR-RENDER-BIM-3422 / desenvolvimento, sem release.
- **Implementação:** `70c76fb` exclui anéis que encostam no perímetro externo da parede na análise de correspondência com esquadrias; critérios geométricos permanecem candidatos, nunca aprovação BIM.
- **Teste acrescentado:** `028339b` cobre um anel externo coincidente com a fachada, mantendo `openingConfirmed=false` e prioridade espacial simples.
- **Arquivos:** `tools/blender-server/arqdor_feature_contracts.py`; `tools/blender-server/test_arqdor_feature_contracts.py`.
- **Evidência real:** GitHub recebeu os commits acima. Tentativa de acesso direto `git ls-remote` neste ambiente falhou por DNS de `github.com`; suíte Python/Blender/build **não executados nesta atualização**. Nenhuma evidência de execução na Contabo.
- **Estados:** implementado, **não validado tecnicamente neste HEAD**, não homologado, não aprovado, não publicado. PR Draft, sem merge/deploy.
- **Impedimento remanescente:** autenticação Vendi homologação HTTP 401 `upstream_token_rejected` na última tentativa; recuperar conexão homolog/terminal Contabo sem tocar produção.
- **Próxima ação:** rodar testes completos e conversão real na Contabo de homologação, arquivar logs e SHA; revisar recortes reais da malha e a associação à esquadria.


## Robustez de conversão de malhas grandes — 09/10/2026
- Lote `ARQDOR-RENDER-BIM-3422` — desenvolvimento sem release.
- Implementado `8f007da`: conversor agora limita a inspeção detalhada de loops a 50.000 arestas de borda **e** 200.000 vértices por objeto. Acima desse limite, emite `boundaryLoopReview.status=skipped_resource_limits` com `requiresManualReview=true`, sem descartar a importação nem certificar vãos.
- Arquivo alterado: `tools/blender-server/arqdor_convert_obj_fbx.py`.
- Diagnóstico: antes, o classificador impunha máximo de 200.000 vértices, mas o chamador só comparava a quantidade de bordas, podendo falhar a conversão de uma malha muito grande com poucas bordas.
- Evidência: commit GitHub registrado; **não foram executados testes Blender/Contabo** nesta sessão. `git ls-remote` local continua indisponível por resolução DNS de github.com. Vendi CDP indica disponibilidade, porém o último acesso à homologação retornou HTTP 401 na troca de autenticação.
- Estados: implementado sem validação técnica, não homologado, não aprovado e não publicado. PR #3422 segue Draft.
- Próxima ação: verificar correção contra modelo de malha grande em worker isolado, executar testes Python/Blender e builds no checkout Contabo com logs; resolver acesso Vendi para homologação.


## Decisão de prioridade e avanço independente — 09/10/2026
- **Determinação do solicitante:** deixar a homologação na Contabo, a autenticação Vendi e a publicação para depois. Não insistir nem bloquear melhorias independentes por essa dependência neste momento. Produção protegida.
- **Lote e versão:** ARQDOR-RENDER-BIM-3422, desenvolvimento sem release; responsável pela execução no PR #3422.
- **Escopo avançado:** tratamento defensivo de relatórios topológicos ausentes/malformados, para não promover correspondências de esquadrias a falsas evidências de aberturas.
- **Commits:** `b08b625` (contrato de classificação), `b1960bb` (regressão).
- **Arquivos:** `tools/blender-server/arqdor_feature_contracts.py`, `tools/blender-server/test_arqdor_feature_contracts.py`, este registro.
- **Evidência de implementação:** commits registrados no GitHub na branch do PR. Testes desta revisão **não executados**; não há log de Blender ou de build correspondente. Não reivindicar validação técnica.
- **Estado:** implementado sem validação técnica completa; homologado NÃO; aprovado NÃO; publicado NÃO. Nenhum merge/deploy.
- **Próxima atividade executável:** continuar as melhorias BIM e de UX independentes, preservar revisão humana e quantitativos bloqueados. Retomar testes, homologação Contabo e publicação no momento definido pelo usuário.


## Marco de quadro de esquadrias — nomes duplicados (09/10/2026)
- **Lote/versão:** ARQDOR-RENDER-BIM-3422 / desenvolvimento sem release.
- **Objetivo:** evitar quantitativos e medições indevidas quando duas malhas de portas/janelas importadas têm o mesmo nome.
- **Implementado:** `5a99207` torna explícitos `objectCountWithName`, `dimensionsMeters=null`, `scaleCalibrated=false`, `approved=false` e `fabricationReady=false` para nomes ambíguos. O relatório mantém os dois registros separados.
- **Teste acrescentado:** `1b10f4f` cobre duas janelas com nome igual sem produzir medidas de fabricação.
- **Arquivos:** `tools/blender-server/arqdor_feature_contracts.py` e `tools/blender-server/test_arqdor_feature_contracts.py`.
- **Validação:** código gravado no GitHub; testes desta alteração não executados, sem logs Contabo ou Blender real. Revisão humana obrigatória.
- **Decisão vigente:** homologação Contabo, correção da autenticação Vendi e publicação deixadas para etapa posterior a pedido do usuário. Não insistir nessas etapas agora.
- **Estados:** implementado sem validação técnica; homologação não realizada; aprovação não realizada; produção inalterada. PR #3422 permanece Draft.
- **Próxima ação independente:** implementar identificadores estáveis de objeto no relatório para diferenciar malhas importadas sem depender exclusivamente de nomes, preservando o bloqueio de fabricação.


## Marco — identidade de objetos importados (09/10/2026)
- Lote `ARQDOR-RENDER-BIM-3422`, versão em desenvolvimento (sem release).
- Objetivo: distinguir objetos Blender com nomes iguais no quadro preliminar de esquadrias.
- Implementado: IDs locais `mesh-000000` etc. para malhas do relatório de conversão; transporte de `objectId` até sugestões de paredes e correspondência de contornos; linha do quadro por `objectId` quando presente, sem depender apenas do nome.
- Commits: `da648fb`, `664ed97`, `4c22bab`, `bab2d43`.
- Arquivos: `tools/blender-server/arqdor_feature_contracts.py`, `tools/blender-server/arqdor_convert_obj_fbx.py`, `tools/blender-server/test_arqdor_feature_contracts.py`.
- Identidade é **local ao arquivo/importação** e depende da ordem das malhas, não é ID BIM global persistente nem autoriza vinculação entre versões.
- Testes adicionados para duas janelas com nome igual e para ID ambíguo; **não executados na Contabo**, sem homologação. Medidas continuam estimativas AABB, nunca de fabricação.
- Status: implementado sem validação técnica completa. Homologação Contabo e publicação **adiadas por determinação do usuário**; aprovação não realizada; produção sem alteração. PR #3422 em Draft.
- Próximo desenvolvimento independente: rastrear identidade por versão do arquivo e preparar revisão visual das esquadrias com conflitos, sem ativar quantitativos BIM automáticos.


## Marco — origem verificável de objetos por arquivo (09/10/2026)
- **Lote:** ARQDOR-RENDER-BIM-3422. **Versão:** desenvolvimento, sem release.
- **Escopo:** incluir SHA-256 do arquivo de origem e `sourceObjectKey` composto por digest+índice local da malha, preservando o identificador nos candidatos de paredes, contornos e quadro preliminar de esquadrias.
- **Commits:** `5bc6078`, `868ba16`, `e479cfa`.
- **Arquivos alterados:** `tools/blender-server/arqdor_convert_obj_fbx.py`, `tools/blender-server/arqdor_feature_contracts.py`, `tools/blender-server/test_arqdor_feature_contracts.py`, este Registro Mestre.
- **Limitação obrigatória:** o índice da malha é associado à versão exata do arquivo, não identifica semanticamente o mesmo componente após reexportação/edição; não é GUID BIM/IFC estável. Não autoriza aprovar geometria, vãos, medidas ou quantitativos.
- **Evidências:** código e testes novos registrados na branch do PR #3422. **Testes não executados** nesta revisão; validação completa permanece pendente.
- **Situação:** implementado sem validação técnica, não homologado, não aprovado, não publicado. Homologação Contabo/Vendi e publicação continuam adiadas a pedido do usuário.
- **Próxima etapa independente:** estruturação de fila de revisão por conflitos e auditoria de identidades, sem liberação automática para fabricação.


## Revisão concorrente e isolamento por arquivo de origem — 09/10/2026
- Lote: ARQDOR-RENDER-BIM-3422; versão: desenvolvimento sem release.
- Durante esta execução, a branch avançou por outro executor e já continha a identidade por SHA-256 (`sourceSha256`, `sourceObjectKey`) e testes correlatos. Essas mudanças foram preservadas, sem duplicação nem sobrescrita.
- Correção complementar `7f221ea`: ao resolver linhas do quadro, verificar também `sourceObjectKey` quando fornecido, impedindo confusão entre duas importações distintas com o mesmo índice local `mesh-000001`.
- Teste de regressão `392a2fc`: dois modelos de origem diferentes com mesmo nome e índice de janela; registros continuam distintos e `fabricationReady=false`.
- Arquivos alterados por esta continuação: `tools/blender-server/arqdor_feature_contracts.py`, `tools/blender-server/test_arqdor_feature_contracts.py` e este registro.
- Validação: commits e testes escritos no GitHub; **testes não executados nem homologados** neste marco. Revisão BIM e bloqueio de quantitativos permanecem obrigatórios.
- Homologação Contabo/Vendi e publicação seguem **adiadas por determinação do usuário**. Produção sem alterações; PR #3422 Draft.
- Próximo passo independente: vincular objetos importados a sessões e versões explícitas do projeto, preparando UI de revisão de conflitos, sem inferir correspondência estável entre versões diferentes do modelo.


## Marco — fila de revisão BIM por versão (09/10/2026)

- **Lote/versão:** ARQDOR-RENDER-BIM-3422 / desenvolvimento sem release.
- **Objetivo:** preparar os dados para revisão de esquadrias por versão de projeto sem vincular automaticamente importações distintas.
- **Implementação:** `create_opening_review_queue(schedule, source_sha256, project_version)` retorna uma fila somente leitura de candidatos, identificados pela combinação da versão, SHA-256 original e índice da malha. Rejeita identificadores inconsistentes, duplicados e hashes de outro arquivo. Todas as linhas exigem revisão humana, `fabricationReady=false`, `geometryApproved=false`, `quantitiesEnabled=false`.
- **Escopo não implementado:** interface visual, persistência da revisão, registro de aprovador e associação BIM definitiva. A fila é um contrato de dados preparatório.
- **Commits:** `2cd86c5` e `1b25272`; arquivos `tools/blender-server/arqdor_feature_contracts.py` e `tools/blender-server/test_arqdor_feature_contracts.py`.
- **Evidência:** commits gravados no PR #3422. Testes foram adicionados, porém **não foram executados** nesta etapa.
- **Estados:** implementado sem validação técnica; homologação Contabo e publicação adiadas pelo solicitante; produção inalterada.
- **Próxima ação executável:** preparar contrato de decisão manual e histórico auditável isolado, evitando qualquer aprovação baseada só na importação.


## Marco — fila de revisão de esquadrias (09/10/2026)

- **Lote:** ARQDOR-RENDER-BIM-3422; **versão:** desenvolvimento sem release; **responsável:** agente da frente Arqdor.
- **Escopo:** priorizar revisão humana de registros provisórios por identidade ambígua, ausência de parede candidata única, medidas não conferidas e falta de evidência de contorno correspondente.
- **Implementação:** função pura `build_opening_review_queue`, integrada à resposta de importação como `openingReviewQueue`. Ordena alta/média prioridade sem certificar abertura ou permitir fabricação/quantitativos.
- **Commits:** `abb28e7`, `98de96b`, `96fff84`.
- **Arquivos alterados:** `tools/blender-server/arqdor_feature_contracts.py`, `tools/blender-server/arqdor_convert_obj_fbx.py`, `tools/blender-server/test_arqdor_feature_contracts.py`, este registro.
- **Evidência:** commits confirmados pela API do GitHub; novos testes escritos mas **não executados**. Não houve build, homologação ou deploy. A fila é dado de relatório, ainda não interface visual de revisão.
- **Coordenação:** antes deste lote, o PR #3422 apontava para `9bd158a15ef996d29786ea8aa03356dc4d68e629`, HEAD diferente do último registrado na conversa; as alterações foram feitas sobre a branch atual, preservando intervenções existentes.
- **Estado:** implementado sem validação técnica, não homologado, não aprovado e não publicado. Homologação Contabo/Vendi e publicação continuam adiadas por orientação do usuário. PR permanece Draft.
- **Próximo desenvolvimento independente:** UI de revisão filtrável, vínculo de achados a objeto/versão e mecanismos explícitos de conferência manual, sem liberar produção.


## Marco — contrato de decisões manuais auditáveis (09/10/2026)
- **Lote/versão:** ARQDOR-RENDER-BIM-3422 / desenvolvimento sem release.
- **Objetivo:** preparar eventos de decisão sobre candidatos de esquadrias, vinculados à versão, origem, objeto, responsável, justificativa e horário UTC.
- **Implementado:** `record_opening_review_decision` produz evento imutável proposto em memória; exige chave de revisão única, responsável, motivo e timestamp. Decisões permitidas: encaminhar à revisão detalhada, rejeitar candidato ou pedir informações. Não existe comando para aprovar fabricação nessa função.
- **Escopo não concluído:** autenticação/autorização do revisor, gravação persistente e interface da fila. `persisted=false` e `requiresAuthorizedAuditStore=true` identificam a limitação.
- **Commits:** `65edeaa` (contrato), `84cb109` (testes para decisão válida e recusas).
- **Arquivos alterados:** `tools/blender-server/arqdor_feature_contracts.py`, `tools/blender-server/test_arqdor_feature_contracts.py` e este registro.
- **Validação:** testes adicionados, não executados nesta atualização; sem build/homologação Contabo.
- **Estados:** implementado sem validação técnica integral, não homologado, não aprovado, não publicado. PR #3422 permanece Draft; produção inalterada.
- **Decisão vigente:** homologação Contabo, acesso Vendi e publicação permanecem adiados a pedido do usuário.
- **Próxima tarefa independente:** avançar no contrato de histórico ordenado e na preparação do componente visual de revisão, com controles de autorização antes de permitir persistência de decisões.
