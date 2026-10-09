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

export function insertedObjectGeometry(width: number, depth: number, lotWidth: number, lotDepth: number, point?: { x: number; y: number }) {
  if (![width, depth, lotWidth, lotDepth].every(Number.isFinite) || width <= 0 || depth <= 0 || lotWidth <= 0 || lotDepth <= 0)
    return { error: "Informe medidas válidas para o objeto e o terreno." };
  if (width > lotWidth || depth > lotDepth) return { error: "O objeto não cabe no terreno com essas medidas. Escolha outro item ou ajuste as medidas antes de inserir." };
  const geometry = boundedObjectGeometry({ x: (point?.x ?? lotWidth / 2) - width / 2, y: (point?.y ?? lotDepth / 2) - depth / 2, width, depth, rotation: 0 }, lotWidth, lotDepth);
  return geometry ?? { error: "A posição escolhida para o objeto é inválida." };
}

export function objectBatchPlacementError(objects: Array<{ x: number; y: number; width: number; depth: number; rotation: number; floor: number }>, lotWidth: number, lotDepth: number, activeFloor: number) {
  if (!objects.length) return "O layout não contém objetos para inserir.";
  if (![lotWidth, lotDepth].every(Number.isFinite) || lotWidth <= 0 || lotDepth <= 0) return "As medidas do terreno são inválidas.";
  for (let i = 0; i < objects.length; i++) {
    const object = objects[i];
    if (![object.x, object.y, object.width, object.depth, object.rotation].every(Number.isFinite) || object.width <= 0 || object.depth <= 0)
      return `O item ${i + 1} do layout tem medidas ou posição inválidas.`;
    if (object.floor !== activeFloor) return "O layout pertence a outro pavimento. Gere uma nova opção no pavimento atual.";
    const angle = object.rotation * Math.PI / 180;
    const halfX = (Math.abs(Math.cos(angle)) * object.width + Math.abs(Math.sin(angle)) * object.depth) / 2;
    const halfY = (Math.abs(Math.sin(angle)) * object.width + Math.abs(Math.cos(angle)) * object.depth) / 2;
    const centerX = object.x + object.width / 2, centerY = object.y + object.depth / 2;
    if (centerX - halfX < -1e-8 || centerY - halfY < -1e-8 || centerX + halfX > lotWidth + 1e-8 || centerY + halfY > lotDepth + 1e-8)
      return `O item ${i + 1} do layout ultrapassa o terreno. Gere uma nova opção com as medidas atuais.`;
  }
  return null;
}
