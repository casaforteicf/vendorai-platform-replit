#!/usr/bin/env bash
# Install the Arqdor Blender worker directly on an NVIDIA CUDA host (no nested Docker required).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute este instalador como root na instância GPU." >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BLENDER_VERSION="${BLENDER_VERSION:-4.5.14}"
ARCHIVE="blender-${BLENDER_VERSION}-linux-x64.tar.xz"
BASE_URL="https://download.blender.org/release/Blender4.5"
TMP_DIR="$(mktemp -d /tmp/arqdor-gpu-install.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl xz-utils python3 python3-venv python3-pip \
  libx11-6 libxi6 libxrender1 libxfixes3 libxxf86vm1 libxrandr2 \
  libsm6 libice6 libgl1 libegl1 libglib2.0-0 libdbus-1-3 \
  libfontconfig1 libgomp1 libtbb12 libxkbcommon0 libvulkan1
rm -rf /var/lib/apt/lists/*

if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "ERRO: nvidia-smi não existe neste ambiente. Confirme o driver e o runtime GPU no provedor." >&2
  exit 2
fi
nvidia-smi

if [ -x /opt/blender/blender ]; then
  current="$(/opt/blender/blender --version | head -n 1)"
  if printf '%s' "$current" | grep -F "Blender $BLENDER_VERSION" >/dev/null; then
    echo "Blender $BLENDER_VERSION já instalado; mantendo-o."
  else
    echo "ERRO: já existe /opt/blender com outra versão ('$current'). Nada foi removido." >&2
    echo "Use uma instância limpa ou prepare a substituição de forma controlada." >&2
    exit 3
  fi
else
  if [ -e /opt/blender ]; then
    echo "ERRO: /opt/blender já existe e não é o binário esperado. Nada foi alterado nesse caminho." >&2
    exit 3
  fi
  curl -fsSL "${BASE_URL}/${ARCHIVE}" -o "${TMP_DIR}/${ARCHIVE}"
  curl -fsSL "${BASE_URL}/blender-${BLENDER_VERSION}.sha256" -o "${TMP_DIR}/blender.sha256"
  expected="$(grep -F "${ARCHIVE}" "${TMP_DIR}/blender.sha256" | awk 'NR==1 {print $1}')"
  printf '%s' "$expected" | grep -Eq '^[0-9a-fA-F]{64}$' || {
    echo "ERRO: hash SHA256 oficial do Blender não encontrado." >&2
    exit 4
  }
  printf '%s  %s\n' "$expected" "${TMP_DIR}/${ARCHIVE}" | sha256sum -c -
  mkdir -p /opt/blender
  tar -xJf "${TMP_DIR}/${ARCHIVE}" -C /opt/blender --strip-components=1
fi

if ! id arqdor >/dev/null 2>&1; then
  useradd --system --uid 10001 --create-home arqdor
fi
python3 -m venv /opt/arqdor-venv
/opt/arqdor-venv/bin/pip install --no-cache-dir -r "${SCRIPT_DIR}/requirements.txt"

mkdir -p /var/lib/arqdor-render /tmp/renders /opt/arqdor/models
chown -R arqdor:arqdor "${SCRIPT_DIR}" /opt/arqdor-venv /var/lib/arqdor-render /tmp/renders /opt/arqdor
if [ -f "${SCRIPT_DIR}/.env.gpu" ]; then
  chown arqdor:arqdor "${SCRIPT_DIR}/.env.gpu"
  chmod 600 "${SCRIPT_DIR}/.env.gpu"
fi

/opt/blender/blender --version | head -n 3
echo
echo "Instalação concluída. O serviço ainda NÃO foi iniciado nem conectado à produção."
echo "Configure .env.gpu e rode gpu-smoke-test.sh como usuário arqdor antes de integrar."
