# MKT-P2.2 — Enforcement do playbook na publicação

Data: 2026-11-27
Branch: `feat/mkt-p2-enforce` (base `main` @ 503a0baa8)

## Entregue
- A publicação orgânica agendada valida a peça contra o playbook do canal **antes** de criar a publicação.
- Violação gera erro com código estável:
  `channel_rule_violation:<codigo>:<mensagem>` (ex.: `video_obrigatorio`, `formato_incompativel`, `midias_demais`).
- A falha aparece no fluxo existente de publicação (a peça não vai ao ar quebrada).

## Validação
- API build **EXIT 0**.
- Testes do playbook **7/7**.

## Limite
- `destino_obrigatorio` (Google) não é bloqueado no orgânico — pertence ao fluxo de anúncios.
