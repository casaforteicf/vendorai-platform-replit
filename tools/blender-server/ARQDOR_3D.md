# Arqdor 3D — primeira etapa de implementação

Esta etapa adiciona importação de GLB 2.0 com recursos incorporados ao worker
Blender existente. Não ativa o módulo completo em produção.

## Contrato da cena

O backend injeta o tenant real do projeto. O worker lê somente arquivos do
diretório privado `ARQDOR_MODEL_ROOT/<tenantId>/`; `key` é relativa a esse diretório.
Não aceita URLs, caminhos absolutos, links fora do diretório ou recursos externos.

```json
{
  "model": {
    "tenantId": "tenant-id",
    "key": "models/version-id/model.glb",
    "sha256": "sha256-do-arquivo-original",
    "calibration": {"measuredDistance": 250, "actualMeters": 2.5},
    "referenceDimensions": {"width": 4, "depth": 5, "height": 2.8},
    "tolerance": 0.01
  },
  "resolution": [1920, 1080],
  "samples": 64,
  "hdri": "natural",
  "camera": {"location": [0, -5, 1.6], "target": [0, 0, 1], "fov": 60}
}
```

As referências width/depth/height correspondem aos eixos X/Y/Z do Blender,
depois da conversão glTF. Devem vir de medidas independentes da calibração.
Conferir as dimensões globais não valida paredes, aberturas, topologia ou áreas.
O relatório mantém `geometryStatus=requires_review` e `quantitiesEnabled=false`.
Materiais importados mantêm `specificationStatus=unconfirmed`.

O worker preserva hierarquia, malhas e materiais e não gera o ambiente padrão
nem os móveis genéricos quando `model` está presente. Escala somente os objetos
raiz, evitando escalar filhos duas vezes. Divergências de dimensões bloqueiam
o render antes da execução do Cycles. Alterações no arquivo invalidam seu SHA-256.

## Inspeção sem render

Defina `SCENE_CONFIG_PATH`, `OUTPUT_PATH`, `ARQDOR_MODEL_ROOT`,
`MODEL_REPORT_PATH` e `MODEL_INSPECT_ONLY=1`, depois execute:

```bash
/opt/blender/blender --background --python blender_render.py
```

O relatório JSON contém dimensões, referências, desvios, nomes dos objetos,
contagem de polígonos, materiais e versão do arquivo. A inspeção usa o mesmo
importador e as mesmas transformações que o render. Não substitui revisão
profissional de plantas, cortes e fachadas.

## Verificação local

```bash
python -m unittest discover -s tools/blender-server -p 'test_model_validation.py' -v
```

Os testes cobrem calibração, referências, bloqueio de quantitativos, integridade,
isolamento de arquivos, traversal e recursos externos. Não substituem um teste
real com Blender 3.6 e GLB representativo em GPU.

## Upload privado e preparação no Render Studio

O Render Studio agora possui a entrada **Modelos 3D**, disponível no desktop e
mobile quando existe um projeto selecionado. A tela permite importar e listar
GLBs, recuperar referências de escala, consultar nomes dos materiais e baixar
o original com autenticação. O botão de render 3D continua desabilitado.

Defina `ARQDOR_MODEL_ROOT` na API como caminho de um volume persistente privado
no Contabo. Não exponha esse diretório em Nginx, servidor estático ou bucket
público. Sem a configuração, a API informa indisponibilidade e bloqueia uploads.
A estrutura é `<root>/<tenantId>/<projectId>/<modelId>/model.glb`, compatível com
o `key` do worker relativo ao tenant. GPU remota ainda exige transferência.

Rotas autenticadas, sujeitas aos gates existentes de licença/módulo e ao tenant
do projeto:

- `GET/POST /api/arch/projetos/:projectId/model-files`
- `GET /api/arch/projetos/:projectId/model-files/:modelId/file`
- `GET/POST /api/arch/projetos/:projectId/model-files/:modelId/calibrations`

Uploads estão limitados a 45 MB e têm versão independente, SHA-256 e permissões
privadas. Referências são registros imutáveis, com autor, data e hash do modelo.
Não aprovam escala automaticamente: mantêm status `pending_worker_validation`.
As listas recuperam versões do disco após reiniciar a API. Não há mudança de
schema no banco. O projeto é autorizado no banco antes de qualquer acesso ao disco.

Teste do storage e das regras do upload:

```bash
node --experimental-strip-types --test tools/arqdor-tests/model-files.test.mjs
```

## Próximas integrações obrigatórias antes de habilitar render para usuários

- Completar visualização 3D, atribuição/especificação de materiais, câmera/luz,
  conferência real no worker e resultados na interface guiada existente.
- Captura das mídias geradas na Biblioteca de Mídia. O worker atual ainda usa o upload
  legado em Supabase; esse fluxo precisa ser substituído antes da ativação 3D.
- Transporte de staging Contabo → GPU e retorno de arquivos, com URLs temporárias
  restritas ao objeto autorizado. Não montar armazenamento público.
- Orquestrador durável com idempotência, cancelamento, timeout, retomada, orçamento
  superadmin e escala de workers conforme demanda. A fila atual em memória é legada.
- Benchmark real de render Full HD, 4K e vídeo, incluindo início da GPU e transferência.
- Conversores FBX/OBJ/GLTF/IFC e SKP somente após validação e avaliação de licença.
- Fallback 3D com referência da câmera e identificação explícita de resultado IA.
  Sem worker, o backend rejeita cenas `model` antes de criar o job; o caminho
  de imagem existente permanece disponível.
- Revisão geométrica por versão e especificação técnica de materiais antes de
  liberar integração com memorial, quantitativos e orçamento.
- Imagem → objeto 3D requer um motor separado; não foi implementado nesta etapa.

Relaciona-se à issue #3421. Nenhuma contratação, chave ou implantação é feita
por estes arquivos.


## Objetivo Render Pro — referência funcional V-Ray / Lumion (09/10/2026)

Este escopo é **planejamento**, não funcionalidade concluída, nem integração licenciada
com software Chaos. A interface terá identidade própria Arqdor. Não chamar preview
WebGL rasterizado de ray tracing ou de render final; não declarar paridade de qualidade
sem benchmark comparativo com as mesmas cenas.

### Três modos de trabalho

1. **Editor interativo**: importar GLB e demais formatos homologados, orbitar, selecionar
   materiais por identificador verificável, modificar parâmetros PBR, luzes, objetos e câmera.
   Prévia responsiva com qualidade explicitamente identificada; não consumir GPU remota
   desnecessariamente a cada edição.
2. **Prévia progressiva**: cenas versionadas e snapshots, render de menor resolução com
   Cycles e denoise, refinamento sob demanda, opção de cancelar. Render remoto e retorno
   privado; feedback de progresso real e orçamento.
3. **Imagem final**: presets de marketing Full HD, 4K e impressão de alta resolução,
   Cycles com path tracing, iluminação global, reflexos, refração, cáusticas quando
   suportadas, composição, denoise e exportação com metadados de origem.

### Recursos de arquitetura e IA

| Capacidade | Contrato e critérios de aceitação |
| --- | --- |
| Mood Match | Usuário fornece referência; IA sugere iluminação, cor e atmosfera; geometria bloqueada; revisão antes da aplicação |
| Material PBR por imagem | Gerar ou estimar base color, normal, roughness, metallic e height quando possível; preservar escala real e origem; mapas 4K opcionais |
| Detalhe de grandes superfícies | Adicionar microvariações ao shader sem deformar paredes/lajes ou inventar elementos construtivos |
| Interiores com paralaxe | Shader opcional para fachadas; identificar que é simulação, não modelo BIM nem fonte de quantitativos |
| Piscinas e vidros | Fresnel, transmissão, refração e cáusticas configuráveis e testadas, com fallback visual informado |
| Gaussian splats | Tratar como referência visual com limitações; revisar formatos, licenciamento e relighting antes de habilitar |
| Material Node Editor | Interface simples por padrões PBR; edição nodal avançada somente sob opção explícita |
| Frame Buffer Arqdor | Exposição, balanço de branco, curvas, comparação de versões, máscaras, camadas, regiões, exportação |
| Câmeras avançadas | Autofoco por objeto, pontos de vista salvos, exclusão visual por câmera sem mudar geometria original |
| Vídeo | Câmera animada, keyframes, jobs retomáveis e exportação, orçamento separado de imagem |
| Preservação BIM | Identificar e conferir paredes, portas, janelas, pavimentos, cortes, plantas e quadro de esquadrias antes de liberar quantitativos |

### Sequência técnica e gates

- **Gate 0 — Confiabilidade:** build completo, testes de API/frontend, inspeção Blender
  com GLB real, geometria e escala preservadas. Conferir os mesmos materiais entre
  GLTFLoader e Blender; nomes repetidos, instâncias e materiais com múltiplos slots
  devem ser tratados explicitamente. Não habilitar render sem esses testes.
- **Gate 1 — Render funcional:** transportar arquivo privado Contabo ↔ GPU, fila
  persistente, custo visível apenas no superadmin, imagens salvas automaticamente
  na Biblioteca do tenant, fallback GPT por imagem com referência e rotulagem IA.
- **Gate 2 — Qualidade:** comparar arquitetura de referência e resultado lado a lado
  em ao menos exterior diurno, exterior noturno, interior e piscina. Medir resolução,
  fidelidade de câmera, geometrias, materiais, iluminação, ruído, tempo e custo.
- **Gate 3 — Premium:** material PBR/4K, editor avançado, efeitos óticos, mood match,
  compositing, interior de paralaxe, vídeo e integração de gaussian splats.
- **Gate 4 — Entrega técnica:** importações SKP/IFC/OBJ/FBX/GLTF homologadas,
  extração de plantas, cortes, fachadas, esquadrias e quantitativos validados
  por modelo; nunca deduzir dimensões técnicas de uma imagem estilizada.

### Política de capacidade

Contabo permanece no controle e armazenamento privado; GPU externa sob demanda,
com concorrência por tenant, idempotência, timeout, cancelamento e escalonamento.
Cycles suporta vários backends de GPU, mas não assumir que CPU+GPU simultâneas sejam
mais rápidas; medir por hardware, memória da cena e resolução. Não contratar GPU
nem novos serviços automaticamente.

### Estado atual

Somente base GLB, configurações de cena e correspondência de materiais restrita
estão parcialmente implementadas no PR. A qualidade V-Ray, o viewport ray-traced
real, todos os efeitos premium, a importação ampliada e os detalhamentos não foram
homologados. As metas acima não são alegações de funcionalidade existente.

Referências:
- https://www.chaos.com/press/v-ray-7-update-3-real-time-rendering-meets-the-v-ray-viewport
- https://docs.blender.org/manual/en/4.5/render/cycles/gpu_rendering.html
- https://docs.blender.org/manual/en/4.5/render/cycles/render_settings/sampling.html


## GPU e limites de render — contrato do worker (09/10/2026)

O worker aceita `ARQDOR_CYCLES_GPU_BACKEND=CUDA|OPTIX|HIP|ONEAPI|METAL` como
seleção **explícita** do backend de GPU. Quando ausente, usa CPU. Se o dispositivo
compatível não for detectado, registra o motivo e mantém CPU; backend desconhecido
é rejeitado. A disponibilidade de GPU não é garantida e precisa de benchmark real
no host contratado.

O Blender valida antes de alocar memória: resolução de 64 a 8192 pixels por eixo,
com máximo de 8192×8192, e amostras inteiras entre 1 e 4096. Esses limites são
proteções técnicas, não garantia de que a memória disponível suporta a cena.
Custo, filas, orçamento por tenant, watchdog e retomada ainda são pendentes.

Não habilitar render 3D para usuário final até provar importação, fidelidade,
permissões, transferência privada, persistência e geração de arquivo real.


## Fila do worker — lote 09/10/2026

O serviço Flask agora utiliza executor com concorrência limitada
(`ARQDOR_RENDER_WORKERS`, padrão 1, máximo 4) e registra status da execução em
SQLite (`ARQDOR_RENDER_QUEUE_DB`, padrão `/tmp/renders/jobs.sqlite3`).
Requisições repetidas com mesmo `jobId`, tenant e cena não iniciam uma segunda
execução enquanto o job não falhou. O mesmo ID vinculado a outra cena ou tenant
é recusado. Identificadores são validados antes de montar paths de saída.

**Limites:** o banco SQLite precisa ficar em volume persistente configurado;
o default em `/tmp` não garante retenção após troca de container. Após reiniciar,
jobs que estavam aguardando/processando são marcados como interrompidos, sem
retomada automática. Ainda falta recuperação supervisionada, controle real de
orçamento/recursos, cancelamento e validação de fluxo completo. O upload legado
para Supabase Storage público ainda existe — **não habilitar o render 3D para
usuários** até migrar para R2 privado/Biblioteca e validar autorização da mídia.
A fila continua local por host, não distribui jobs entre múltiplas GPUs.


## Entrega de PNG privado — transição para R2 (09/10/2026)

O worker não envia mais automaticamente os novos PNGs ao bucket público legado
Supabase neste fluxo: o resultado é guardado localmente em
`OUTPUT_DIR/<jobId>.result.png`. Após concluir o job, um cliente de backend
autenticado com `X-Blender-Secret` pode solicitar
`GET /render/<jobId>/artifact` e receber `image/png` com cache privado.
A rota somente aceita IDs validados, jobs concluídos e arquivo existente.
Não expor o segredo ao navegador. O arquivo é retido no worker para futura
transferência autenticada.

**Gate obrigatório:** esta mudança isolada NÃO conclui a integração R2 ou a
Biblioteca do tenant. A branch atual contém um adaptador `objectStorage.ts`
anterior à migração R2 da main; antes de conectar a API ao artefato, é preciso
reconciliar o adaptador R2 atualizado e a autorização específica de mídia por
tenant/projeto. O artefato local pode desaparecer caso o volume não seja
persistente e ainda não há limpeza por retenção, comprovação de gravação ou
retentativa do upload. Render 3D permanece desabilitado e sem homologação.


## Registro de render na Biblioteca (lote de integração)

O serviço da API recupera o PNG da rota autenticada do worker, verifica
assinatura e limite do arquivo, salva usando o adaptador R2-first de `main`,
e registra `media_projects`, `media_assets` e `media_versions` vinculados
ao tenant e aos identificadores da cena/render nos metadados.

**Ainda não liberar:** o fluxo requer testes reais de build, acesso ao R2,
consulta de mídia pelo tenant, rota de visualização autorizada, reconciliação
de falha após upload e antes de registrar ativo, prevenção de duplicação por
`archRenderId`, geração da imagem no worker e verificação visual. O código
não comprova que GPU, fila, Biblioteca ou preview estejam operacionais.
O worker e a API precisam estar homologados juntos.


## Passeio virtual MP4 (etapa de implementação)

O worker Blender recebe `sceneConfig.video` com `fps` e `keyframes`
(`second`, `position`, `target`, coordenadas do visualizador Y-up).
O contrato valida ordem crescente, duração, FPS e números finitos.
O Blender converte para Z-up, anima uma câmera e solicita saída H.264/MP4.
Esta primeira etapa impõe até 720 frames por job; a configuração não implica
que o limite atual de execução do worker (600 s) seja suficiente.

O worker armazena o MP4 na mesma pasta privada do PNG e só o disponibiliza
pela rota autenticada de artefatos. A API registra o arquivo como `video/mp4`
na Biblioteca do tenant via R2, sem inserir MP4 nos campos exclusivos de imagem.

**Status:** código integrado, ainda sem teste Blender/FFmpeg, sem preview de
vídeo no Arqdor, sem timeline visual, progresso por quadro, cancelamento ou
retomada confiável. Não habilitar vídeos em produção. SKP/IFC/FBX/OBJ, geração
de documentações BIM e IA avançada também não foram implementados integralmente.
