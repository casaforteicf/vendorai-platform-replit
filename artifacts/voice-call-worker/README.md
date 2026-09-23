# VendorAI Voice Call Worker

Gateway WebRTC para chamadas de voz do VendorAI.

## Responsabilidade

- negociar SDP WebRTC;
- receber áudio Opus da chamada;
- detectar turnos simples por energia/silêncio;
- interromper a fala atual quando o lead começa a falar;
- enviar cada turno em WAV para a API VendorAI;
- consumir o stream NDJSON do Dublê e injetar o áudio de volta na chamada.

O worker não decide qual agente responde e não conhece regras comerciais. O cérebro continua no `voice-agent-orchestrator.ts`.

## Variáveis

- `VENDORAI_CALL_WORKER_SECRET`
- `VENDORAI_API_INTERNAL_URL` (ex.: `https://api.appvendorai.com`)
- `VENDORAI_VOICE_BRIDGE_SECRET`

## Endpoints

- `GET /health`
- `POST /v1/calls/outbound-offer`
- `POST /v1/calls/inbound-answer`
- `POST /v1/calls/{call_key}/remote-answer`
- `POST /v1/calls/{call_key}/terminate`

Os endpoints de oferta/resposta exigem `x-vendorai-call-worker-secret`.
