export function objectTransformPatch(position: { x: number; z: number }, yaw: number, width: number, depth: number, lotWidth: number, lotDepth: number) {
  if (![position.x, position.z, yaw, width, depth, lotWidth, lotDepth].every(Number.isFinite) || width <= 0 || depth <= 0 || lotWidth <= 0 || lotDepth <= 0) return null;
  const snap = (value: number) => Math.round(value * 20) / 20;
  const rotation = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  return {
    x: Math.max(0, Math.min(Math.max(0, lotWidth - width), snap(position.x + lotWidth / 2 - width / 2))),
    y: Math.max(0, Math.min(Math.max(0, lotDepth - depth), snap(position.z + lotDepth / 2 - depth / 2))),
    rotation: (Math.round(rotation / 5) * 5) % 360,
  };
}
