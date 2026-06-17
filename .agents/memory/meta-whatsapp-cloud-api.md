---
name: Meta WhatsApp Cloud API
description: Padrão de integração Meta WhatsApp Cloud API (oficial) — substitui Z-API; campos, webhook, envio e gotchas de TypeScript.
---

## Campos no agent_configs
Adicionados: `metaPhoneNumberId`, `metaWabaId`, `metaAccessToken`, `metaVerifyToken` (todos nullable text).
Campos Z-API mantidos por backward compat (fallback no omnichannel).

## Envio (omnichannel.ts)
- Função: `sendMetaWhatsAppMessage(phoneNumberId, accessToken, phone, message, log, isAiResponse?)`
- URL: `POST https://graph.facebook.com/v20.0/${phoneNumberId}/messages`
- Payload: `{ messaging_product: "whatsapp", to: normalizedPhone, type: "text", text: { body: message } }`
- Header: `Authorization: Bearer ${accessToken}`
- Normalização: `phone.replace(/\D/g, "").replace(/^0+/, "")` — só dígitos, sem +
- Prioridade: Meta se configurado → Z-API fallback → WhatsAppNotConnectedError

## Webhook de entrada (webhooks.ts)
- `GET /api/webhooks/meta/whatsapp` — verifica hub.mode=subscribe + hub.verify_token contra `metaVerifyToken` em qualquer agent_config; responde com hub.challenge
- `POST /api/webhooks/meta/whatsapp` — ACK imediato (200) antes de processar; resolve tenant via `metaPhoneNumberId` → `phoneNumberId` do `metadata`; processar apenas `type === "text"`
- `dispatchAgentBackground` exige: `{ tenantId, leadId, mensagem: textBody, log: req.log }` — tudo no objeto, sem 2º argumento

## Gotchas TypeScript
- `leadsTable.insert.values({})`: campo `canal` NÃO existe no schema do leads — omitir
- `enviadoPor: "lead"` para mensagens de entrada (não "cliente")
- `dispatchAgentBackground` aceita 1 argumento — `log` e `mensagem` são campos internos, não argumento separado

## Webhook verification no painel Meta
- Ir em developers.facebook.com → App → WhatsApp → Configuração → Webhook
- URL: `https://<domínio>/api/webhooks/meta/whatsapp`
- Verify Token: o `metaVerifyToken` salvo no agent_config
- Assinar o campo `messages`

## Teste de conexão
- `GET /api/agent-configs/:id/meta-status` — chama `GET https://graph.facebook.com/v20.0/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`
- Retorna: `{ configured, verified, displayPhoneNumber, verifiedName, qualityRating }`

**Why:** Meta Cloud API é oficial (não banível), não requer instância ativa no celular. Z-API foi mantida como fallback para tenants que ainda não migraram.
