export function openingCoordinates(wall: { x1: number; y1: number; x2: number; y2: number }, offset: number) {
  return {
    x: wall.x1 + (wall.x2 - wall.x1) * offset,
    y: wall.y1 + (wall.y2 - wall.y1) * offset,
  };
}
