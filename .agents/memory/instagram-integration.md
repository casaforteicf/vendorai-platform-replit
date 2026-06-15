---
name: Instagram integration pattern
description: How Instagram DM sending/receiving is wired in VendorAI — credentials, webhook, IGSID, Graph API.
---

## Pattern

**Credentials** stored in `agent_configs` table:
- `instagramPageAccessToken` — long-lived Page Access Token (~60 days)
- `instagramPageId` — Meta Page ID
- `instagramUsername` — display only

**Lead identity** stored in `leads.instagramScopedId` (IGSID) — set when lead sends first DM via webhook.

**Inbound DMs** arrive via: `POST /tenants/:tenantId/webhooks/instagram`
- Same `X-Webhook-Secret` header auth as WhatsApp webhook
- Body: `{ igsid, mensagem, nome? }`
- Creates lead by IGSID if not found; creates instagram conversation; dispatches AI agent

**Outbound DMs** sent via `omnichannel.ts → sendInstagramMessage()`:
- `POST https://graph.facebook.com/v19.0/me/messages`
- Requires `lead.instagramScopedId` to be set (lead must have messaged first)
- Throws `InstagramNotConnectedError` (422) if no token; `InstagramScopedIdMissingError` (422) if no IGSID

**Frontend config**: Configurações → Integrações → "Instagram DM — Omnichannel" card.
Uses `useUpdateAgentConfig` to save/clear credentials on `agent_configs`.

**Why:**
Meta's Instagram API requires a scoped user ID per page — you can't send to a user by email/phone. The lead must initiate contact first, which sets the IGSID via the inbound webhook.

**How to apply:**
- Always check `instagramPageAccessToken` in `agent_configs` before sending
- Always check `instagramScopedId` on the lead before sending
- IGSID is page-scoped (different per Business page), not globally unique
