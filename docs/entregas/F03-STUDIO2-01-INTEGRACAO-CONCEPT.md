# F03-STUDIO2-01 — integração Concept (13/10/2026)

Estado: implementação parcial, validação local limitada; NÃO homologado e NÃO liberado para merge.

Baseline: e75d85d7a6fba122fe9040c29c004ce42cb8f337
Branch proposta: feat/arqdor-studio2-concept-gated-20261013

## Alterações
- Integra o CSS do pacote v6 no Concept atual sem substituir o arquivo por uma versão antiga.
- Preserva a estabilização mobile já presente na main.
- Ativação somente com VITE_ARQDOR_STUDIO2_CONCEPT=true, modo profissional e sessão não guest. Flag ausente mantém o layout anterior.
- Tokens alinhados a docs/arqdor-studio-2-design-system.md.
- Canvas flexível ao lado do painel no desktop e toolbar sem offset duplicado.
- aria-label, aria-controls, aria-expanded e aria-pressed acompanham a biblioteca real.
- Nenhuma alteração de API, banco, geometria, autosave, histórico ou handlers.

## Evidências locais
TypeScript 5.9.3 parseSourceFile: nenhum erro de sintaxe no TSX.
Comparação AST: 335 handlers JSX idênticos à baseline.
16 combinações de flag/guest/modo: somente flag true + não guest + professional ativa.
PostCSS 8.5.6: 28 regras restritas a .arqdor-concept-studio.arq-studio-active.
Esses checks NÃO substituem typecheck, build ou QA funcional.

## Pendente
- Gates completos do protocolo (libs, backend tsc/build, Vite, bundles, testes).
- Revisão visual com referência aprovada; v6 ainda deriva da estrutura legada.
- Redimensionamento e persistência de painéis por usuário/dispositivo, propriedades contextuais definitivas e integração transversal dos módulos.
- Fluxos 2D/3D, salvar/reabrir, desktop/mobile, teclado, RBAC/tenants.
- Homologação do SHA exato na Contabo.
- Reconciliar por intenção com #3503/#3513 antes de integrar. Não copiar ConceptPlanner completo entre branches.

## Bloqueios
Clonagem local privada sem credencial. Leitura/escrita GitHub disponível pelo conector.
Operador Contabo requer /var/lib/vendi-release/manifests/<LOTE>.env; conexão expõe build/homologate/rollback/releaseStatus, sem cadastro.
Não alterar scripts/cron nem registrar lote por vias alternativas sem procedimento autorizado.
Produção não alterada. Não habilitar flag em produção.
