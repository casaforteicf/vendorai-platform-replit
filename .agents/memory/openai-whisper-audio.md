---
name: Z-API media interpretation (audio, image, PDF)
description: Como o webhook Z-API interpreta cada tipo de mídia e injeta texto no pipeline de auto-quote/agente.
---

## Tipos suportados no webhook `/tenants/:id/webhooks/zapi`

| `type` no payload | Campo de URL | Serviço | `tipoConteudo` salvo |
|---|---|---|---|
| `chat` / `text` | `text.message` ou `body` | — | `texto` |
| `audio` / `ptt` | `audio.audioUrl` | `audio-transcription.ts` → Whisper-1 | `audio` |
| `image` | `image.imageUrl` | `media-interpretation.ts` → GPT-4o-mini Vision | `imagem` |
| `document` (PDF/.doc) | `document.documentUrl` | `media-interpretation.ts` → pdf-parse | `documento` |
| outros | — | ignorado | — |

## Invariante: pipeline único
Após a extração/transcrição, `mensagem` (string) entra no mesmo fluxo:
- `auto-quote` (lead.source === "whatsapp") → `runAutoQuotePipeline`
- `dispatchAgentBackground` se não gerar orçamento
- DB: `conteudo = mensagem`, `tipoConteudo = variável tipoConteudo`

## Transcrição de áudio
- `whisper-1`, `language: "pt"`, `response_format: "text"` → retorna string direta
- `new File([buffer], "audio.ogg", ...)` para compatibilidade com o SDK

## Interpretação de imagem
- `gpt-4o-mini` + Vision com prompt focado em intenção de compra
- Legenda (caption) do WhatsApp inclusa no prompt se presente
- Prefixo `[Imagem recebida]` adicionado ao texto resultante

## Extração de PDF
- `pdf-parse` extrai texto do buffer
- Trunca em 3.000 chars para evitar explosão de tokens
- Prefixo `[PDF recebido: "filename.pdf"]` adicionado
- Documentos não-PDF/Word são ignorados com `unsupported_document_type`

## Tratamento de erros
Todos os erros retornam HTTP 200 + `{ ignored: true, reason: "..." }` para evitar retry do Z-API.

**Why:** Z-API envia cada tipo de mídia como mensagem separada com `type` diferente. Centralizar a extração de texto em serviços isolados evita duplicação e mantém o pipeline de IA (auto-quote, agente) agnóstico ao canal de entrada.
