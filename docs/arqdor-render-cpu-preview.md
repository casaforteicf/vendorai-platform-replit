# ARQDOR RENDER-01 — v0.5 CPU diagnostic

## Deliverable
`render-cpu-preview.ts` implements an isolated deterministic camera raycaster using `createRenderBvh`. It produces an RGBA pixel buffer (not a PNG), renders front/back-face intersections, interpolated normals, a fixed ambient term, a directional Lambert light and hard shadow rays, plus a uniform sky.

It accepts triangle transfer from `render-geometry-export.ts` and material ID to hexadecimal base color mapping. The function does not mutate source meshes and does not invoke any backend/API. Runtime must explicitly call it; existing UI rendering stays unchanged.

## Caveats
- CPU synchronous; capped at 262144 pixels and not scheduled on a worker.
- Not physically based, no GI, path tracing, texture sampling, transparency, specular BRDF, tone mapping, anti-aliasing, progressive output or denoising.
- Need to validate source normals, mirrored world transforms and groups; source exporter rejects unsupported geometry.
- This isolated diagnostic is **not** selectable as production-quality render or an offline full renderer.
- Added tests are pending execution; typecheck, build and homologation remain open.

## Next sequence
1. Execute tests, TypeScript checks and scene fixtures.
2. Worker-based progressive CPU diagnostic, cancellation and budgets.
3. Preserve uv/material groups and capture emissive, directional and area lights.
4. Proper physical integrator and rendering adapter (selectable only when feature-ready).

No merge/deploy.
