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
