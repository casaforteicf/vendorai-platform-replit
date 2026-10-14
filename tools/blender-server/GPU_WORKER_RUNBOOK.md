# Arqdor GPU Worker — Vast.ai bootstrap

## Purpose and safety boundary

This packages the existing Blender worker for a GPU instance. It does **not** deploy or change the VendorAI API, enable the Arqdor 3D button, change production environment variables, or prove that the full Contabo-to-GPU transfer path is working.

Blender 4.5.14 LTS is pinned for the initial RTX 5090 trial. The worker requests Cycles OptiX explicitly. A CPU fallback is not accepted as a successful GPU smoke test.

## 1. Host prerequisites

On the rented NVIDIA instance, verify the provider's NVIDIA driver is present:

```bash
nvidia-smi
```

If `nvidia-smi` fails, stop and resolve the provider's GPU/driver setup first. Do not install host drivers inside the application container.

## 2. Install directly on the CUDA instance (preferred for Vast.ai templates)

Copy the files under `tools/blender-server/` to a private directory on the rented GPU instance. Use a private checkout or secure file transfer; do not paste a GitHub token or production secrets in chat. Run this as root on the GPU instance:

```bash
chmod +x install_gpu_worker.sh gpu-smoke-test.sh
./install_gpu_worker.sh
cp .env.gpu.example .env.gpu
openssl rand -hex 32
```

Put the generated random value into `.env.gpu` as `BLENDER_SECRET`. Keep that file private (`chmod 600 .env.gpu`) and out of Git. The sample is not a usable secret.

The installer validates `nvidia-smi`, downloads official Blender 4.5.14 LTS, checks its SHA-256 against Blender's published manifest, and installs Python requirements into an isolated virtual environment. It does not start the API or modify Contabo.

Run the actual render test as the unprivileged worker account:

```bash
su -s /bin/bash arqdor
cd /path/to/blender-server
set -a
. ./.env.gpu
set +a
export ARQDOR_CYCLES_GPU_BACKEND=OPTIX
export ARQDOR_RENDER_WORKERS=1
export ARQDOR_RENDER_QUEUE_DB=/var/lib/arqdor-render/jobs.sqlite3
export ARQDOR_MODEL_ROOT=/opt/arqdor/models
/opt/arqdor-venv/bin/python /opt/arqdor-venv/bin/pip --version
./gpu-smoke-test.sh
```

To start the worker for a short isolated test, in that same environment run:

```bash
/opt/arqdor-venv/bin/python main.py
```

The service listens on port 8080. The normal production connection is deliberately not configured by this runbook.

## 3. Optional Docker path

Use `Dockerfile.gpu` and `docker-compose.gpu.yaml` only if the rented environment actually supports Docker and the NVIDIA Container Toolkit. First validate:

```bash
docker --version
docker compose version
docker run --rm --gpus all nvidia/cuda:12.8.1-runtime-ubuntu22.04 nvidia-smi
```

Then copy `.env.gpu.example` to `.env.gpu`, set a strong random `BLENDER_SECRET`, and run:

```bash
docker compose -f docker-compose.gpu.yaml build --no-cache
docker compose -f docker-compose.gpu.yaml up -d
docker compose -f docker-compose.gpu.yaml ps
docker compose -f docker-compose.gpu.yaml logs --tail=100 blender-worker
docker compose -f docker-compose.gpu.yaml exec -T blender-worker /opt/vendorai/blender-server/gpu-smoke-test.sh
```

The port is deliberately bound to `127.0.0.1:8080`. Do not change it to a public `0.0.0.0` binding and do not expose the secret-authenticated worker over plain HTTP to the internet.

## 4. Acceptance test

Accept this stage only if the smoke test prints `PASS: backend=OPTIX`, produces a valid PNG, and logs `Cycles GPU habilitada: OPTIX`. If it fails, preserve logs and investigate driver/runtime compatibility; do not count a CPU fallback as success.

The smoke test checks the rendering backend and a small scene; it does not validate architectural fidelity or 4K performance. Keep concurrency at one render while validating VRAM usage. Increase only after measuring representative scenes.

## 5. Production connection is a separate gate

The Contabo API can be connected only after all of the following are ready:

- A private, authenticated network path or a TLS endpoint with strict allowlisting from Contabo to the GPU worker.
- A worker-specific secret stored only in the private worker environment and Contabo's environment/secret store; never in Git or logs.
- The existing API's `BLENDER_SERVER_URL` and `BLENDER_SECRET` configured in a controlled non-production environment first.
- A test confirming `POST /render`, status polling, authenticated `GET /render/:jobId/artifact`, private object storage, and the tenant media library.
- A verified transfer path for private GLB files from Contabo to this GPU host and the artifact return path.
- Approval of the exact release SHA, backup/rollback readiness, and standard integration gates.

This change intentionally does not expose the worker publicly or change production settings. Do not enable 3D rendering for users until the real GLB transport and result round-trip pass. The queue uses SQLite; in-progress tasks interrupted by process restart are marked errored, not automatically resumed.

## 6. Tear down the trial to stop compute charges

When the GPU test is complete, stop the worker. Then terminate the rented instance in the provider console. Stopping the Python process or container alone may not stop GPU rental billing. Review the provider's current billing details before leaving the instance allocated.
