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


## Lote ampliado — histórico e indicadores de revisão (09/10/2026)
- **Lote / versão:** ARQDOR-RENDER-BIM-3422 / desenvolvimento, sem release.
- **Entregas agrupadas (2 melhorias):**
  1. `summarize_opening_review_history` reconstrói a situação mais recente de cada esquadria a partir de eventos por versão e origem; ordena por horário UTC, contabiliza eventos e bloqueia informações de outra versão/origem.
  2. `opening_review_dashboard` fornece contadores de conflitos, candidatos e situações de revisão para apoiar a futura UX do quadro de esquadrias.
- **Segurança BIM:** nenhum status aprova geometria, fabricação ou quantitativos. A revisão detalhada por profissional continua obrigatória.
- **Commits de código/testes:** `f935a30`, `d173bcd`, `96f11e8`, `2d37714`.
- **Arquivos:** `tools/blender-server/arqdor_feature_contracts.py`, `tools/blender-server/test_arqdor_feature_contracts.py` e este Registro Mestre.
- **Validação:** testes de regressão adicionados para replay cronológico, rejeição de eventos de outra origem e contadores de conflito; **não executados no ambiente Contabo** e nenhuma afirmação de testes aprovados.
- **Estados:** implementado sem validação técnica integral; homologado NÃO; aprovado NÃO; produção NÃO publicada; PR #3422 Draft.
- **Decisão vigente do usuário:** homologação Contabo, acesso Vendi e publicação adiados; continuar lotes independentes de maior alcance sem cobrar novas autorizações.
- **Próximas frentes:** conectar estes contratos à interface de revisão visual e ao armazenamento de histórico com autorização, sem ativar produção.


## Lote ampliado — workspace de revisão e causas de conflito (09/10/2026)
- **Lote/versão:** ARQDOR-RENDER-BIM-3422 / desenvolvimento, sem release.
- **Melhorias agrupadas:**
  1. Contrato de dados `prepare_opening_review_workspace` com busca por nome/identificadores, filtro por status, modo somente conflitos, limite de resultados e ordenação para priorizar inconsistências, preservando contadores globais.
  2. Causas estruturadas de conflito na fila: `ambiguous_or_missing_measurement`, `unresolved_wall_host`, `uncalibrated_or_missing_dimensions`. Ausência de calibração impede tratar a medição como livre de conflitos.
  3. Regressões para ordenação, filtros, limite inválido, calibração ausente e nenhuma aprovação automática de fabricação.
- **Commits:** `841933e`, `29028a9`, `11438e3`, `7ada783`.
- **Arquivos:** `tools/blender-server/arqdor_feature_contracts.py`, `tools/blender-server/test_arqdor_feature_contracts.py` e este Registro Mestre.
- **Escopo não concluído:** componente React, rotas de API, persistência dos eventos, política de acesso por tenant e homologação. Os novos contratos são funções puras preparatórias, não uma tela utilizável em produção.
- **Validação:** testes escritos mas não executados neste marco; sem resultados de build/Blender real. Estados: implementado sem validação técnica, homologado NÃO, aprovado NÃO, publicado NÃO.
- **Decisão do usuário:** deixar homologação Contabo, desbloqueio de acesso do Vendi e publicação para depois. Não executar merge/deploy; PR #3422 segue Draft.
- **Próximo conjunto independente:** alinhar payload da futura UI ao contexto de projeto/tenant e validar autorização antes de integrar quaisquer ações persistentes.


## Lote ampliado — interface de conferência de esquadrias (09/10/2026)
- **Lote / versão:** ARQDOR-RENDER-BIM-3422 / desenvolvimento, sem release.
- **Implementado no frontend:** componente `RenderStudioOpeningReview.tsx` com carregamento manual do relatório JSON, conferência de SHA-256 do modelo selecionado, identificação de janelas/portas, contagem de pendências, busca, filtro de conflitos, medidas aproximadas e avisos de segurança BIM. Arquivo limitado a 2 MB e 2000 registros; rejeita IDs duplicados ou incorretos; nenhuma escrita/persistência é efetuada.
- **Integração:** `RenderStudioModels.tsx` carrega o componente sob demanda e mantém a calibração e o visualizador existente. Seção de render renumerada para 5.
- **Commits:** `fdaef06` (componente) e `208ff12` (integração frontend).
- **Limitação de vinculação:** relatórios de conversão OBJ/FBX descrevem o SHA-256 do arquivo original, enquanto o registro de modelos GLB pode descrever o SHA do GLB convertido; nesses casos, o componente rejeitará corretamente a comparação e será necessário um vínculo explícito original→GLB na API antes do fluxo completo. **Não é possível afirmar revisão funcional de OBJ/FBX convertidos nesse caminho.**
- **Escopo ainda pendente:** endpoint autenticado de relatórios vinculados à versão, renderização 3D destacando a malha, persistência/autorização das decisões, validação TypeScript, testes automatizados da UI e homologação.
- **Validação:** alterações registradas no GitHub; testes/build não executados nesta sessão; PR segue Draft; homologação Contabo e produção adiadas conforme solicitação, nenhum deploy/merge.
- **Próximo conjunto executável:** introduzir vínculo seguro entre relatório de conversão e versão GLB, reutilizando isolamento de tenant e projeto, antes de disponibilizar revisão como funcionalidade plena.


## Lote ampliado — vínculo privado OBJ/FBX → GLB → revisão (09/10/2026)
- **Lote/versão:** ARQDOR-RENDER-BIM-3422 / desenvolvimento sem release; PR #3422 Draft.
- **Melhorias integradas:** `ModelFileStore.conversionReport()` lê o relatório privado da conversão vinculada à versão GLB, verifica SHA-256 do GLB e a origem do JSON antes de retornar candidatos; rota autenticada e isolada por tenant/projeto `GET /arch/projetos/:projectId/model-files/:modelId/conversion-report`; o painel React agora consulta o relatório automaticamente pela rota e confere `modelSha256`/identidade dos objetos, sem exigir carregamento manual do arquivo JSON.
- **Commits:** `c55d713`, `c3346fb`, `e163ce1`, `668db4f`.
- **Arquivos:** `artifacts/api-server/src/lib/arqdor-model-files.ts`, `artifacts/api-server/src/routes/arqdor_model_files.ts`, `artifacts/frontend/src/pages/arch/render-studio/RenderStudioOpeningReview.tsx` e `RenderStudioModels.tsx`.
- **Proteções:** o relatório é leitura privada e não permite aprovar fabricação, geometria nem quantitativos; GLB nativo sem relatório de conversão retorna 404, comunicado na tela. Conversão OBJ/FBX permanece desabilitada por padrão.
- **Limites:** a ligação SHA original→GLB foi escrita, mas não verificada em execução real; criação/persistência autorizada de decisões, destaque no visualizador 3D, calibração técnica e controle granular por usuário ainda pendentes.
- **Validação:** sem execução de testes, build ou Blender nesta sessão; não afirmar aprovação técnica. Homologação Contabo e publicação adiadas por decisão do usuário; nenhum merge/deploy em produção.


## Integração da revisão com câmera 3D — 09/10/2026
- **Lote / versão:** ARQDOR-RENDER-BIM-3422 / desenvolvimento sem release.
- **Melhoria implementada:** ação `Localizar no 3D por nome` nas linhas do relatório de esquadrias. O diálogo de modelos propaga o nome selecionado ao GLB Viewer, que enquadra a câmera quando encontrar **exatamente uma** malha com esse nome no GLB. Sem malha ou com nomes repetidos: não adivinha a correspondência nem modifica a geometria; informa a necessidade de conferência manual.
- **Commits:** `8dd22e2`, `bcb7cc9`, `c204198`.
- **Arquivos:** `artifacts/frontend/src/pages/arch/render-studio/RenderStudioGlbViewer.tsx`, `RenderStudioOpeningReview.tsx`, `RenderStudioModels.tsx` e Registro Mestre.
- **Limites explícitos:** nomes da malha convertida podem variar do nome no OBJ/FBX; não se equiparam IDs locais Blender e IDs GLB. A ação faz foco por nome único, não destaque certificado da esquadria e não libera fabricação/quantitativos. Se a câmera do viewer ainda não estiver carregada, o foco não é garantido nesta versão.
- **Validação:** commits gravados no PR #3422, sem teste/build/visualização real executados nesta atualização. Não homologado; não aprovado; produção inalterada.
- **Decisão vigente:** homologação Contabo, acesso Vendi e publicação adiados. PR #3422 continua Draft, sem merge ou deploy.
- **Próximo avanço independente:** identidade de nós GLB gravada no relatório durante conversão, evitando dependência de nomes, e cobertura de testes do fluxo frontend/API.


## Programa aprovado A–E — execução agrupada (09/10/2026)

Autorização: seguir nos cinco lotes A (esquadrias/revisão), B (reconhecimento geométrico), C (BIM paramétrico), D (render/UX), E (documentação e integrações), mantendo Contabo/Vendi e publicação adiados.

| Lote | Marco vigente | Estado real |
| --- | --- | --- |
| A | Identidade da malha, quadro preliminar, painel de revisão, câmera por nome único, API privada | Parcialmente implementado; persistência autorizada e correspondência GLB definitiva pendentes |
| B | Limites de malha, topologia e candidatos de vãos | Parcial; detecção confiável por geometria e classificação de pavimentos pendentes |
| C | Novo contrato `inspect_parametric_wall` valida parede paramétrica proposta em planta, espessura/altura e candidatos de abertura sem sobreposição | Prévia geométrica pura; editor 2D/3D sincronizado e malha editável ainda não implementados |
| D | Novo contrato `validate_professional_render_job` valida preset 4K e parâmetros de vídeo | Admissão de job sem execução; UX profissional, Blender real e GPU pendentes |
| E | Novo contrato `draft_architectural_deliverables` prepara contagem preliminar de elementos e estados bloqueados de documentos | Prévia; geração IFC/PDF/cortes/quantitativos confiáveis e integração a orçamento/execução pendentes |

Commits desta execução: `d0784a7` (contratos geométricos/documentos/render) e `8a557f7` (regressões). Arquivos: `tools/blender-server/arqdor_feature_contracts.py`, `tools/blender-server/test_arqdor_feature_contracts.py` e este Registro Mestre.

**Validação:** commits confirmados na branch; testes escritos, não executados; sem Blender/build/Contabo. **Homologação:** adiada. **Aprovação/produção:** não. **Merge:** não. Não declarar os lotes A–E completos.

**Próximas entregas dentro da autorização:** correlacionar geometria e IDs GLB, revisar a segurança e persistência do histórico de esquadrias; avançar modelo paramétrico para 2D/3D e formatos IFC/SKP; integrar job de render ao worker e quadro técnico aos módulos de orçamento/biblioteca, mantendo flags desabilitadas até validação.


## Marco BIM paramétrico — projeção 2D de paredes e aberturas (09/10/2026)
- **Lote/versão:** ARQDOR-RENDER-BIM-3422 / desenvolvimento sem release; avanço do lote C e base dos lotes B/E.
- **Entregue:** função pura `draft_parametric_floor_plan` que projeta cada parede validada em um polígono 2D conforme espessura e orientação, incluindo linha central e guias de portas/janelas pelas distâncias paramétricas da mesma fonte de dados.
- **Proteções:** rejeita paredes/aberturas inválidas, preserva estados `intersectionsResolved=false`, `openingVoidsApplied=false`, `geometryApproved=false`, ou seja, não finge que já houve operações booleanas nem interseções BIM resolvidas.
- **Commits:** `a8446a9` (implementação), `352d64d` (teste de parede 4 m, espessura 0,2 m, janela no offset 1 m, limites de abertura).
- **Arquivos:** `tools/blender-server/arqdor_feature_contracts.py`, `tools/blender-server/test_arqdor_feature_contracts.py`, este Registro Mestre.
- **Estado:** código registrado, testes adicionados **não executados nesta sessão**; sem comprovação de editor 2D/3D real, edição sincronizada, IFC, quantitativos ou cortes. Homologação Contabo e publicação adiadas por determinação do usuário, PR #3422 Draft, sem merge/deploy.
- **Próximos passos independentes:** ligar a projeção à interface de edição com histórico/versões, implementar geometria 3D derivada e detecção de interseções; integrar posteriormente documentação e orçamento mediante conferência técnica.


## Lote C ampliado — correspondência 2D/3D e encontros de paredes (09/10/2026)
- **Lote/versão:** ARQDOR-RENDER-BIM-3422 / desenvolvimento sem release, relacionado aos lotes B, C e E.
- **Entregas:** `draft_parametric_wall_solids` deriva bases e topos de prismas e descritores de volumes candidatos de portas/janelas a partir do mesmo conjunto de parâmetros da planta 2D. `draft_wall_centerline_intersections` detecta cruzamentos de linhas centrais e encontros de extremidades, sem editar ou unir geometrias.
- **Commits de código:** `e755f6c` (descritores 3D), `26417b0` (interseções preliminares).
- **Commits de testes:** `84c832d` (consistência 2D/3D, janela), `39276c8` (cruzamento e encontro).
- **Arquivos:** `tools/blender-server/arqdor_feature_contracts.py`, `tools/blender-server/test_arqdor_feature_contracts.py`, este Registro Mestre.
- **Limites explícitos:** os prismas ainda não são malhas fechadas, não há subtração booleana de vãos nem fusão/miter de encontros. Detector de linhas centrais é preliminar e não substitui verificação topológica/IFC ou resolução de paredes colineares.
- **Validação:** alterações escritas no GitHub; testes adicionados mas **não executados nesta atualização**. Não afirmar editor BIM sincronizado nem entregáveis técnicos concluídos.
- **Estados:** implementado parcialmente sem validação completa; homologação Contabo adiada, publicação não realizada, PR #3422 Draft, sem merge/deploy.
- **Próximas frentes autorizadas:** preparar malhas reais com vazios por abertura, sincronização de edição 2D/3D, snap, cotas, identificação de pavimento e testes com modelos reais; preservar autorização humana para documentos técnicos.


## Lote integrado — malha com aberturas reais por parede (09/10/2026)

- **Escopo autorizado:** posições de portas/janelas, encontros, malhas fechadas, recortes, uniões e edição 2D/3D.
- **Implementado nesta etapa:** `tools/blender-server/arqdor_parametric_mesh.py` cria malhas de superfície de paredes individuais a partir de um mesmo conjunto paramétrico utilizado pela projeção 2D. Divide os eixos local X/Z nas bordas de portas/janelas, remove células correspondentes aos vãos e acrescenta faces internas de revelo. Inclui `mesh_parametric_project` para agrupar malhas e candidatos a encontros.
- **Entregas anteriores reutilizadas:** `draft_wall_centerline_intersections` identifica cruzamentos e encontros preliminares. Isso **não resolve automaticamente** as uniões físicas.
- **Commits:** `a106247` (gerador da geometria de parede), `ff26716` (testes para aberturas, faces, encontros e bloqueio de aprovação).
- **Validação:** testes adicionados sem execução e sem Blender ou certificação topológica. Declaração de superfície local fechada ainda exige validação geométrica, sobretudo para vãos atravessando bordas e interfaces de paredes.
- **Pendente neste lote:** resolver junções via núcleo geométrico/booleans robusto; sincronização interativa de edição em 2D/3D com histórico de mudanças e persistência; testes visuais e topológicos; integração com export IFC e detalhamento técnico.
- **Segurança:** `globalWatertight=false`, `geometryApproved=false`, `quantitiesEnabled=false`. Dados não servem para fabricação, compras ou quantitativos sem conferência.
- **Estados:** código em desenvolvimento no PR #3422 Draft; sem merge; homologação Contabo e publicação adiadas.


## Lote integrado de geometria e editor 2D/3D — 09/10/2026

**Pedido original:** concluir em lote posições de portas/janelas 3D, encontros/cruzamentos, malhas fechadas, recortes, união de paredes e edição sincronizada 2D/3D.

**Entregue neste conjunto:**
- `tools/blender-server/arqdor_parametric_mesh.py`: malhas por parede com subdivisão e faces de revelo nos vãos retangulares; `mesh_parametric_project` mantém informações sobre encontros não resolvidos.
- `tools/blender-server/test_arqdor_parametric_mesh.py`: cenários de parede simples, janela, porta e cruzamento (testes escritos, **não executados nesta sessão**).
- `RenderStudioParametricEditor.tsx`: protótipo frontend com planta SVG editável por pontos, snap 25 cm, parâmetros de altura/espessura, criação/edição/exclusão de aberturas e projeção 3D SVG alimentada pelo mesmo estado React, com validação de aberturas e sobreposição.
- `RenderStudioModels.tsx`: editor paramétrico carregado como componente isolado junto ao fluxo de revisão existente.
- **Commits desta rodada:** `c3a141a` (editor 2D/3D), `509f9bb` (integração) e registro mestre deste marco; `a106247` e `ff26716` são os commits anteriores do gerador.
- **Limitações reais:** a projeção SVG 3D é uma prévia e não renderização de malha CSG; mudanças do editor são estado local, não atualizam o GLB nem persistem no projeto; os encontros L/T/cruz apenas são diagnosticados — uniões booleanas robustas ainda não implementadas; a afirmação de malha global estanque ou pronta para quantitativos não seria correta.
- **Validação:** não foram executados build frontend, testes Python ou Blender real; integração e integridade topológica seguem sem homologação.
- **Estado:** lote parcialmente implementado, **não concluído**. Homologação Contabo adiada, nenhum merge ou deploy, produção inalterada, PR #3422 Draft.
- **Próximo trabalho obrigatório para conclusão do pedido:** núcleo sólido com junções robustas, aplicação de malhas no visualizador, persistência versionada e testes funcionais de ida/volta entre vistas.


## Lote de continuidade — rascunho paramétrico persistente por modelo (09/10/2026)
- **Implementação:** `ModelFileStore.parametricDrafts` e `saveParametricDraft` gravam rascunhos de paredes/aberturas isolados por tenant/projeto/modelo e SHA-256 de GLB, com revisão de gravação e autor/data. Rotas autenticadas GET/PUT `/:modelId/parametric-draft` utilizam o escopo já validado de tenant, usuário e projeto. O editor 2D/3D lê a revisão existente e permite salvar alterações locais.
- **Commits:** `d3d567e` (storage), `d9de287` (API), `86f736d` (editor), `7d10a88` (integração).
- **Estado:** integração no código; execução de testes, verificação TypeScript e homologação **não efetuadas** nesta atualização. A API retorna conflito para versão divergente, mas a verificação revisão→rename não é transacional em gravações concorrentes; não tratar controle de concorrência como totalmente resolvido.
- **Pendências críticas para considerar lote concluído:** uniões físicas robustas L/T/cruz e malha global estanque, geometria paramétrica efetivamente renderizada no 3D (prévia atual SVG), versionamento transacional com autorização granular, validação completa de interseções/aberturas e testes reais ponta a ponta.
- **Homologação Contabo e publicação:** adiadas. PR #3422 Draft, sem merge/deploy, produção inalterada.


## Avanço de validação geométrica e concorrência — 09/10/2026
- **Implementado:** `inspect_mesh_edges` em `arqdor_parametric_mesh.py` inspeciona incidência das arestas (abertas, mais de duas faces, faces com orientação inconsistente) e passa a derivar `localWallClosedSurface` do diagnóstico em vez de marcá-lo automaticamente como verdadeiro.
- **Correção geométrica:** reorientação das faces frontais, superiores e inferiores para direcionamento externo consistente, sujeita ainda a teste em Blender e a casos de subdivisão T-junction.
- **Testes escritos:** verificação de face com borda aberta e índice inválido em `test_arqdor_parametric_mesh.py`. **Não executados** nesta rodada.
- **Persistência:** `ModelFileStore.saveParametricDraft` passa a serializar leitura da revisão e escrita através de `mkdir` exclusivo `parametric-write.lock` no diretório do modelo. Escritas simultâneas retornam conflito; remoção via `finally`. Lock abandonado após crash ainda exigirá recuperação operacional, não implementada.
- **Commits:** `0be7b0d` (validação), `bdc5532` (testes), `3af15f1` (lock), `5ad2cba` (orientação de faces).
- **Situação:** diagnóstico e persistência melhorados mas sem execução de build, teste Python ou homologação; uniões de sólidos L/T/cruz e exibição WebGL das malhas paramétricas ainda pendentes. PR #3422 Draft, sem merge ou deploy; produção inalterada.


## Lote BIM — prévia com vãos sem cobertura e classificação colinear (09/10/2026)
- **Código frontend:** `RenderStudioParametricEditor.tsx` substitui a face única que ocultava portas/janelas na projeção espacial SVG por painéis subdivididos no eixo horizontal/vertical, removendo visualmente células nos intervalos das aberturas. A vista compartilha os mesmos parâmetros de paredes e vãos da planta 2D. Essa entrega é uma **prévia SVG**, não WebGL, CSG ou malha real renderizada.
- **Reconhecimento de encontros:** `draft_wall_centerline_intersections` deixa de registrar paredes colineares mas afastadas como junção; distingue sobreposição real e encontro em extremidade, com intervalo de interseção.
- **Teste adicionado:** caso de paredes colineares separadas, sobrepostas e encostadas em `test_arqdor_feature_contracts.py`.
- **Commits:** `8b77faa`, `7862a24`, `63fa962`; este registro complementa o lote.
- **Estados:** código registrado; testes e build **não executados**. Integração WebGL, união sólida L/T/cruz e verificação topológica ponta-a-ponta permanecem pendentes. Não declarar lote completo. PR #3422 Draft, homologação Contabo e publicação adiadas, sem merge/deploy.


## Lote agrupado — WebGL paramétrico conectado ao editor (09/10/2026)
- **Escopo:** evoluir o lote anterior para visualização WebGL das paredes parametrizadas, reduzindo a dependência da projeção SVG.
- **Implementação:** novo `RenderStudioParametricWebgl.tsx` com geometria `BufferGeometry`/Three.js r128 formada por painéis paramétricos em X/Z, faces de revelo e exclusão dos painéis dentro de portas e janelas. O componente utiliza diretamente o mesmo estado `walls` do editor 2D/3D; alterações nas dimensões ou posições recriam a prévia espacial. Isola descarte de malhas, materiais e contexto de renderização.
- **Integração:** `RenderStudioParametricEditor.tsx` carrega a prévia via React lazy/Suspense, mantendo a vista SVG anterior para comparação.
- **Validação de entrada:** rejeita comprimento, espessura, altura e vãos fora dos limites antes de construir a malha WebGL.
- **Commits:** `b0e2a5e` (componente Three.js), `443c39f` (integração no editor) e `9b0291f` (limites geométricos).
- **Limitações fundamentais:** malhas individuais não unidas; não há união sólida automática L/T/cruz nem resolução de nós; as superfícies 3D WebGL precisam de validação de topologia, desempenho, orientação e usabilidade; API de rascunhos não exporta diretamente GLB/IFC. Não considerar editor BIM completo.
- **Validação:** código gravado no GitHub, sem build TypeScript, execução de testes ou renderização real verificada na Contabo; homologação e produção adiadas, PR #3422 permanece Draft e sem merge.
- **Próximo conjunto:** implementar união geométrica rigorosa por tipos de encontro, validar o núcleo 3D com testes reais e separar rascunho editável de geometria aprovada.


## Lote BIM — união colinear segura (09/10/2026)
- **Novo avanço:** `merge_collinear_end_to_end_walls` em `tools/blender-server/arqdor_parametric_mesh.py` funde sequências de paredes com eixos colineares, mesma direção, extremidades coincidentes e espessura/altura compatíveis. Preserva aberturas deslocando o `offset` das portas/janelas da segunda parede para o eixo da parede consolidada. Não modifica entradas originais.
- **Não abrangido:** união sólida de encontros em L, T e cruzamentos, sobreposições parciais e materializações de malhas globais. Em caso de incompatibilidade, as paredes permanecem separadas. Geometria continua não aprovada para quantitativos/fabricação.
- **Commits:** `0370722` (implementação), `4752443` (cenários de união, manutenção de aberturas, rejeição de junções incompatíveis).
- **Validação:** testes escritos, não executados; nenhuma homologação ou deploy. PR #3422 Draft, produção inalterada.
- **Pendente para lote completo:** kernel boolean robusto para L/T/cruz; testes de topologia em geometria real, integração da fusão à UX/WebGL e comprovação de sincronismo ponta a ponta.


## Lote agrupado — consolidação no editor e revisão de encontros (09/10/2026)
- **Entregue na interface:** `RenderStudioParametricEditor.tsx` inclui ação explícita "Consolidar paredes alinhadas". Funde segmentos com extremidades coincidentes, direção e espessura/altura compatíveis, sem alterar paredes incompatíveis. Recalcula offsets de aberturas, preserva os dados da revisão e marca o rascunho como não salvo até confirmação. Relaciona avisos de encontros L/T/cruz e colineares não consolidados sem marcar uniões sólidas como resolvidas.
- **Vínculo funcional existente:** editor compartilhado 2D/3D e prévia WebGL continuam consumindo o mesmo estado `walls`; as paredes consolidadas aparecem em ambos ao atualizar o estado local.
- **Commit:** `2e42dcb`; arquivo alterado `artifacts/frontend/src/pages/arch/render-studio/RenderStudioParametricEditor.tsx`.
- **Limites:** união colinear paramétrica **não é** operação boolean robusta. Encontros em L/T/cruz continuam apenas identificados para revisão; sobreposições tridimensionais e topologia global não certificadas. Ausência de validação funcional do botão, build TypeScript e execução de testes.
- **Estados:** parcial, não homologado, não publicado, sem merge/deploy. Contabo e acesso Vendi adiados conforme orientação.


## Lote B/C — diagnóstico volumétrico de encontros 3D (09/10/2026)
- **Implementação:** `classify_wall_solid_joins` em `tools/blender-server/arqdor_parametric_mesh.py` classifica possíveis encontros L, T e cruz para paredes com sobreposição real de altura, computando aproximação de distância entre eixos e largura das paredes. Paredes de pavimentos distintos sem interseção vertical não são marcadas como união. Retorna expressamente `requiresSolidUnion=true`, `resolved=false`, `solidJoinsResolved=false`, `geometryApproved=false`.
- **Testes:** `test_solid_join_candidate_classification_and_vertical_separation` adicionado à suíte Python; inclui cruz, L, T e paredes em cotas verticais distintas. Arquivo conferido e normalizado após a adição; **testes não executados neste lote**.
- **Commits:** `8c07d40` (candidatos sólidos), `5d5ae50` (testes), `f325aad` (conferência do arquivo de testes).
- **Limite:** classificação geométrica não é união de sólidos; o núcleo boolean real com remoção de faces internas e reconstituição topológica **permanece pendente**, assim como validação em Blender e editor WebGL para situações L/T/cruz.
- **Controles:** PR #3422 Draft; não houve merge, homologação, deploy ou mudança em produção.
