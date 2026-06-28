#!/usr/bin/env bash
# install_blender.sh
# Baixa e instala Blender 3.6.5 LTS (linux x64) em /opt/blender
# Executar como root ou com sudo em um Replit Python

set -euo pipefail

BLENDER_VERSION="3.6.5"
BLENDER_BUILD="blender-${BLENDER_VERSION}-linux-x64"
BLENDER_URL="https://mirrors.dotsrc.org/blender/release/Blender3.6/${BLENDER_BUILD}.tar.xz"
INSTALL_DIR="/opt/blender"
TARBALL="/tmp/${BLENDER_BUILD}.tar.xz"

echo "=============================================="
echo " VendorAI Blender Server — Instalação"
echo " Blender ${BLENDER_VERSION} → ${INSTALL_DIR}"
echo "=============================================="
echo ""

# ── 1. Dependências de sistema ──────────────────
echo "[1/5] Instalando dependências de sistema..."
apt-get update -qq 2>/dev/null || true
apt-get install -y -qq \
    wget xz-utils \
    libx11-6 libxxf86vm1 libxfixes3 libxi6 \
    libxrender1 libgl1-mesa-glx libglu1-mesa \
    libsm6 libxext6 libxrandr2 \
    2>/dev/null || true
echo "  OK"

# ── 2. Download ──────────────────────────────────
echo "[2/5] Baixando Blender ${BLENDER_VERSION} (~200 MB)..."
if [ -f "$TARBALL" ]; then
    echo "  Arquivo já existe em /tmp — pulando download."
else
    wget -q --show-progress -O "$TARBALL" "$BLENDER_URL"
fi
echo "  OK"

# ── 3. Extração ──────────────────────────────────
echo "[3/5] Extraindo para ${INSTALL_DIR}..."
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
tar -xJf "$TARBALL" -C "$INSTALL_DIR" --strip-components=1
echo "  OK"

# ── 4. Verificação ───────────────────────────────
echo "[4/5] Verificando binário..."
BLENDER_BIN="${INSTALL_DIR}/blender"
if [ ! -f "$BLENDER_BIN" ]; then
    echo "ERRO: binário não encontrado em ${BLENDER_BIN}"
    exit 1
fi
"$BLENDER_BIN" --version | head -3
echo "  OK"

# ── 5. Diretório de HDRIs ────────────────────────
echo "[5/5] Criando diretório de HDRIs..."
mkdir -p "${INSTALL_DIR}/hdri"
echo "  OK"

# ── Limpeza ──────────────────────────────────────
echo ""
echo "Limpando tarball..."
rm -f "$TARBALL"

echo ""
echo "=============================================="
echo " Blender instalado com sucesso!"
echo " Binário : ${BLENDER_BIN}"
echo " HDRIs   : ${INSTALL_DIR}/hdri/"
echo "=============================================="
echo ""
echo "Próximo passo: bash download_hdri.sh"
