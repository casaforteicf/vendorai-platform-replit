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

## Próximas integrações obrigatórias antes de habilitar para usuários

- Interface guiada: importar → conferir modelo → materiais → câmera/luz → gerar
  → resultados; manter Render IA atual e uso mobile.
- Upload autenticado e versões no disco persistente do Contabo, com download
  privado e captura na Biblioteca de Mídia. O worker atual ainda usa o upload
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
