# JARVIS — voz neural única

## Regra

- A resposta falada do JARVIS no frontend web/PWA deve usar somente a voz neural dedicada.
- Não iniciar `speechSynthesis` local como fallback quando o endpoint neural falhar.
- Em falha de TTS, manter a resposta em texto e encerrar o ciclo de fala normalmente.
- Deduplicar a mesma resposta para evitar duas reproduções simultâneas.
- Interromper áudio neural imediatamente quando o usuário iniciar uma nova fala.

## Naturalidade

Antes de enviar o texto ao TTS, normalizar marcações e pontuação para fala natural em português brasileiro, preservando o sentido e evitando leitura mecânica de símbolos.
