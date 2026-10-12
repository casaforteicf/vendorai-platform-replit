# ARQDOR RENDER-01 v0.4 — CPU BVH experimental

## Implementado
- `render-bvh.ts`: BVH binária por divisão mediana do centróide no eixo dominante; folhas até 8 triângulos.
- AABB slab intersection com rejeição antecipada.
- Interseção raio-triângulo Möller–Trumbore, dupla face, distância positiva, material e coordenadas baricêntricas.
- Consome `GeometryTransfer` do exportador já incorporado em ConceptWebGLScene, mas o cálculo de interseções é **isolado** e ainda não ligado ao fluxo de geração de imagem.
- Rejeita transferências marcadas incompletas, avisos de geometria e coordenadas inválidas.
- Testes em `render-bvh.test.ts` para acerto, erro, cena vazia e geometria incompleta.

## Limitações importantes
- BVH é protótipo de CPU JS: não otimiza SAH, não usa GPU, não usa workers, não possui atualização incremental.
- Não realiza path tracing, GI, luz, amostragem de pixels nem produz render fotorrealista.
- Testes escritos mas ainda não executados; build e homologação pendentes.
- Antes de conectar ao UI/produzir imagem: validar transformações, normais, instâncias, multicamadas, materiais, UVs, texturas, iluminação e cenas grandes.

Status: PR draft; sem merge/deploy.
