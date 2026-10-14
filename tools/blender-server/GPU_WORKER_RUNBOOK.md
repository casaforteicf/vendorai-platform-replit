# Arqdor GPU Worker — Vast.ai bootstrap

## Purpose and safety boundary

This deploys the existing Blender worker as a separate GPU container. It does **not** deploy or change the VendorAI API, enable the Arqdor 3D button, change production environment variables, or prove that the full Contabo-to-GPU transfer path is working.

Blender 4.5.14 LTS is pinned for the initial RTX 5090 trial. The GPU container requests Cycles OptiX explicitly. A CPU fallback is not accepted as a successful GPU smoke test.

## 1. Host prerequisites

On the rented NVIDIA instance, verify the host driver and Docker NVIDIA runtime:

```bash
nvidia-smi
docker --version
docker compose version
docker run --rm --gpus all nvidia/cuda:12.8.1-runtime-ubuntu22.04 nvidia-smi
```

Stop if `nvidia-smi` fails or the CUDA container cannot see the GPU. Do not try to fix this by installing host drivers inside the application container; use the host provider's supported driver/runtime setup.

## 2. Build the isolated worker

Copy the contents of `tools/blender-server/` to a private directory on the GPU host. Do not copy repository tokens or any production environment file. Then:

```bash
cp .env.gpu.example .env.gpu
openssl rand -hex 32
```

Put the generated random value into `.env.gpu` as `BLENDER_SECRET`. Keep that file private (`chmod 600 .env.gpu`) and out of Git. The sample is not a usable secret.

Build and start the worker:

```bash
docker compose -f docker-compose.gpu.yaml build --no-cache
docker compose -f docker-compose.gpu.yaml up -d
docker compose -f docker-compose.gpu.yaml ps
docker compose -f docker-compose.gpu.yaml logs --tail=100 blender-worker
```

The port is deliberately bound to `127.0.0.1:8080`. Do not change it to a public `0.0.0.0` binding and do not expose the secret-authenticated worker over plain HTTP to the internet.

## 3. Verify the actual GPU render

```bash
curl -fsS http://127.0.0.1:8080/health
docker compose -f docker-compose.gpu.yaml exec -T blender-worker /opt/vendorai/blender-server/gpu-smoke-test.sh
```

Accept this stage only if the smoke test prints `PASS: backend=OPTIX`, produces a valid PNG, and logs `Cycles GPU habilitada: OPTIX`. If the test fails, preserve logs and investigate driver/runtime compatibility; do not count a CPU fallback as success.

The default worker concurrency is one render to reduce VRAM exhaustion. Increase only after measuring GPU memory with representative scenes. The smoke test checks the rendering backend and a small scene; it does not validate architectural fidelity or 4K performance.

## 4. Production connection is a separate gate

The Contabo API can be connected only after all of the following are ready:

- A private, authenticated network path or a TLS endpoint with strict allowlisting from Contabo to the GPU worker.
- A secret generated for this worker, stored only in the Contabo secret manager/environment and the private worker environment; never in Git or logs.
- The existing API's `BLENDER_SERVER_URL` and `BLENDER_SECRET` configured in a controlled non-production environment first.
- A test confirming `POST /render`, status polling, authenticated `GET /render/:jobId/artifact`, private object storage, and the tenant media library.
- Approval of the exact release SHA, backup/rollback readiness, and the standard integration gates.

This repository change intentionally does not expose the worker publicly or change production settings. The 3D model file staging/transfer path from Contabo to this external host remains a separate integration task. Do not turn on 3D rendering for users until the real GLB transport and result round-trip pass.

## 5. Tear down the trial to stop compute charges

When the GPU test is complete, stop the worker and terminate the rented instance in the provider console. Stopping the Docker container alone may not stop the GPU rental charge. Review the provider's current billing details before leaving the instance allocated.
