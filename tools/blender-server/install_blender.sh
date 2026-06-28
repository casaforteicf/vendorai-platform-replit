#!/usr/bin/env bash
# install_blender.sh
# Baixa e instala o Blender 4.1 LTS headless no diretório ~/blender
# Compatível com Linux x86_64 (Replit, Ubuntu, Debian)

set -euo pipefail

BLENDER_VERSION="4.1.1"
BLENDER_BUILD="blender-${BLENDER_VERSION}-linux-x64"
BLENDER_URL="https://mirrors.dotsrc.org/blender/release/Blender4.1/${BLENDER_BUILD}.tar.xz"
INSTALL_DIR="$HOME/blender"
TARBALL="/tmp/${BLENDER_BUILD}.tar.xz"

echo "=== VendorAI Blender Server — Instalando Blender ${BLENDER_VERSION} ==="
echo ""

# Dependências de sistema
echo "[1/4] Instalando dependências de sistema..."
if command -v apt-get &>/dev/null; then
    apt-get update -qq 2>/dev/null || true
    apt-get install -y -qq \
        libx11-6 libxxf86vm1 libxfixes3 libxi6 libxrender1 libgl1 \
        libglu1-mesa libsm6 libxext6 libxrandr2 \
        wget tar xz-utils 2>/dev/null || true
fi

# Download
echo "[2/4] Baixando Blender ${BLENDER_VERSION} (~220 MB)..."
if [ -f "$TARBALL" ]; then
    echo "  Arquivo já existe em /tmp — pulando download."
else
    wget -q --show-progress -O "$TARBALL" "$BLENDER_URL"
fi

# Extração
echo "[3/4] Extraindo para ${INSTALL_DIR}..."
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
tar -xJf "$TARBALL" -C "$INSTALL_DIR" --strip-components=1

# Verificação
echo "[4/4] Verificando instalação..."
BLENDER_BIN="${INSTALL_DIR}/blender"

if [ ! -f "$BLENDER_BIN" ]; then
    echo "ERRO: binário do Blender não encontrado em ${BLENDER_BIN}"
    exit 1
fi

"$BLENDER_BIN" --version

echo ""
echo "=== Blender instalado com sucesso em: ${BLENDER_BIN} ==="
echo ""
echo "Adicione ao seu .env:"
echo "  BLENDER_PATH=${BLENDER_BIN}"
echo ""
echo "Limpando tarball..."
rm -f "$TARBALL"
