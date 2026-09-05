# VendorAI Platform Foundation

Este documento registra a fundação da evolução do VendorAI para uma plataforma multi-vertical orientada por módulos, agentes, skills, canais e intelligence layers.

## Princípios

- Não criar módulos paralelos.
- Reaproveitar CRM, campanhas, Revenue Scout, mídia, site/LP e publicação existentes.
- Centralizar capacidades em registries tipados.
- Aplicar herança Platform → Vertical → Tenant → User.
- Tratar Campaign como entidade central de Marketing.
- Tratar agentes como orquestradores das ferramentas oficiais.
- Tratar skills como capacidades especializadas, não agentes duplicados.
- Tratar canais com linguagem, formatos, métricas e políticas próprias.
- Separar Creative/Design Layer da lógica estratégica de Marketing.
- Publicação e gasto devem respeitar autorização server-side, autonomia, limites e QA.
- TikTok, YouTube, LinkedIn e Google PMax permanecem `prepare-only` até existir integração oficial de publicação.

## Fundação técnica

A primeira etapa inclui:

- Module Registry
- Vertical Registry
- Agent Registry
- Skill Registry
- Channel Registry
- Vertical Blueprint schema
- Marketing Agent blueprint
- Creative/Design capability catalog
- Channel Intelligence catalog

A implementação inicial é deliberadamente aditiva e sem alteração destrutiva de fluxos existentes. A migração dos módulos atuais para consumo desses registries deve ocorrer incrementalmente.

## Validação externa

Quando o GitHub Actions não consegue atribuir runner ao job, a PR pode ser validada por builds isolados vinculados ao SHA da própria branch. A evidência só é aceita quando o provedor informa explicitamente a branch e o commit avaliados; builds de `main` ou snapshots reutilizados não substituem essa validação.

Os gates equivalentes ao CI usados na PR #668 são:

- `pnpm install --frozen-lockfile`
- `pnpm --filter @workspace/vendor-brain typecheck`
- `pnpm --filter @workspace/api-server exec tsc -p tsconfig.launch-ci.json --noEmit`
- Vitest focado de regras críticas da API
- `pnpm --filter @workspace/api-server run build`
- Preview Vercel do mesmo SHA como gate adicional do frontend

Essa validação comprova instalação, tipagem, testes e build. Ela não substitui smoke integrado com banco, Meta, Google ou demais serviços externos.

## Estado de fechamento da fundação

A PR #668 já cobre a fundação de agentes/skills/canais, Marketing Agent transversal, Creative Runtime, Design QA, Revenue Scout routing, learning orgânico e pago, Site/LP runtime, Content Studio e Channel Publish Bridge.

O fluxo Plano de Mídia → executores preserva o briefing canônico da campanha. Para mídia paga, a tela Ads abre o rascunho contextualizado sem publicar, ativar ou iniciar gasto automaticamente.

Antes do merge final:

- comparar o head atual com `main`;
- confirmar os gates externos no mesmo SHA do head;
- manter integrações sem publisher oficial em `prepare-only`;
- não considerar como smoke integrado qualquer teste executado sem secrets/serviços externos;
- incorporar somente após decisão explícita de merge.
