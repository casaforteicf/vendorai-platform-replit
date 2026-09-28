export function fitReferenceImageToLot(
  nativeWidth: number,
  nativeHeight: number,
  lotWidth: number,
  lotDepth: number,
) {
  if (![nativeWidth, nativeHeight, lotWidth, lotDepth].every(Number.isFinite)) {
    throw new Error("Dimensões inválidas para calibrar a planta de referência.");
  }
  if (nativeWidth <= 0 || nativeHeight <= 0 || lotWidth <= 0 || lotDepth <= 0) {
    throw new Error("Dimensões devem ser maiores que zero.");
  }

  const scale = Math.min(lotWidth / nativeWidth, lotDepth / nativeHeight);
  const widthMeters = nativeWidth * scale;
  const depthMeters = nativeHeight * scale;
  return {
    widthMeters,
    depthMeters,
    offsetX: (lotWidth - widthMeters) / 2,
    offsetY: (lotDepth - depthMeters) / 2,
  };
}
