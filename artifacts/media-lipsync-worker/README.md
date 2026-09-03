# VendorAI Lip-Sync Worker

Worker GPU especializado do VendorAI Media Engine para gerar vídeo com lip-sync a partir de uma imagem de referência e um áudio já autorizado pela API principal.

## Contrato

- `GET /health`
- `POST /v1/lipsync/generate`
- autenticação opcional por `x-vendorai-worker-secret`
- entrada multipart:
  - `job_id`
  - `bbox_shift`
  - `source_face`
  - `audio`
- saída: `video/mp4`

A API principal continua responsável por identidade, consentimentos, tenant, jobs, Biblioteca Audiovisual e versionamento. Este serviço apenas executa inferência GPU.

## Motor

O worker usa MuseTalk 1.5, fixado no commit `0a89dec45a0192b824e3cf4daf96c239440c5ed8`. O código e pesos do MuseTalk 1.5 são disponibilizados pelo projeto oficial para uso comercial.

A imagem Docker instala a pilha recomendada pelo projeto: Python 3.10, CUDA 11.8, PyTorch 2.0.1 e dependências MMLab.

## Variáveis

- `VENDORAI_LIPSYNC_WORKER_SECRET`: deve ser igual ao segredo configurado na API principal.
- `VENDORAI_LIPSYNC_AUTO_DOWNLOAD_WEIGHTS=1`: baixa os pesos oficiais no primeiro startup quando ausentes.
- `VENDORAI_LIPSYNC_MAX_CONCURRENCY`: padrão `1`; protege VRAM.
- `VENDORAI_LIPSYNC_BATCH_SIZE`: padrão `8`.
- `VENDORAI_LIPSYNC_GPU_ID`: padrão `0`.
- `VENDORAI_LIPSYNC_TIMEOUT_SECONDS`: padrão `840`.
- `VENDORAI_LIPSYNC_MAX_UPLOAD_BYTES`: padrão `104857600`.
- `PORT`: padrão `8000`.

## Persistência dos pesos

Para evitar downloads a cada deploy, monte volume persistente em `/opt/MuseTalk/models`. Com o volume vazio, use `VENDORAI_LIPSYNC_AUTO_DOWNLOAD_WEIGHTS=1` no primeiro boot. Depois o health check deve retornar:

```json
{
  "service": "vendorai-lipsync-worker",
  "engine": "musetalk-1.5",
  "ready": true,
  "modelsReady": true,
  "cudaReady": true
}
```

## Ligação com a API

Na API/Railway configure:

- `VENDORAI_LIPSYNC_WORKER_URL=https://<worker>`
- `VENDORAI_LIPSYNC_WORKER_SECRET=<mesmo segredo>`

O endpoint oficial da API continua sendo o único caminho exposto ao tenant. Ele valida `face_use` e `ai_generation` antes de enviar qualquer arquivo a este worker.

## Observações de execução

MuseTalk 1.5 usa `extra_margin` para ajuste fino do recorte facial. O contrato VendorAI mantém `bbox_shift` e o worker o converte em um ajuste limitado ao redor do padrão do MuseTalk. O resultado sempre é devolvido como MP4 e registrado pela API principal na Biblioteca Audiovisual.
