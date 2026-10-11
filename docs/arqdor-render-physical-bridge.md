# ARQDOR — RENDER-01 · ponte de inspeção da cena (v0.2)

## Implementado
- `ConceptWebGLScene` aceita `renderSceneSnapshotToken` e callbacks para obter metadados da cena em execução.
- Ao incrementar o token, depois de o conteúdo estar pronto, `captureRenderScene` percorre `modelRoot` **sem alterar a geometria**.
- Metadados: ID da malha, transformação em espaço global, contagem de triângulos, materiais PBR básicos, câmera, avisos.
- O token só é processado uma vez, inclusive após rerender do componente.
- O comportamento padrão permanece inalterado para consumidores que não passam novas props.

## Integração para consumidores
```tsx
const [captureToken, requestCapture] = useState(0);
<ConceptWebGLScene
  {...sceneProps}
  renderSceneSnapshotToken={captureToken}
  onRenderSceneSnapshot={(snapshot) => { /* inspecionar metadados */ }}
  onRenderSceneSnapshotError={(message) => { /* avisar usuário */ }}
/>;
<button onClick={() => requestCapture(v => v + 1)}>Inspecionar cena</button>
```

## Limites e critérios de aceite
- O snapshot **não contém buffers de vértices, índices, texturas, iluminação nem pixels**.
- O snapshot **não é um arquivo glTF**, não cria imagem e não ativa path tracing.
- O adaptador real precisará do transporte de buffers e materiais, luzes/HDRI, validação BVH e render na GPU/CPU.
- Checar montagem com os vários pavimentos, seleção e alteração de materiais, nenhuma captura espontânea.
- Realizar typecheck, build, regressão visual e testes em homologação antes de habilitar o recurso no produto.
- Não publicar, não fazer merge a partir deste lote sem o processo normal de homologação.

## RENDER-01 v0.3 — transporte de triângulos no visualizador existente
- `render-geometry-export.ts` extrai posições (XYZ em mundo), normais transformadas, UVs e ID do material.
- `ConceptWebGLScene` expõe `renderGeometryExportToken`, `onRenderGeometryExport` e `onRenderGeometryExportError`.
- Captura somente sob demanda, com limite conservador de 250.000 triângulos; saída com `truncated=true` **não deve ser renderizada**.
- Malhas instanciadas, deformadas ou com múltiplos materiais são rejeitadas, sem disfarçar perda de fidelidade.
- Não inclui texturas, luzes, cáusticas, BVH, path tracing nem dados persistidos em backend.
- Requer testes de geometria (transformação, normais, UV, grupos, instancing, limites), typecheck e build antes de homologação.

```tsx
const [exportToken, requestExport] = useState(0);
<ConceptWebGLScene
  {...sceneProps}
  renderGeometryExportToken={exportToken}
  onRenderGeometryExport={(geometry) => {
    if (geometry.truncated || geometry.warnings.length) {
      // Avaliar avisos e impedir render incompleto antes de enviar ao adaptador físico.
      return;
    }
    // Envio futuro ao adaptador de renderização física.
  }}
/>;
<button onClick={() => requestExport(v => v + 1)}>Preparar geometria</button>
```
