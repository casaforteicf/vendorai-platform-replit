export function objectTransformPatch(position: { x: number; z: number }, yaw: number, width: number, depth: number, lotWidth: number, lotDepth: number) {
  if (![position.x, position.z, yaw, width, depth, lotWidth, lotDepth].every(Number.isFinite) || width <= 0 || depth <= 0 || lotWidth <= 0 || lotDepth <= 0) return null;
  const snap = (value: number) => Math.round(value * 20) / 20;
  const rotation = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  const snappedRotation = (Math.round(rotation / 5) * 5) % 360;
  const angle = snappedRotation * Math.PI / 180;
  const extentX = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * depth;
  const extentY = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * depth;
  const boundedOrigin = (value: number, dimension: number, extent: number, lot: number) => {
    const min = Math.max(0, (extent - dimension) / 2);
    const max = lot - (extent + dimension) / 2;
    // If it cannot fit, keep its center in the lot without resizing the object.
    if (max < min) return Math.max(0, (lot - dimension) / 2);
    return Math.max(min, Math.min(max, snap(value)));
  };
  return {
    x: boundedOrigin(position.x + lotWidth / 2 - width / 2, width, extentX, lotWidth),
    y: boundedOrigin(position.z + lotDepth / 2 - depth / 2, depth, extentY, lotDepth),
    rotation: snappedRotation,
  };
}
