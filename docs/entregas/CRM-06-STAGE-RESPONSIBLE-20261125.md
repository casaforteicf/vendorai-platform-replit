# CRM-06 — responsável em etapa sem funções configuradas

Atualização: 2026-11-25. Branch: `fix/stage-responsible-empty-20261125`.
Base: `42bec3762`.

## Sintoma

Ao mover um lead para **Execução / Pedidos → Pedido confirmado** com um
responsável ativo selecionado, a API respondia `422 STAGE_RESPONSIBLE_REQUIRED`
e o modal não concluía a movimentação.

## Causa

A etapa `pedido_confirmado` está cadastrada com `responsaveis_funcoes = {}`.
O helper `userMatchesStageResponsibleFunctions` tratava lista vazia como
"ninguém está autorizado", apesar de a UI permitir escolher qualquer responsável
e de o comportamento anterior (PR #3298) aceitar etapa sem configuração.

## Correção

- Lista vazia agora significa **sem restrição**: qualquer usuário ativo do tenant
  pode assumir.
- Administradores (`super_admin`, `tenant_admin` ou função `administrador`)
  continuam podendo assumir qualquer etapa, mesmo quando há funções configuradas.
- A regra foi aplicada no backend e no seletor do frontend (`Deals.tsx`), para
  não esconder usuários elegíveis.
- O helper foi extraído para `lib/stage-responsible.ts` e ganhou testes unitários.

## Validação

- `vitest src/__tests__/deal-stage-responsible.test.ts`.
- `tsc -p tsconfig.launch-ci.json --noEmit`.
- Transferência real para `execucao/pedido_confirmado` com
  `Venda Direta Krafht` (função `representante_comercial`) em tenant com etapa
  sem funções configuradas.
