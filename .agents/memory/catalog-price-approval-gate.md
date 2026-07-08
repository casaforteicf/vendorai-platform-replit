---
name: Catalog price divergence approval gate
description: Pattern for blocking deal auto-closure when proposal value diverges from catalog price, requiring manual approval via agent_task.
---

Deal-closure code paths (any place that moves a deal to "ganho") must check the closing value against `produtos_catalogo.preco_base` before closing. If items can be matched to catalog entries (by SKU, else case-insensitive name) and the total diverges, do NOT close — instead create an `agent_tasks` row (`actionType: "aprovacao_fechamento"`, `status: "pendente_aprovacao"`) carrying enough payload to re-run the exact same closure later (`origin` tag + original request body/ids), notify the deal owner, and return a "pending approval" response instead of the normal success shape.

**Why:** There were two independent deal-closing entry points (`confirm_closure` route and `proposal_accepted` lib), each needing the same guard; duplicating the check inline led to needing a shared `checkCatalogMatch` helper. Divergence must only block when a catalog basis actually exists — items with no catalog match at all should not block closure (no basis to compare against).

**How to apply:** When adding any new deal-closure trigger, call the shared catalog-check helper first. Extract the actual closure logic into a standalone exported function (not just the route handler) so the `agent_tasks` executor can call it again after approval via `POST /agent-tasks/:id/approve`. Give the pending-approval payload an `origin` discriminator so the shared executor knows which closure function to re-invoke. Any endpoint/UI surface that consumes the closure response must treat the response as a union (`{pendingApproval, agentTaskId, divergence}` vs. the normal success shape) — don't assume the full success shape is always present.
