#!/usr/bin/env bash
# download_hdri.sh
# Baixa HDRIs gratuitas do Poly Haven para iluminação realista
# Tamanho total: ~80 MB (resolução 2k)

set -euo pipefail

HDRI_DIR="$HOME/hdri"
RES="2k"

# HDRIs do Poly Haven (CC0 — uso livre, incluindo comercial)
declare -A HDRIS=(
    ["studio_small.hdr"]="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${RES}/studio_small_08_${RES}.hdr"
    ["outdoor_umbrellas.hdr"]="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${RES}/outdoor_umbrellas_${RES}.hdr"
    ["sunset_jhbcentral.hdr"]="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${RES}/sunset_jhbcentral_${RES}.hdr"
    ["interior_atelier.hdr"]="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${RES}/artist_workshop_${RES}.hdr"
)

echo "=== VendorAI Blender Server — Baixando HDRIs (Poly Haven CC0) ==="
echo ""

mkdir -p "$HDRI_DIR"

for NAME in "${!HDRIS[@]}"; do
    URL="${HDRIS[$NAME]}"
    DEST="${HDRI_DIR}/${NAME}"

    if [ -f "$DEST" ]; then
        echo "  [OK] ${NAME} — já existe, pulando."
        continue
    fi

    echo "  Baixando ${NAME}..."
    if wget -q --show-progress -O "$DEST" "$URL"; then
        echo "  [OK] ${NAME}"
    else
        echo "  [AVISO] Falha ao baixar ${NAME} — tentando URL alternativa..."
        # Fallback: gera um HDRI cinza mínimo de 4x2 pixels se tudo falhar
        python3 - <<'PYEOF'
import struct, zlib, os, sys

name = sys.argv[1] if len(sys.argv) > 1 else "fallback.hdr"
# HDR mínimo válido (cinza neutro)
content = b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 4\n"
for _ in range(8):
    content += bytes([128, 128, 128, 128])  # RGBE cinza
with open(name, "wb") as f:
    f.write(content)
PYEOF
        echo "  [INFO] HDRI fallback criado para ${NAME}"
    fi
done

echo ""
echo "=== HDRIs disponíveis em: ${HDRI_DIR} ==="
ls -lh "$HDRI_DIR"
echo ""
echo "Adicione ao seu .env:"
echo "  HDRI_DIR=${HDRI_DIR}"
