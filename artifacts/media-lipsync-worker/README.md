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

MuseTalk 1.5 executado localmente no container GPU, fixado no commit `0a89dec45a0192b824e3cf4daf96c239440c5ed8` para builds reproduzíveis.

O health só informa `ready: true` quando todos os pesos necessários estão presentes e uma GPU NVIDIA responde via `nvidia-smi`.

## Variáveis

- `VENDORAI_LIPSYNC_WORKER_SECRET`
- `VENDORAI_LIPSYNC_CONCURRENCY` — padrão `1`
- `VENDORAI_LIPSYNC_BATCH_SIZE` — padrão `8`
- `VENDORAI_LIPSYNC_TIMEOUT_SECONDS` — padrão `840`
- `VENDORAI_LIPSYNC_AUTO_DOWNLOAD_WEIGHTS=1` — provisiona os pesos oficiais no startup quando ausentes
- `MUSETALK_ROOT` — padrão `/opt/MuseTalk`
- `FFMPEG_PATH` — padrão `/usr/bin`
- `PORT` — padrão `8000`

## Pesos e volume persistente

Em produção, monte um volume persistente em `/opt/MuseTalk/models`. No primeiro boot do volume vazio, use `VENDORAI_LIPSYNC_AUTO_DOWNLOAD_WEIGHTS=1`; nos boots seguintes os pesos são reutilizados.

## Ajuste facial

No MuseTalk 1.5 o `bbox_shift` da configuração é fixado internamente pelo próprio motor. Para não exibir um controle sem efeito, o VendorAI converte o ajuste recebido para `extra_margin`, limitado ao redor do padrão oficial de 10 pixels.

## Deploy

Este serviço deve rodar em infraestrutura com GPU NVIDIA/CUDA. Depois do deploy, configurar na API principal:

- `VENDORAI_LIPSYNC_WORKER_URL`
- `VENDORAI_LIPSYNC_WORKER_SECRET`

A capability `avatar_lipsync` só fica `ready` na API quando a URL estiver configurada; o `/health` do worker confirma separadamente se GPU e pesos estão realmente prontos.
