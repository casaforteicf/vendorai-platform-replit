# ARQ-PARAM-11 — invariantes de restauração

Versão: 2026.10.11.11
Código: 08e0e0679c1e7de031ca49909802b45774410fa9
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Correção da edição transacional para rejeitar IDs compartilhados entre tipos e pavimentos negativos/fracionários/não finitos, evitando snapshots aceitos na edição e rejeitados na reabertura. Teste integrado do modelo: criar laje/escada/cobertura, mover, redimensionar, duplicar, serializar configuration.architecturalModel, restaurar, comparar quantitativos e primitivas 2D/3D, remover cópia e verificar isolamento dos vãos.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptArchitecturalModel.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalLifecycle.test.ts

## Verificação
51 testes locais aprovados em 9 arquivos. TypeScript do novo teste e dependências aprovado. Teste usa serialização JSON local, sem chamada HTTP. Histórico do Planner inspecionado; desfazer/refazer real na interface não testado neste lote. Não equivale a homologação.

## Pendências
Ciclo salvar/reabrir pelo backend, validação visual/navegador/mobile e desfazer/refazer E2E ainda pendentes. Build completo não executado. Contabo/publicação permanecem adiadas por orientação do usuário; sem merge em main ou deploy.
