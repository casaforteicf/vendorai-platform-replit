# CRM-3517 — falha ao abrir orçamento para impressão v1

2026-10-15. Branch fix/proposta-read-reference-error-20261015. Implementação backend 73431ddf86c5b1686cc792a3273f8fb344a8634f.

Causa encontrada no código atual da main: GET /propostas/:id executava registro de alteração usando parsed e existing, variáveis inexistentes no handler de leitura. Para orçamento autorizado, isso lançava ReferenceError antes de res.json. Removido o registro indevido do GET; preservados controles de tenant e responsabilidade.

CSS da página de impressão: position fixed substituído por absolute, permitindo fluxo do orçamento ao longo de várias folhas, sujeito à validação visual autenticada.

Testes: nove testes GET aprovados (leitura, permissões, isolamento e listas), vinte testes fora do filtro. Na suíte completa, 25 aprovados e quatro falhas em mutações de responsabilidade (HTTP 500 no lugar de 403), não resolvidas neste lote. Mock de propostaApresentacaoSchema corrigido para permitir carregar suíte; testes GET agora verificam ausência de update.

Build backend em validação local; resultado final no PR. Não houve validação visual autenticada, geração real do PDF da proposta, homologação ou deploy. PDF server-side pode possuir falha adicional, ainda sem diagnóstico ao vivo. Browser Agent continua retornando tenant_not_found para casaforteicf. Necessário registrar lote/SHA no executor Contabo, cumprir gates e homologar.

Sem migrations. Não afirmar impressão completa validada nem publicação sem evidência.
