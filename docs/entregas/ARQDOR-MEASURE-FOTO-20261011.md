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
