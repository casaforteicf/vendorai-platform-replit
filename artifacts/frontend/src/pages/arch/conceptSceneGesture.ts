export function sceneGesture(threshold = 5) {
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = false;
  let cancelled = false;
  return {
    down(id: number, x: number, y: number) {
      if (!pointers.size) { moved = false; cancelled = false; }
      else moved = true;
      pointers.set(id, { x, y });
    },
    move(id: number, x: number, y: number) {
      const start = pointers.get(id);
      if (start && Math.hypot(x - start.x, y - start.y) > threshold) moved = true;
    },
    up(id: number, x: number, y: number) { this.move(id, x, y); pointers.delete(id); },
    cancel(id: number) { cancelled = true; pointers.delete(id); },
    canClick() { return !moved && !cancelled && !pointers.size; },
  };
}
