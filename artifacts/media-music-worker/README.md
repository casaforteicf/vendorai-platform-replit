# VendorAI Music Worker

Worker GPU isolado para a capability `music_generate` do VendorAI Media Engine.

## Motor

- ACE-Step oficial
- commit fixado: `1bee4c9f5b43e30995f8d4d33b3919197ce1bd68`
- licença do projeto usado pelo worker: Apache-2.0
- provider exposto ao restante da plataforma: `vendorai`

O frontend e a API principal não conhecem o motor interno. A API chama somente o contrato VendorAI do worker.

## Contrato

### `GET /health`

Retorna `ready=true` somente quando CUDA está disponível e os checkpoints já estão provisionados.

### `POST /v1/music/generate`

JSON:

- `jobId`
- `prompt`
- `durationSeconds` entre 5 e 90
- `style` opcional
- `mood` opcional
- `energy` opcional
- `instrumental` (padrão true)

Resposta: `audio/wav`.

## Variáveis

- `VENDORAI_MUSIC_WORKER_SECRET`: autenticação entre API e worker.
- `VENDORAI_MUSIC_CONCURRENCY`: padrão 1 para proteger VRAM.
- `VENDORAI_MUSIC_TIMEOUT_SECONDS`: padrão 300.
- `ACESTEP_CHECKPOINT_DIR`: padrão `/models/ace-step`.
- `ACESTEP_DTYPE`: padrão `bfloat16`.
- `ACESTEP_CPU_OFFLOAD`: `true` para reduzir pressão de VRAM.
- `VENDORAI_MUSIC_AUTO_DOWNLOAD_WEIGHTS`: quando `true`, provisiona checkpoints no boot.

## Deploy

Este container deve ser implantado em infraestrutura GPU separada do Railway principal. Monte um volume persistente em `/models/ace-step` para evitar baixar checkpoints a cada restart.

Depois do deploy, configure na API principal:

- `VENDORAI_MUSIC_WORKER_URL`
- `VENDORAI_MUSIC_WORKER_SECRET`

A capability `music_generate` passa de `building` para `ready` somente após o `/health` do worker confirmar GPU + modelo.

## Direitos

A API do VendorAI registra o arquivo gerado na Biblioteca Audiovisual como música gerada e mantém o snapshot de direitos no asset. Isso não substitui políticas de originalidade e revisão de conteúdo antes de distribuição comercial.
