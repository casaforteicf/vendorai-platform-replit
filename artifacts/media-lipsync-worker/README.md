# VendorAI LipSync Worker

Worker GPU especializado do VendorAI Media Engine para `avatar_lipsync`.

## Contrato

- `GET /health`
- `POST /v1/lipsync/generate`

Multipart esperado:

- `job_id`
- `bbox_shift`
- `source_face` — imagem ou vídeo autorizado
- `audio` — áudio já armazenado na Biblioteca Audiovisual

A resposta de sucesso é `video/mp4`.

## Segurança

O worker aceita `x-vendorai-worker-secret`. Configure `VENDORAI_LIPSYNC_WORKER_SECRET` com o mesmo segredo usado pela API principal. O backend do VendorAI valida identidade, tenant e consentimentos antes de chamar este serviço; o worker não substitui essas validações.

## Motor

MuseTalk 1.5, executado localmente no container GPU. O wrapper não usa serviço externo de avatar. Os pesos oficiais devem ser disponibilizados em `/opt/MuseTalk/models` conforme a estrutura exigida pelo projeto MuseTalk.

## Variáveis

- `VENDORAI_LIPSYNC_WORKER_SECRET`
- `VENDORAI_LIPSYNC_CONCURRENCY` — padrão `1`
- `VENDORAI_LIPSYNC_TIMEOUT_SECONDS` — padrão `840`
- `MUSETALK_ROOT` — padrão `/opt/MuseTalk`
- `FFMPEG_PATH` — padrão `/usr/bin`

## Deploy

Este serviço deve rodar em infraestrutura com GPU NVIDIA/CUDA. Depois do deploy, configurar na API principal:

- `VENDORAI_LIPSYNC_WORKER_URL`
- `VENDORAI_LIPSYNC_WORKER_SECRET`

A capability `avatar_lipsync` só fica `ready` na API quando a URL estiver configurada.
