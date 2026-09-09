# Contrato de qualidade testado

A suíte `app-builder-ai-architect.test.ts` cobre os comportamentos mínimos que não podem regredir:

- duas passagens no modo profundo;
- uma passagem no modo rápido;
- preservação da validação determinística nos dois modos;
- bloqueio de Action inventada fora do registry;
- suporte de contexto a tenant, prospect e projeto interno.

Os cenários de negócio de referência ficam em `docs/app-builder-ai-quality-benchmark.md`.