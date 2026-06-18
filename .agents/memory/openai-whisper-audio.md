---
name: OpenAI Whisper Audio Transcription
description: Como o pipeline do Z-API lida com mensagens de áudio — download, transcrição Whisper, e tratamento como texto normal.
---

## Pipeline de áudio

1. **Z-API envia** `type: "audio" | "ptt"` com `audio.audioUrl`
2. **Webhook** (`webhooks.ts`) detecta o tipo, extrai a URL
3. **Transcrição** (`audio-transcription.ts`): download via `fetch()`, transcrição via OpenAI Whisper (`whisper-1`, `language: "pt"`, `response_format: "text"`)
4. **O texto transcrito** é tratado exatamente como texto digitado — mesma pipeline de auto-quote e agente
5. **Mensagem armazenada** com `tipoConteudo: "audio"` no DB, mas `conteudo` contém o texto transcrito

## Regras
- Se áudio sem `audioUrl` → ignorar com `reason: "audio_without_url"`
- Se transcrição falhar → ignorar com `reason: "audio_transcription_failed"`
- Se transcrição retornar vazia → ignorar com `reason: "empty_message"`
- Tipos não suportados (imagem, vídeo, etc.) → ignorar com `reason: "unsupported_type_<type>"`

## API OpenAI
- Modelo: `whisper-1`
- `language: "pt"` (otimiza para português brasileiro)
- `response_format: "text"` (retorna string direta, não JSON)
- A API aceita `File` ou buffer; usamos `new File([buffer], ...)` para compatibilidade

**Why:** Z-API envia áudio como mensagem separada (`type: "audio"`). Sem transcrição, o sistema não consegue processar a intenção do lead. Tratar o texto transcrito como mensagem normal evita duplicação de lógica de pipeline (auto-quote, agente, etc.).
