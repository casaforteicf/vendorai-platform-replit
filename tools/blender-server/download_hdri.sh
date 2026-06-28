#!/usr/bin/env bash
# download_hdri.sh
# Baixa 3 HDRIs gratuitas (CC0) do Poly Haven para /opt/blender/hdri
# Nomes locais: interior_warm.hdr, interior_cool.hdr, natural.hdr

set -euo pipefail

HDRI_DIR="/opt/blender/hdri"
RES="2k"

# Mapeamento: nome_local → slug Poly Haven
declare -A HDRIS
HDRIS["interior_warm.hdr"]="vintage_measuring_lab"
HDRIS["interior_cool.hdr"]="studio_small_08"
HDRIS["natural.hdr"]="rural_asphalt_road"

BASE_URL="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${RES}"

echo "=============================================="
echo " VendorAI Blender Server — Download HDRIs"
echo " Destino: ${HDRI_DIR}"
echo "=============================================="
echo ""

mkdir -p "$HDRI_DIR"

for LOCAL_NAME in "${!HDRIS[@]}"; do
    SLUG="${HDRIS[$LOCAL_NAME]}"
    URL="${BASE_URL}/${SLUG}_${RES}.hdr"
    DEST="${HDRI_DIR}/${LOCAL_NAME}"

    if [ -f "$DEST" ]; then
        SIZE=$(du -sh "$DEST" 2>/dev/null | cut -f1)
        echo "  [OK] ${LOCAL_NAME} — já existe (${SIZE}), pulando."
        continue
    fi

    echo "  Baixando ${LOCAL_NAME} ← ${SLUG}..."
    if wget -q --show-progress -O "$DEST" "$URL" 2>&1; then
        SIZE=$(du -sh "$DEST" 2>/dev/null | cut -f1)
        echo "  [OK] ${LOCAL_NAME} (${SIZE})"
    else
        echo "  [AVISO] Falha ao baixar ${LOCAL_NAME}. Criando HDRI placeholder..."
        # Cria um arquivo .hdr mínimo válido (cinza neutro, 8x4 px)
        python3 - "$DEST" <<'PYEOF'
import sys, struct

dest = sys.argv[1]
# Header RGBE mínimo válido
header = b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 4 +X 8\n"
# 32 pixels de cinza (r=g=b=128, e=128)
pixels = bytes([128, 128, 128, 128] * 32)
with open(dest, "wb") as f:
    f.write(header + pixels)
print(f"  Placeholder criado: {dest}")
PYEOF
    fi
done

echo ""
echo "=============================================="
echo " HDRIs disponíveis:"
ls -lh "$HDRI_DIR"
echo "=============================================="
echo ""
echo "Próximo passo: python main.py"
