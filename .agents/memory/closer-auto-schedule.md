---
name: Closer auto-schedule Google Meet
description: Pattern for auto-scheduling a Google Calendar event when Closer detects scheduling intent, including all edge cases and fallback behavior.
---

## Rule
When a lead asks for a meeting link, the Closer auto-schedules via Google Calendar before the LLM call, injecting the real Meet URL into the prompt. When Calendar is unavailable, inject `meetingRequested: true` so the agent confirms the link is coming instead of asking for availability.

**Why:** Without pre-scheduling, the LLM invents placeholder links or asks for the lead's availability — both bad UX.

## How to apply
- SCHEDULING_INTENT_RE in `agents.ts` (HTTP path) and `agent-dispatch.ts` (webhook path) detects intent.
- Query: `db.execute(sql\`SELECT id FROM agendas WHERE tenant_id = ${tenantId} AND google_refresh_token IS NOT NULL...\`)` — **must use `sql` tagged template**, not raw string. Raw string returns `QueryResult` not plain array; `.rows[0]` is the correct accessor.
- Happy path: `closerEnrichedScenario = { meetLink, dataHoraInicio }` → `buildCloserPrompt` injects the URL into the system prompt with REGRA CRÍTICA instruction.
- `existingAg.meetLink === null`: treat same as no-link fallback (`meetingRequested: true`), not as "link available".
- Fallback (no OAuth / invalid_grant / no meetLink returned): `closerEnrichedScenario = { meetingRequested: true }` → prompt instructs "confirm link coming, DO NOT ask for availability".
- `buildCloserPrompt` handles: `scenario.meetLink` (inject URL) OR `scenario.meetingRequested` (1-sentence confirmation).

## Known issue (2026-07-11)
Tenant `1d4ea673` agenda `ecba77d5` has `invalid_grant` — refresh token revoked. User must reconnect Google Calendar in Agendas settings. Fallback works correctly in the meantime.
