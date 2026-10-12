# Arqdor Measure — Incremento fotográfico 01 (11/10/2026)

## Localização
- `artifacts/frontend/src/components/measure/PhotoMeasureEditor.tsx` — editor de fotografia e cotas.
- `artifacts/frontend/src/pages/OperationalMeasurementChecklist.tsx` — botão que abre o editor na conferência existente.

## Implementado na branch
- Seleção de imagem ou captura por câmera no browser, limite de 15 MB.
- Marcação de dois pontos com coordenadas normalizadas (0..1).
- Entrada manual de medida em milímetros e descrição da cota.
- Exibição de linhas e cotas sobre a fotografia, remoção de anotações e exportação JSON.
- Mensagem explícita: imagem e cotas são rascunhos locais, sem gravação em servidor.
- Nenhuma inferência de distância real a partir de pixels.
- Sem novas dependências, migrações ou alterações em produção.

## Limites conhecidos
- Foto carregada localmente não acompanha o JSON exportado.
- Não existe persistência de anotações no R2/banco; sair da tela perde o rascunho não exportado.
- A ferramenta ainda não sincroniza offline nem cria projeto automaticamente.
- Acessibilidade da marcação deve ganhar alternativa por teclado; Escape apenas limpa a seleção.
- A liberação de produção continua dependente da conferência técnica já existente.

## Pendências para próxima entrega
1. Serviço de upload R2 do tenant, autenticado e isolado.
2. Persistir metadados das marcações por item, foto, versão e usuário, com trilha auditável e testes.
3. Reabrir e editar marcações persistidas; evitar conflito entre revisões.
4. Integração com ambiente/parede no Arqdor e geração de projeto após validação.
5. Testes de componentes, compilação do frontend, inspeção mobile, homologação e verificação de permissão.

## Gates e publicação
Implementação disponível apenas nesta branch; os comandos oficiais `pnpm exec vite build --config vite.config.ts` e gates completos não foram executados neste ambiente. Pelo protocolo `docs/PADRAO-TAREFA-VENDI.md`, não abrir PR, não fazer merge e não publicar antes dos gates verdes e do aceite funcional.

## Incremento 02 — persistência das cotas (11/10/2026)
- Campo opcional `photoMeasurements` incluído no tipo do item persistido em JSONB já existente, sem migração SQL.
- Schema Zod no PATCH da conferência valida coordenadas normalizadas, valor positivo em mm, origem manual, ID UUID, rótulo e limite de 100 cotas por item.
- UI carrega as cotas salvas da revisão e envia alterações pelo endpoint atual, sujeito ao controle de tenant e ao bloqueio de checklist concluído.
- Ação Salvar cotas fica indisponível quando foi selecionada uma fotografia local ainda não armazenada; não persiste referências `blob:`.
- Tratamento de erro na própria UI do editor; nenhuma conclusão automática do checklist decorrente do salvamento de cotas.
- Atenção: ainda não há comprovante de teste integrado nem recuperação de fotografia em R2; foto de referência originada do cadastro do item não é um levantamento fotográfico persistido.
- **Condição de entrega:** branch de desenvolvimento apenas, sem PR/merge/deploy por falta dos gates obrigatórios.

## Lote 03 — upload privado de fotografias (11/10/2026)
- POST `/api/operational-checklists/runs/:runId/items/:itemId/photos`: valida existência, escopo do tenant, status da conferência, item, limite de 20 arquivos, formato real JPEG/PNG/WebP e tamanho máximo 5 MB; grava com `ObjectStorageService.savePrivateBuffer` e registra `mediaAssetsTable` como imagem de origem Arqdor Measure.
- GET correspondente: só retorna URLs temporárias das fotos do item após a verificação do tenant.
- Frontend: selecionar foto, enviar explicitamente e depois marcar/salvar cotas; imagem remota é recuperada da conferência.
- Dados permanecem vinculados à revisão e aos itens já existentes, sem migração de banco.
- **Limitações:** o editor trata principalmente a última foto do item; revisão de concorrência de gravação do JSONB, vínculo 1:1 cotas/fotos, auditoria detalhada, CORS/limites de request, segurança de acesso para usuários do mesmo tenant e verificação de redirecionamentos ainda exigem testes e endurecimento. Exigir autenticação e papéis por lead/negócio quando aplicável.
- **Validação:** nenhum build completo, teste integrado ou verificação visual foram executados neste ambiente. Sem PR, merge, homologação ou publicação.

## Lote 04 — vínculo por fotografia (11/10/2026)
- Cotagem ganha `photoPath` opcional vinculado à referência privada da fotografia, preservando compatibilidade com registros antigos.
- API PATCH rejeita cota que referencie foto não vinculada ao item; não aceita URL aleatória como associação.
- Frontend lista fotos recuperadas do item, permite selecionar cada foto e desenha somente suas cotas.
- Novas cotas são vinculadas à foto ativa, sem transformar pixels em distâncias reais.
- Ainda não foi criada geometria BIM, planta, paredes nem projeto Arqdor automaticamente. A ligação de ambientes/elementos e o motor de reconstrução são etapas futuras.
- **Bloqueios para merge:** builds, testes de persistência, concorrência entre PATCHs, render de cotas antigas, expiração das URLs de acesso e revisão do fluxo de foto recém enviada precisam ser executados.

## Lote 05 — inventário técnico de ambientes (11/10/2026)
- Campo `surveyElements` opcional no item JSONB do checklist: ambiente, classificação (parede/porta/janela/pilar/viga/instalações), medidas manuais em mm, referência de foto, observação, e estado de conferência.
- Validação Zod na API para até 200 elementos, tipos permitidos, dimensões positivas e referência a fotografia realmente associada ao item.
- Nova UI `SurveyElementsEditor` embutida na conferência, com cadastro por ambiente, vínculo com foto, marcação de conferência e persistência via PATCH existente.
- Nenhuma migração do banco, dependência nova ou alteração no modelo BIM canônico.
- **Não é ainda modelagem geométrica:** um inventário de paredes não define posições X/Y, orientação, relações de aberturas ou precisão para construção automática do projeto.
- **Riscos pendentes:** renderização e testes integrados, conciliação de concorrência nas atualizações JSONB, validação de autorização por negócio e origem de fotografias, gates de build/TS, tratamento de restauração de rascunho e sincronização. O botão de conferido indica revisão manual no editor, não substitui aprovação técnica para fabricação.
- Sem PR, merge ou deploy até passar os gates e a homologação.

## Lote 06 — conclusão do incremento de campos geométricos (11/10/2026)
- API PATCH aceita e valida X1/Y1/X2/Y2 entre -1.000.000 e +1.000.000 mm e espessura de 50 a 1000 mm.
- Editor coleta coordenadas e espessura de cada parede, exige comprimento de pelo menos 10 mm, e apresenta preview SVG apenas das paredes verificadas.
- Campos opcionais retrocompatíveis no JSONB existente, sem alteração de tabelas.
- Não foi implementada criação de projeto, fechamento topológico de ambientes, associação geométrica de portas/janelas, detecção de colisões ou conversão para modelo canônico Arqdor.
- Os gates obrigatórios de frontend/API, testes de componente, integração, permissões, concorrência e homologação permanecem pendentes. Não criar PR nem publicar sem completar essas validações.

## Lote 07 — portas e janelas vinculadas às paredes (11/10/2026)
- Adicionados ao modelo JSONB opcional `wallId`, `offsetMm` e `sillHeightMm`.
- Editor coleta largura e altura, parede verificada do mesmo ambiente, deslocamento desde a extremidade inicial e peitoril para janela.
- API valida que a parede referenciada pertence ao mesmo item/ambiente, tem extremidades definidas e está verificada; impede ultrapassar comprimento e interseção retangular de aberturas na mesma parede.
- Não houve alteração automática de geometria no projeto Arqdor ou liberação de fabricação.
- **Ainda pendente:** testes de API/UI/build, concorrência do JSONB, confirmação de dimensões de altura da parede, geometria de arcos de porta, escopo de permissões por negócio e revisão do fluxo com vários itens. Testes e homologação não executados. Sem PR/merge/produção.

## Lote 08 — rascunho geométrico compatível com Arqdor (11/10/2026)
- Helper `convertSurveyToArqdor.ts` converte paredes verificadas de coordenadas em milímetros para metros, preservando IDs, piso 0 e espessura. Aberturas com parede, offset, largura, altura e peitoril conferidos são convertidas para `customOpenings`.
- UI de inventário exibe prévia JSON somente leitura com alertas sobre paredes/aberturas incompletas.
- O formato é baseado na estrutura de `ArchConceptConfiguration` já existente; não altera nenhum projeto, não aplica geometria no backend, não gera um projeto persistido e não libera produção.
- **Pendências de segurança técnica:** validar topologia, portas/janelas sobrepostas após conversão, paredes contíguas, espaços fechados, vínculo por revisão e origem das medidas. A indicação `readyForReview` não significa aprovação BIM/fabricação.
- Gates de frontend/API, testes e homologação permanecem pendentes. Não abrir PR/merge/deploy enquanto falharem ou não forem executados.

## Lote 09 — revisão do pré-projeto e gates (11/10/2026)
- Conversor passou a bloquear prévia pronta para revisão se uma parede tiver extremidade desconectada (tolerância de proximidade 5 mm), se houver IDs duplicados, abertura que ultrapasse parede ou aberturas sobrepostas.
- UI exige confirmação explícita antes de permitir exportar um pacote JSON de pré-projeto. O pacote indica claramente `savedToArqdor: false`.
- Criados testes Vitest do conversor: parede isolada, contorno retangular conectado e aberturas sobrepostas.
- **Escopo efetivamente entregue**: preparação, revisão e exportação de rascunho; a gravação em `arch_concept_projects`, a integração com projeto existente, versionamento/rollback e geometria de fabricação seguem pendentes.
- Testes adicionados mas não executados; gates de compilação e homologação não comprovados. Nenhum PR/merge/deploy.

## Lote 10 — criação transacional de rascunho Arqdor (11/10/2026)
- Endpoint autenticado POST /api/operational-checklists/runs/:runId/create-arqdor-draft com confirmação explícita e nome do projeto.
- Converte coordenadas mm para metros, desloca a origem para a envoltória positiva, valida paredes verificadas, conexões entre extremidades, janelas e portas dimensionadas, encaixe e sobreposições.
- Em transação, cria registros novos em arch_projetos e arch_concept_projects, com vínculo ao lead/deal/proposta, owner do tenant, status briefing/draft e referência textual à revisão de origem.
- UI na tela de conferência solicita confirmação e exibe identificador criado; não sobrescreve projetos existentes, não libera fabricação e não altera produção.
- **PENDÊNCIAS CRÍTICAS ANTES DE HOMOLOGAR:** endpoint ainda não é idempotente (cliques repetidos podem criar rascunhos duplicados), teste de concorrência entre alterações do checklist e criação de rascunho, confirmação de tipo do campo tenantId em users, teste transacional de integração, revisão de autorização por negócio/owner, topologia T/cruzamento, governança do dossiê/histórico, validação do editor no projeto criado e todos os gates de compilação. Não abrir PR/merge nem publicar.

## Lote 11 — estabilização da criação de projeto (11/10/2026)
- A criação do rascunho usa transação e advisory lock PostgreSQL por checklist + revisão, consulta o projeto marcado como origem e reutiliza o conceito já criado quando há repetição. Solicitações concorrentes da mesma origem ficam serializadas.
- Resposta 200 com `reused: true` para reuso e 201 para criação. Frontend informa o resultado.
- Critérios ainda a testar: a identificação por texto de descrição não tem índice/constraint exclusivo; evitar que alteração manual da descrição quebre a identidade, compatibilidade do `tx.execute` com driver, escopo de permissões, conflitos concorrentes de atualização do checklist, comportamento do editor e o caso de registro órfão.
- Gates de compilação, testes e homologação **não executados**; código não foi publicado e não está pronto para PR.

## Lote 12 — auditoria de gates e bloqueio de terminal (11/10/2026)
- Verificados o modelo `users` (contém `tenantId`) e a rota de criação de conceito em branch.
- Desktop Commander informou dispositivo remoto online, porém chamadas de execução estão bloqueadas por limite mensal de uso. Tentativa de acesso git via container também falhou por DNS indisponível.
- Não foi possível executar os comandos oficiais de build frontend/backend, testes de regressão, inspeção do banco ou homologação.
- A tentativa de impor novo bloqueio para checklists já concluídos foi revertida no mesmo lote, para não alterar o fluxo vigente de criação revisada. Resultado final da rota permanece com o controle anterior, sem alteração funcional consolidada.
- Sem evidências de sucesso dos gates; não abrir PR/merge/produção.

## Lote 13 — endurecimento da associação de fotografias (11/10/2026)
- Removida a capacidade de alterar `fotos` pelo PATCH genérico de itens do checklist. Antes o schema aceitava qualquer string, permitindo injeção de referência arbitrária mesmo sem upload do arquivo pelo fluxo privado.
- Novas fotografias passam exclusivamente pelo endpoint específico `POST /runs/:runId/items/:itemId/photos`, que valida usuário/tenant, checklist, item, formato e arquivo, e registra o ativo na Biblioteca de Mídias.
- O `PATCH` de `photoMeasurements` e `surveyElements` continua exigindo referência a foto já vinculada ao item.
- **Riscos em aberto:** endpoints de fotos/checklist ainda precisam de teste de concorrência para evitar perda de atualizações entre upload e PATCH; autorização mais fina por negócio; verificação do limite de tamanho do body no Express; política de exposição de URLs temporárias; testes do fluxo com duas fotos simultâneas.
- Sem testes de compilação executados: a VPS via Desktop Commander está online, mas a cota mensal do conector impede comandos. Nenhum PR, merge ou deploy.

## Lote 14 — concorrência de checklist e upload (11/10/2026)
- PATCH do checklist: atualização otimista por comparação do snapshot JSONB de `items`, com checagem do tenant e do status em andamento; retorna HTTP 409 (`CHECKLIST_CONFLICT`) caso outra gravação tenha alterado os itens antes da persistência.
- Upload de foto: após gravar o arquivo, recarrega o checklist mais recente e tenta até cinco vezes anexar a foto por compare-and-swap JSONB, mantendo alterações de outros itens e o limite de 20 fotos por item.
- **Limitação conhecida:** em conflito persistente, a imagem e o registro da Biblioteca de Mídias podem ficar órfãos; requer rotina de reconciliação/limpeza. Transição de status e edição em paralelo, permissões por negócio e tratamento de falhas do armazenamento ainda exigem testes.
- **Não validado:** build, teste de concorrência PostgreSQL e homologação; a VPS remota permanece inacessível pelo limite do conector. Nenhum PR, merge ou publicação.

## Lote 15 — reconciliação de uploads e recuperação de conflitos (11/10/2026)
- `ObjectStorageService.deleteTenantPrivateBuffer`: remoção restrita ao prefixo privado do tenant, para arquivo criado por `savePrivateBuffer`, recusando caminho fora do tenant ou com subpastas inesperadas.
- No upload, caminho e ID da mídia são rastreados enquanto o objeto ainda não está vinculado. Em conflito permanente após cinco tentativas ou falha no registro da mídia, tenta-se apagar o registro `media_assets` e o objeto privado. A rotina de compensação registra separadamente falhas de limpeza sem esconder a falha principal.
- Interface diferencia HTTP 409 com código `CHECKLIST_CONFLICT` e orienta recarregar/conferir antes de tentar novamente, sem sobrescrever silenciosamente as medições.
- **Limites**: limpeza compensatória não é transação distribuída com R2 (falhas temporárias ainda podem deixar órfãos); não há varredura automática de órfãos antigos; editor de elementos ainda precisa preservar estado não salvo durante reload. Persistência validada apenas por inspeção de código, sem execução dos builds, testes ou homologação.
- Nenhum PR, merge ou produção.

## Lote 16 — integração da recuperação local corrigida (11/10/2026)
- Página `OperationalMeasurementChecklist.tsx` passa `draftKey` à `SurveyElementsEditor` com escopo de checklist, revisão e item. Resolvida a propriedade obrigatória ausente do commit inicial do lote 16.
- Leitura do rascunho em `sessionStorage` passou a verificar estrutura básica dos elementos antes de oferecer recuperação.
- A cópia local contém apenas elementos técnicos em JSON e referências às fotografias já vinculadas ao checklist; não guarda bytes de fotos.
- **Não comprovado:** build real de frontend, teste no navegador, funcionamento offline e recuperação entre sessões diferentes do navegador. Sem merge nem deploy.

## Lote 17 — fila local de levantamento e envio manual (11/10/2026)
- Novo `offlineSurveyQueue.ts` usa IndexedDB no navegador para armazenar **somente** elementos técnicos em JSON (sem bytes de fotografias) quando não há conexão ou quando a requisição falha com erro de rede.
- `SurveyElementsEditor` permite recuperar a pendência local e enviar manualmente pelo fluxo existente. O registro offline é apagado apenas depois de a API confirmar o salvamento.
- Chave de isolamento inclui usuário autenticado, checklist, revisão e item, impedindo colisão normal de rascunhos entre contas.
- Conflitos HTTP 409 e rejeições de validação **não** são reenviados automaticamente nem descartam alterações. A UI deve orientar a revisão manual.
- **Limitações:** IndexedDB não é criptografado por esta mudança; o dispositivo deve ser confiável. Não há fila de uploads fotográficos, sincronização automática, serviço offline do aplicativo (PWA), testes de navegador, índices com expiração nem limpeza no logout. Nenhuma garantia de retenção quando o usuário limpa dados do navegador.
- Nenhuma compilação ou teste integrado foi executado; sem PR, merge ou publicação.

## Lote 18 — integração da fotografia offline (11/10/2026)
- `PhotoMeasureEditor` agora importa a fila IndexedDB, detecta pendência ao abrir, exibe botão para guardar a foto selecionada offline e botão para enviar a foto guardada quando houver conexão.
- Envio utiliza `onUpload` autenticado da página do checklist; após sucesso, registra o caminho devolvido pelo backend e solicita remoção da cópia local.
- `OperationalMeasurementChecklist` passa `offlineKey` delimitada por ID de usuário, ID de checklist, revisão e ID do item.
- **Limites:** fila comporta uma foto por chave; guardar outra substitui a anterior; não há recuperação de cotas desenhadas mas ainda não salvas; expurgo ao logout e criptografia de IndexedDB não implementados. Upload confirmado com falha na remoção do arquivo local pode reaparecer na fila, exigindo tratamento de idempotência.
- Compilação, testes E2E, segurança e homologação ainda não executados. Nenhum PR/merge/deploy.

## Lote 19 — múltiplas fotografias offline (11/10/2026)
- Fila IndexedDB agora grava cada imagem com UUID próprio e chave de contexto, com limite de 20 fotografias pendentes por item e lista ordenada por horário.
- Editor apresenta quantidade de fotos pendentes, envia a primeira da fila através do upload autenticado existente e remove somente o registro da foto confirmada, por ID exclusivo.
- **Pendências críticas:** associar e restaurar cotas de cada foto offline; recuperação automática de visualização da foto local quando se reabre o editor; idempotência completa quando upload remoto confirma mas exclusão local falha; validação em navegador real; limite combinado de fotos servidor + pendentes; rotina de logout/privacidade.
- **Status:** código gravado na branch, builds/testes/homologação não executados, sem PR/merge/deploy.

## Lote 20 — cotas em fotografias offline e confirmação local de upload (11/10/2026)
- Fila de fotos IndexedDB guarda opcionalmente `measures` por foto e `uploadedPath` como reconhecimento de upload já concluído.
- Editor armazena cotas locais sem caminho de foto junto ao arquivo offline; ao sincronizar, envia imagem pela API autenticada, registra o caminho remoto em IndexedDB, então associa cotas ao caminho persistido via PATCH.
- Se o PATCH das cotas falhar após upload e o reconhecimento tiver sido gravado, a fila não reenviará a imagem: permite nova tentativa de associar as cotas.
- **Limites importantes:** cotas acrescentadas depois de enfileirar a imagem não são automaticamente anexadas ao registro offline; falha entre confirmação remota e armazenamento do reconhecimento local ainda pode duplicar imagens; não há chave idempotente no backend. Recuperação de exibição da imagem e atualização de marcações offline ainda exigem interface dedicada. A edição conjunta de cotas pode causar conflito e deve ser revisada após erro 409. Sem testes/build/homologação, merge ou produção.

## Lote 22 — proteção de identidade estável de upload (11/10/2026)
- Frontend propaga o ID UUID persistido da fotografia offline na requisição `POST .../photos`.
- Backend valida `uploadId` como UUID, registra no metadata da mídia e busca reenvios já vinculados pelo tenant, checklist, item e UUID, devolvendo a fotografia já existente sem repetir upload.
- Migração **ainda não aplicada** cria índice único parcial para `(tenant_id, metadata->>'uploadId')` de uploads Arqdor Measure. Essa é a garantia de unicidade mesmo sob corrida de chamadas, condicionada à aplicação da migração.
- Verificação de reuso ocorre antes do limite de 20 fotos, permitindo resposta idempotente a reenvio já vinculado.
- **Ainda pendente:** concorrência em banco, recuperação elegante de erro unique-violation durante corrida, reconciliação de asset criado sem vínculo ao checklist, prevenir reuso de UUID com imagem diferente via checksum, validação de migração em staging e todos os gates. Nenhuma publicação.

## Lote 23 — concorrência no upload idempotente (11/10/2026)
- Tratado código PostgreSQL 23505 na gravação de mídia: após tentativa de compensar o próprio upload, busca o asset pelo tenant, UUID, checklist e item e verifica, no estado mais recente, se o caminho está vinculado àquele item; se confirmado, retorna HTTP 200 com reused:true.
- Caso exista identidade concorrente sem vínculo confirmado, responde HTTP 409 PHOTO_RECONCILE_REQUIRED, sem alegar que a foto está salva no checklist.
- Dependências ainda pendentes: aplicar o índice único em homologação (sem isso a corrida não dispara 23505); reconciliar registros órfãos; detectar uso indevido de UUID com arquivo diferente por checksum; testar concorrência real, API, R2 e frontend.
- Código gravado, ainda sem build, testes, PR, merge ou deploy.

## Lote 24 — verificação de conteúdo por SHA-256 (11/10/2026)
- A API calcula SHA-256 do buffer decodificado, guarda `contentHash` no metadata da mídia e compara o conteúdo ao reutilizar um `uploadId`. UUID reaproveitado com bytes diferentes resulta em HTTP 409 `PHOTO_ID_CONFLICT`.
- A recuperação de colisão do índice único PostgreSQL também só reutiliza o asset se o checksum corresponder e ele estiver vinculado ao mesmo item.
- Mantida recusa `PHOTO_RECONCILE_REQUIRED` para asset conhecido que ainda não consta do checklist; a reconciliação automatizada de órfãos segue pendente.
- Importante: o índice único criado no lote 22 ainda precisa de migração em staging; builds e testes não foram executados. Nenhum PR/merge/deploy.

## Lote 25 — reconciliação de mídia já registrada (11/10/2026)
- Na repetição de POST com uploadId conhecido, tenant/run/item e SHA-256 compatíveis, o backend tenta reanexar a mídia existente ao checklist quando o vínculo JSONB estiver ausente.
- Atualização executada com compare-and-swap por status e snapshot de itens, até cinco tentativas; recusa checklists concluídos, itens ausentes e limites de 20 fotos. Não cria um segundo objeto R2.
- Após sucesso, registra log de reconciliação com runId/itemId/assetId e retorna o asset existente. Caso falhe, conserva HTTP 409 PHOTO_RECONCILE_REQUIRED.
- Pendências: revisar concorrência entre várias instâncias, testes de banco e R2, auditoria persistente, validação em homologação, confirmar migração de índice único. Sem merge ou deploy.

## Lote 26 — estabilizacao inicial (11/10/2026)
- Corrigido o filtro de cotas quando a foto atual e um Blob offline, para exibir cotas locais sem photoPath.
- Recuperacao da foto limpa a selecao de caminho remoto anterior.
- Remocao de cota enquanto uma foto local esta selecionada tambem atualiza o registro IndexedDB (quando ainda nao foi enviado).
- Consulta a checks e workflows PR do commit final anterior retornou listas vazias, sem evidencia de CI aprovado.
- Gates de TypeScript, backend build, Vite, seguranca, PostgreSQL e testes mobile continuam pendentes; nenhum merge/deploy.

## Lote 27 — integridade de cotas por fotografia offline (11/10/2026)
- queuePhoto agora devolve UUID do novo registro IndexedDB, e o editor o seleciona imediatamente. Cotas adicionadas em seguida ficam associadas ao registro escolhido.
- Apos guardar a foto offline, o arquivo selecionado e limpo para evitar enfileiramentos acidentais com um unico clique repetido.
- Trocar para nova fotografia exige confirmacao quando existem cotas locais ainda nao vinculadas; remove as cotas soltas do editor antes de iniciar nova imagem.
- Pendente: controle de concorrencia entre abas e transacoes de cotas, compilacao frontend, build backend, seguranca e homologacao. Sem merge e sem deploy.

## Lote 28 — concorrência multiabas e preparação de testes (11/10/2026)
- Adicionado `photoTabLock.ts`: usa Web Locks API com exclusão por chave de usuário/checklist/revisão/item. Quando a API de locks não existe, falha explicitamente antes de gravar/sincronizar, em vez de fingir segurança.
- `PhotoMeasureEditor`: aplica lock para enfileirar foto, atualizar/remover cotas do IndexedDB e executar sequência de upload remoto + persistência de cotas + remoção da fila. Dados são relidos após obter o lock para evitar atualização com cópia antiga.
- Adicionado `photoTabLock.test.ts` com casos de serialização e navegador sem suporte. **Teste foi escrito, mas NÃO executado.**
- Verificações de CI do commit do lote 25 retornaram vazio. Não há checkout integral do monorepo/dependências nesta sessão, nem execução disponível na Contabo, portanto `pnpm run typecheck`, `pnpm exec vite build` e `pnpm test` não puderam ser comprovados.
- Ainda faltam testes reais em duas abas, Chrome Android/iOS, os gates de API e frontend, migração de índice único em homologação e auditoria de dados offline. Sem PR/merge/deploy.

## Lote 29 — edição de cotas e revisão técnica (11/10/2026)
- PhotoMeasureEditor permite editar o valor em milímetros das cotas existentes; valores devem ser positivos e no máximo 1.000.000 mm. Cotas associadas a fotografia offline recuperada são atualizadas no IndexedDB sob Web Lock; erro de persistência mantém o valor anterior na interface.
- SurveyElementsEditor permite revisar largura do elemento; ao fazê-lo, invalida o status conferido para exigir nova verificação técnica, sinaliza revisão da prévia e preserva o estado local até salvamento explícito.
- Sem mudança de produção, sem PR/merge/deploy. Pendente: edição de altura, geometria/posição e identificações; validação cruzada de aberturas quando paredes são alteradas; testes mobile e pipelines de compilação ainda não executados.

## Lote 30 — conferência de medidas e tolerâncias (11/10/2026)
- Backend recalcula status de conferência quando largura/altura conferidas mudam, usando somente dimensões que possuem medida original e conferida. Se uma dimensão exigida estiver ausente, a conferência volta a `nao_conferido`; evita aprovação implícita por diferença nula.
- Frontend exibe tolerância em mm, aviso para dimensões originais ainda não conferidas e alerta quando diferença absoluta supera a tolerância.
- Pendentes para lote 30 completo: fluxo formal de resolução de divergências com justificativa e aprovação; cálculo por item/unidade; testes de regressão, validações reais e homologação.
- Código registrado, sem build/testes executados, sem merge/deploy em produção.

## Lote 31 — aprovacao de divergencia (11/10/2026)
- Backend exige justificativa entre 15 e 2000 caracteres e usuario autenticado para mudar um item divergente para resolvido.
- Registra motivo, aprovador, horario e deltas no registro JSONB do item; alteracao posterior das medidas invalida resolucao.
- Backend rejeita tentativa de marcar conferido manualmente e pedido que edita medidas e aprova divergencia simultaneamente.
- Frontend pede a justificativa antes de acionar a API.
- Pendente: trilha imutavel de multiplas aprovacoes, permissoes especificas para aprovador e testes integrados; nenhuma compilacao/homologacao comprovada, sem merge/deploy.

## Lote 32 — validacao BIM de paredes e aberturas (11/10/2026)
- Servidor exige espessura real conferida para cada parede: entre 50 e 1000 mm. Nao inventa mais o valor padrao de 150 mm ao criar o rascunho.
- Aberturas sao rejeitadas caso a parede vinculada nao esteja conferida; medidas e deslocamentos devem ser finitos.
- Previa do conversor Arqdor aplica a mesma validacao de espessura, mostrando alerta ao tecnico se faltar.
- Pendente: testes de compilacao e integracao BIM, geometria por pavimento, identificacao de ambientes, fluxo de atualizacao controlada de projetos existentes e homologacao. Nao houve merge nem deploy.

## Lote 33 — pavimentos e ambientes no BIM (11/10/2026)
- Elementos do levantamento aceitam floorIndex opcional, com compatibilidade legado (omissao = pavimento 0). Cadastro do editor permite selecionar pavimento 0-49 e restringe selecao de parede de referencia ao mesmo ambiente e pavimento.
- API valida floorIndex e gera customWalls/customOpenings com floor correto, floors conforme pavimento mais alto. Conferencia de conectividade das paredes na criacao de projeto somente compara extremidades no mesmo pavimento.
- Conversor de previsualizacao acompanha pavimentos. Planta SVG pode selecionar pavimento para nao sobrepor geometrias de andares diferentes.
- Pendencias: modelo semantico persistente de ambientes BIM, cotas altimetricas, escadas/lajes, testes de exportacao, compilacao e homologacao. Sem merge ou deploy.

## Lote 34 - relatorio de impressao
Componente MeasurementPrintReport integrado ao checklist. Inclui medidas, diferencas, aprovadores e contagem de fotos. Fotos privadas nao sao impressas. Nao equivale a aceite assinado. Testes de compilacao e browser ainda nao executados. Sem publicacao.

## Lote 35 - fotografias autorizadas no relatorio tecnico
Componente de impressao pode renderizar fotos com URLs temporarias retornadas pela API autenticada, sem exibir caminhos internos como URLs publicas. A tela recebeu acao Preparar fotos para PDF que consulta fotos de cada item autorizado antes da impressao. Ausencia de URL exibe indicador sem expor dados privados. Pendentes: validacao de carregamento completo antes de imprimir, expiracao de URLs, testes de compilacao e impressao, assinatura e aceite formal. Sem homologacao ou deploy.

## Lote 36 - aceite tecnico autenticado
Conclusao exige confirmacao explicita e nome do responsavel (minimo 3 caracteres), associado ao usuario autenticado e horario no headerSnapshot. Impressao mostra o registro de aceite. Nao e assinatura digital certificada nem aceite juridico externo. Atualizacao usa comparacao de versao por updatedAt para evitar conclusao sobre checklist alterado por outra operacao. Pendente: testes de compilacao e integracao, assinatura formal com cliente, aceite por parte externa e homologacao. Sem merge/deploy de producao.

## Lote 37 - ciencia presencial de terceiro
API autenticada permite ao operador registrar declaracao de ciencia presencial apenas apos conclusao do levantamento: nome, vinculo com a obra, operador identificado e horario. Nao e assinatura independente do terceiro. Impede registro duplicado para a mesma revisao, usa controle de versao por updatedAt e verifica tenant. Botao na tela e registro no relatorio impresso. Pendente: portal seguro para aceite externo, assinatura eletronica verificada e testes de compilacao e integracao. Sem homologacao e sem publicacao.

## Lote 38 — preparacao de convite para aceite remoto
API interna autenticada gera token aleatorio de 256 bits, grava somente SHA-256, destinatario, emissor, revisao e validade de 1 a 72 horas. Token retornado apenas na emissao com Cache-Control no-store. API interna permite revogar convite; atualizacao do JSONB protege contra concorrencia via updatedAt. NAO EXISTE AINDA rota publica de aceite nem identidade verificada, portanto convite NAO DEVE SER ENVIADO A CLIENTES. Necessarios verificacao de identidade, limitacao de tentativas, auditoria imutavel, consumo atomico do token, testes de compilacao, integracao e homologacao. Sem deploy.

## Lote 39 — inspecao autenticada de convite remoto
Criada rota autenticada de inspecao do convite com validacao de token hash SHA-256, revisao, prazo e status pending; nao fornece dados do checklist nem habilita aceite. Revogacao existente invalida consulta. O consumo unico e a identidade verificada ainda NAO foram implementados; a rota publica permanece desativada. Pendente compilacao, testes integrados, rate limiting e implementacao formal de assinatura. Nenhum merge/deploy.

## Lote 40 — endurecimento de convites remotos
Validação de hash do token usa comparacao em tempo constante e exige hash hexadecimal de 32 bytes. Novo convite pendente e vigente nao pode ser sobrescrito; operador precisa revogar antes de trocar. Revogacao repetida passa a retornar conflito. Continua inexistente rota publica de aceite, consumo atomico de uso unico ou verificacao de identidade. Compilacao e testes nao executados; nao homologado nem publicado.

## Lote 41 - integridade offline e dependencias BIM (12/10/2026)
- Levantamento tecnico agora guarda rascunho em IndexedDB ANTES de tentativa de envio online; falhas de rede, conflitos HTTP e rejeicoes do servidor nao descartam a copia local.
- Quando existe levantamento offline pendente e a tela nao tem edicao local recuperada, a sincronizacao e bloqueada ate recuperar/conferir a copia para evitar sobrescrita silenciosa.
- Recuperar rascunho offline sobre edicoes ja presentes exige confirmacao. Revisar dimensoes da parede invalida conferencia das aberturas dependentes e exige nova verificacao.
- Pendente: testes automatizados e reais, versao offline por item, recuperacao simultanea de multiplos dispositivos, aceite remoto e assinatura, instalacao mobile/PC e homologacao. Nenhum merge/deploy.

## Lotes 42-43 - integridade offline e geometria BIM (12/10/2026)
- L42: sincronizacao dos elementos sob Web Lock por chave de usuario/revisao/item, evitando duas abas gravando o mesmo levantamento simultaneamente. Corrigida a mensagem de sucesso indevida quando dados foram apenas salvos offline. A sincronizacao entre dispositivos permanece pendente.
- L43: corrigida validacao da segunda extremidade da parede na previa BIM para exigir parede vizinha no mesmo pavimento. Adicionados testes de regressao ao arquivo existente convertSurveyToArqdor.test.ts. Testes criados, ainda NAO executados.
- L44/L45/L46 continuam abertos: identidade/assinatura remota, aplicativo instalavel, auditoria e relatorio, alem de compilacao e homologacao. Sem merge/deploy em producao.

## Lotes 45-46 — UX e relatorio (12/10/2026)
- L45 parcial: editor de levantamento avisa ao fechar/atualizar pagina com alteracoes nao gravadas. Confirmado que ja existe manifest.json global Vendor.ai; aplicacao offline instalavel para Measure ainda requer service worker, politicas seguras de cache, testes em mobile/PC e permissoes de camera.
- L46 parcial: relatorio de impressao inclui data de emissao, total de itens, divergencias abertas e pendencias. Ainda faltam trilha de auditoria imutavel, fotos totalmente carregadas no PDF, versionamento formal e testes.
- L44 permanece pendente: aceite remoto com verificacao independente de identidade e consumo de token unico. Nao habilitar a rota publica prematuramente.
- NENHUMA compilacao/teste funcional/homologacao executada nesta etapa. Sem merge/deploy.

## Lote 47 — protecao contra descarte de rascunho offline mais novo (12/10/2026)
A fila de levantamento armazena revisionId aleatorio por salvamento; apos envio online, somente apaga o registro IndexedDB se a versao local ainda for a mesma. Comparacao e exclusao na mesma transacao readwrite. Caso surja edicao mais nova, ela e preservada e a interface informa o conflito. Falta teste funcional e compilacao e detecao de concorrencia entre dispositivos fisicos; sem homologacao/merge/deploy.

## Lote 48 — versao de servidor contra sobrescrita entre dispositivos (12/10/2026)
PATCH de itens aceita expectedUpdatedAt e devolve CHECKLIST_CONFLICT quando a versao do levantamento carregada anteriormente nao corresponde ao estado corrente no banco. Frontend envia expectedUpdatedAt nas alteracoes manuais, fotoanotacoes e elementos BIM. Atualizacoes sem campo continuam aceitas para compatibilidade e exigem posterior migracao para obrigatoriedade; upload de foto pode atualizar versao e necessitar recarga para sincronizar cotas. Testes automatizados e integrados pendentes; sem merge/deploy.

## Lote 49 — atualizar versao do checklist apos envio de foto (12/10/2026)
- Apos POST de fotografia autenticada, cliente recarrega o checklist atual para obter updatedAt do servidor antes de persistir cotas.
- Ref de versao mais recente evita uso de closure desatualizada nas operacoes encadeadas de upload/medicao e atualiza quando PATCH retorna novo checklist.
- Lista de acesso a fotos evita duplicar a mesma storageUrl no estado local. Persistem pendentes testes TypeScript/build, fluxo real online/offline e concorrencia em varios dispositivos. Sem merge/deploy.

## Lote 50 — recuperação de conflito entre dispositivos (12/10/2026)
Ao receber erro de concorrencia do servidor, editor de elementos tecnicos mantém rascunho IndexedDB e bloqueia novas tentativas de sincronizacao na mesma instancia. Interface mostra alerta e permite exportar JSON local para comparacao manual. Nao faz merge automatico nem libera sobrescrita de medidas alheias. Para resolver, recarregar versao do servidor, recuperar copia local e reconciliar conscientemente. Pendente implementacao de diff/merge assistido, testes de compilacao e integracao. Sem publicacao.
