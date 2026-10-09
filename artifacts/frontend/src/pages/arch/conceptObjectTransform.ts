export function objectTransformPatch(position: { x: number; z: number }, yaw: number, width: number, depth: number, lotWidth: number, lotDepth: number, snapRotation = true, snapPosition = true) {
  if (![position.x, position.z, yaw, width, depth, lotWidth, lotDepth].every(Number.isFinite) || width <= 0 || depth <= 0 || lotWidth <= 0 || lotDepth <= 0) return null;
  const snap = (value: number) => Math.round(value * 20) / 20;
  const rotation = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  const snappedRotation = snapRotation ? (Math.round(rotation / 5) * 5) % 360 : rotation;
  const angle = snappedRotation * Math.PI / 180;
  const extentX = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * depth;
  const extentY = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * depth;
  const boundedOrigin = (value: number, dimension: number, extent: number, lot: number) => {
    const min = Math.max(0, (extent - dimension) / 2);
    const max = lot - (extent + dimension) / 2;
    // If it cannot fit, keep its center in the lot without resizing the object.
    if (max < min) return Math.max(0, (lot - dimension) / 2);
    return Math.max(min, Math.min(max, snapPosition ? snap(value) : value));
  };
  return {
    x: boundedOrigin(position.x + lotWidth / 2 - width / 2, width, extentX, lotWidth),
    y: boundedOrigin(position.z + lotDepth / 2 - depth / 2, depth, extentY, lotDepth),
    rotation: snappedRotation,
  };
}

export function boundedObjectGeometry(object: { x: number; y: number; width: number; depth: number; rotation: number }, lotWidth: number, lotDepth: number) {
  return objectTransformPatch(
    { x: object.x + object.width / 2 - lotWidth / 2, z: object.y + object.depth / 2 - lotDepth / 2 },
    -object.rotation * Math.PI / 180, object.width, object.depth, lotWidth, lotDepth, false, false,
  );
}

export function duplicateObjectGeometry(object: Parameters<typeof boundedObjectGeometry>[0], lotWidth: number, lotDepth: number) {
  const candidates = [[0.5, 0.5], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5]]
    .map(([dx, dy]) => boundedObjectGeometry({ ...object, x: object.x + dx, y: object.y + dy }, lotWidth, lotDepth))
    .filter((patch): patch is NonNullable<typeof patch> => patch !== null);
  const distance = (patch: typeof candidates[number]) => Math.hypot(patch.x - object.x, patch.y - object.y);
  if (candidates[0] && distance(candidates[0]) >= 0.5) return candidates[0];
  return candidates.sort((a, b) => distance(b) - distance(a))[0] ?? null;
}
