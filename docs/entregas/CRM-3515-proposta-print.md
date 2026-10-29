# CRM-3515 — impressão de proposta v1

Atualização: 2026-10-15.

Objetivo: tratar carregamento infinito na rota /propostas/:id/print.
Branch: fix/proposta-print-loading-20261015.
Commit da implementação: badb7b8404a10acd1d44d3ea467cc26a7a6c7805.

Implementado: requisições de proposta e cliente com timeout de 20 segundos e cancelamento; sem retries automáticos; erro de proposta com tentativa manual; dados de cliente não bloqueiam a visualização; impressão desabilitada durante carregamento/erro de cliente; documento sem lead pode ser exibido; título independente de lead.

Evidências locais: git diff --check aprovado. Build Vite aprovado (4488 módulos, 37,33s), com avisos de sourcemap/chunks. Auditoria de bundles falhou em LeadWorkspace: 51,32 kB / 50 kB; arquivo não alterado neste lote. Typecheck global iniciado, sem resultado final ao registrar; não aprovado. Demais gates de integração não executados.

Limitações: causa em produção não confirmada. Browser Agent retornou tenant_not_found ao consultar casaforteicf; não foi possível inspecionar requisições reais da proposta. Operador Contabo releaseStatus CRM-3515 retornou LOT_NOT_REGISTERED, BUILD=BLOCKED, PRODUCTION=untouched. Necessário registrar lote/SHA no executor, executar gates e homologar antes de promoção.

Estado: implementado, build local aprovado; validação técnica completa e homologação pendentes. Sem merge/deploy. Sem migrations ou alteração de dados. Responsável pelo próximo passo: integrador Contabo.
