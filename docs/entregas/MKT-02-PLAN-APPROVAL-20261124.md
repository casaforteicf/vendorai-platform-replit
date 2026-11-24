# MKT-02 — Aprovar planejamento direto da aba Conteúdos

Atualização: 2026-11-24. Branch: `fix/plan-approval-content`.
Base: `6263071d8`.

## Sintoma

No Plano de Mídia `b1586e18-...` (AJ Termas), o item “Reels 1: Educação…” estava
em **“Ainda aguardando sua aprovação”**, mas o botão **Aprovar e liberar**
ficava desabilitado. O tooltip dizia “Aprove primeiro a direção do Plano de
Mídia”, porém a ação de aprovação só existia na aba **Planejamento** — o usuário
estava em **Conteúdos**.

## Causa

`ContentProductionQueue` desabilita o item enquanto
`plan.conteudo.statusPlanejamento !== "aprovado"`. O plano estava
`em_revisao` no banco. O componente `PlanningReviewBridge` que tem o botão
“Aprovar planejamento” só é montado quando `tab=planejamento`; na aba
`tab=conteudos` não havia como aprovar.

## Correção

Na aba **Conteúdos**, quando o plano não está aprovado, aparece um banner:

> **O Plano de Mídia ainda está em revisão**
> Aprove o planejamento para liberar o botão Aprovar e liberar e a produção.

Com:
- **Aprovar planejamento** — `PATCH /api/tenants/:t/media-plan/:id` com
  `{ aprovar: true }`, recarrega o plano e libera os itens;
- **Revisar planejamento** — navega para `tab=planejamento`;
- erro da API exibido no próprio banner.

## Validação

- Aprovação testada em uma **cópia** do plano AJ Termas (mesmo conteúdo,
  `statusPlanejamento=em_revisao`): `PATCH {aprovar:true}` retornou `200` e o
  clone ficou `aprovado`; a cópia foi removida. O plano original não foi alterado.
- `vite build`: exit 0.
- `tsc` do frontend: sem novos erros em `ContentProductionQueue` (o projeto tem
  erros antigos em outros componentes, fora deste escopo).

## Como concluir a aprovação e gerar o Reels

1. Abrir **Conteúdos** do plano.
2. Clicar **Aprovar planejamento** no banner.
3. Abrir **Abrir / Editar** no item Reels → **Aprovar e liberar**.
4. No item aprovado, clicar **Abrir executor** (Reels não é gerado pelo lote
   direto; é vídeo). O executor usa o provedor de vídeo configurado.

## Limite

Vídeo/Reels continua dependendo de provedor (Vertex/Veo ou Replicate). Sem
credencial, o executor falha com mensagem de configuração; a aprovação em si não
depende disso.

## Estado

Implementado e validado tecnicamente. Sem merge/deploy automático.
