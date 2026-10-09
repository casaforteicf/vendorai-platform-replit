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
