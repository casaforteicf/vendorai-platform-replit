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
