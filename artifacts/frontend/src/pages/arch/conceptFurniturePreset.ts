/** Presets describe an axis-aligned placement box; model dimensions are local to the object. */
export function furniturePresetFootprint(width: number, depth: number, x: number, y: number, rotation: number) {
  const angle = ((rotation % 360) + 360) % 360;
  const quarterTurn = Math.abs(angle - 90) < 1e-8 || Math.abs(angle - 270) < 1e-8;
  if (!quarterTurn) return { width, depth, x, y, rotation: angle };
  return {
    width: depth, depth: width,
    x: x + (width - depth) / 2,
    y: y + (depth - width) / 2,
    rotation: angle,
  };
}

export function positionFurnitureInBounds(
  object: { x: number; y: number; width: number; depth: number; rotation?: number },
  bounds: { x: number; y: number; width: number; height: number },
  padding = 0.08,
): { x: number; y: number } | null {
  const angle = (object.rotation ?? 0) * Math.PI / 180;
  const extentX = Math.abs(Math.cos(angle)) * object.width + Math.abs(Math.sin(angle)) * object.depth;
  const extentY = Math.abs(Math.sin(angle)) * object.width + Math.abs(Math.cos(angle)) * object.depth;
  const minX = bounds.x + padding + (extentX - object.width) / 2;
  const maxX = bounds.x + bounds.width - padding - (extentX + object.width) / 2;
  const minY = bounds.y + padding + (extentY - object.depth) / 2;
  const maxY = bounds.y + bounds.height - padding - (extentY + object.depth) / 2;
  if (![minX, maxX, minY, maxY, object.x, object.y].every(Number.isFinite) || maxX < minX || maxY < minY) return null;
  return { x: Math.max(minX, Math.min(maxX, object.x)), y: Math.max(minY, Math.min(maxY, object.y)) };
}

export function furnitureWallDistances(
  object: { x: number; y: number; width: number; depth: number; rotation?: number },
  bounds: { x: number; y: number; width: number; height: number },
) {
  const angle = (object.rotation ?? 0) * Math.PI / 180;
  const extentX = Math.abs(Math.cos(angle)) * object.width + Math.abs(Math.sin(angle)) * object.depth;
  const extentY = Math.abs(Math.sin(angle)) * object.width + Math.abs(Math.cos(angle)) * object.depth;
  const cx = object.x + object.width / 2, cy = object.y + object.depth / 2;
  return {
    left: Math.abs(cx - extentX / 2 - bounds.x),
    right: Math.abs(bounds.x + bounds.width - cx - extentX / 2),
    top: Math.abs(cy - extentY / 2 - bounds.y),
    bottom: Math.abs(bounds.y + bounds.height - cy - extentY / 2),
  };
}

/** Reflect the placement center and its local X direction across room axes. */
export function mirrorFurniturePreset<T extends { x: number; y: number; width: number; depth: number; rotation?: number; wallAffinity?: "top" | "bottom" | "left" | "right" | "center" }>(
  object: T, bounds: { x: number; y: number; width: number; height: number },
  mode: "base" | "mirror-x" | "mirror-y" | "mirror-xy",
): T {
  const mirrorX = mode === "mirror-x" || mode === "mirror-xy";
  const mirrorY = mode === "mirror-y" || mode === "mirror-xy";
  let rotation = object.rotation ?? 0;
  if (mirrorX) rotation = 180 - rotation;
  if (mirrorY) rotation = -rotation;
  const side = object.wallAffinity;
  const wallAffinity = mirrorX && side === "left" ? "right" : mirrorX && side === "right" ? "left"
    : mirrorY && side === "top" ? "bottom" : mirrorY && side === "bottom" ? "top" : side;
  return {
    ...object,
    x: mirrorX ? 2 * bounds.x + bounds.width - object.x - object.width : object.x,
    y: mirrorY ? 2 * bounds.y + bounds.height - object.y - object.depth : object.y,
    rotation: ((rotation % 360) + 360) % 360,
    wallAffinity,
  };
}
