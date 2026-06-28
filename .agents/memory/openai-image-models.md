---
name: OpenAI image models for this account
description: DALL-E 2/3 não existem nesta conta; usar gpt-image-1 que retorna b64_json; fazer upload para object storage.
---

# OpenAI Image Generation — esta conta

**Why:** A chave OPENAI_API_KEY desta conta tem acesso a modelos de imagem novos mas NÃO ao dall-e-2/dall-e-3. Chamar esses modelos retorna `400 The model 'dall-e-3' does not exist.`

**Models disponíveis para imagem:** `gpt-image-1`, `gpt-image-1-mini`, `gpt-image-1.5`, `chatgpt-image-latest`, `gpt-image-2`.

**Formato de resposta:** `gpt-image-1` retorna `data[0].b64_json` (base64), NÃO `data[0].url`.

**How to apply:** 
1. Decodificar base64 → Buffer
2. `ObjectStorageService.savePrivateBuffer(buf, "image/png", "uuid.png")` → `/objects/quotes/uuid.png`
3. Converter para URL servível: `/api/storage/objects/quotes/uuid.png`
4. Rota `/storage/objects/*` já está open (auth comentada) — imagem acessível sem token

**Pattern implementado em:** `artifacts/api-server/src/lib/content-generation.ts` — `generateImageForContent()` tenta models em ordem de prioridade e faz upload automático se b64_json.

**Parâmetros válidos para gpt-image-1:**
- `quality`: `"low"` | `"medium"` | `"high"` | `"auto"` — NÃO aceita `"hd"` (retorna 400)
- `size`: `"1024x1024"` | `"1536x1024"` | `"1024x1536"` | `"auto"` — NÃO aceita `"1792x1024"`

**How to apply:** Ao gerar imagem com gpt-image-1, usar `quality: "high"` e size `"1536x1024"` para landscape.
