# VendorAI Media Worker — Voice

Worker GPU oficial do VendorAI Media Engine para síntese/clonagem de voz autorizada. Ele é separado da API principal e usa exclusivamente o caminho oficial do Media Engine.

## Motor

- Chatterbox Multilingual (`chatterbox-tts`)
- português suportado pelo modelo multilingual (`pt`)
- clonagem zero-shot a partir do áudio de referência já autorizado e armazenado pelo VendorAI
- watermarking/comportamentos responsáveis do modelo são preservados

O backend principal continua sendo o responsável por tenant, identidade, consentimentos, jobs e biblioteca. O worker recebe apenas uma operação já autorizada.

## Contrato

### `GET /health`

Retorna estado do worker, GPU/dispositivo e se o modelo já foi carregado.

### `POST /v1/voice/synthesize`

`multipart/form-data`:

- `job_id`
- `text`
- `language` (`pt-br` por padrão; normalizado para `pt` no modelo)
- `model_config` JSON
- `reference_audio` arquivo

Header opcional, obrigatório quando a variável equivalente estiver configurada:

- `x-vendorai-worker-secret`

Resposta de sucesso: bytes WAV (`audio/wav`).

## Configuração

Worker:

- `VENDORAI_MEDIA_WORKER_SECRET` — segredo compartilhado com a API.
- `VENDORAI_VOICE_CONCURRENCY` — gerações simultâneas por processo; padrão `1` para proteger VRAM.
- `VENDORAI_MEDIA_DEVICE` — fallback de desenvolvimento; produção deve usar GPU CUDA.
- `VENDORAI_VOICE_MODEL` — rótulo de observabilidade.
- `HF_HOME` — cache persistente do modelo; padrão do Docker `/models/huggingface`.

API VendorAI:

- `VENDORAI_MEDIA_WORKER_URL=https://<worker>`
- `VENDORAI_MEDIA_WORKER_SECRET=<mesmo segredo>`

Enquanto `VENDORAI_MEDIA_WORKER_URL` não estiver configurada, a capability `voice_synthesize` permanece `building` e a API responde `VOICE_WORKER_NOT_READY` em vez de fingir que a voz está disponível.

## Recursos

Recomendação inicial de produção:

- 1 GPU NVIDIA com pelo menos 16 GB VRAM;
- 1 processo Uvicorn por GPU;
- `VENDORAI_VOICE_CONCURRENCY=1`;
- volume persistente montado em `/models/huggingface` para evitar download do modelo a cada deploy.

Escalar horizontalmente adicionando réplicas do worker, em vez de múltiplos processos competindo pela mesma GPU.

## Segurança

O worker não aceita tenantId, permissões ou consentimento do cliente como fonte de verdade. Essas verificações já são feitas pela API oficial antes da chamada. O segredo compartilhado reduz o risco de chamadas diretas ao worker.

O worker deve permanecer em rede protegida sempre que a infraestrutura permitir.

## Desenvolvimento local

É possível iniciar em CPU para testes de contrato, mas geração real será lenta. O container de produção foi preparado para runtime NVIDIA/CUDA.

```bash
cd artifacts/media-worker
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Teste primeiro `GET /health`; o modelo é carregado de forma lazy na primeira síntese para o processo poder inicializar e responder health checks antes do download/carregamento pesado.
