/** Keep the camera aspect ratio; never stretch or crop architecture for AI. */
export function conceptReferenceSize(width: number, height: number, longestSide: number, upscale = false) {
  if (![width, height, longestSide].every(Number.isFinite) || width <= 0 || height <= 0 || longestSide <= 0) {
    throw new Error("A imagem de referência ainda não está pronta. Aguarde a prévia carregar.");
  }
  const factor = upscale ? longestSide / Math.max(width, height) : Math.min(1, longestSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}
