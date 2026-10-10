import { splitWallVoids } from "./conceptWallVoids";
type Wall = Parameters<typeof splitWallVoids>[0];
type Opening = Parameters<typeof splitWallVoids>[1][number];
export type WalkWall = Wall & { doorGaps: Array<{ center: number; halfWidth: number }> };
export function walkWall(wall: Wall, openings: Opening[], wallHeight = 2.8, visitorHeight = 1.7): WalkWall {
  const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1, length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-9) return { ...wall, doorGaps: [] };
  const along = (x: number, y: number) => ((x - wall.x1) * dx + (y - wall.y1) * dy) / length;
  const blocked = splitWallVoids(wall, openings.filter(o => o.type === "door"), wallHeight)
    .filter(p => p.zMin < visitorHeight && p.zMax > 0)
    .map(p => ({ start: along(p.wall.x1, p.wall.y1), end: along(p.wall.x2, p.wall.y2) }))
    .sort((a, b) => a.start - b.start);
  const doorGaps: WalkWall["doorGaps"] = [];
  let cursor = 0;
  for (const interval of blocked) {
    if (interval.start > cursor + 1e-8) doorGaps.push({ center: (cursor + interval.start) / 2, halfWidth: (interval.start - cursor) / 2 });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < length - 1e-8) doorGaps.push({ center: (cursor + length) / 2, halfWidth: (length - cursor) / 2 });
  return { ...wall, doorGaps };
}
export function canWalkTo(x: number, y: number, walls: WalkWall[], radius = 0.24) {
  if (![x, y, radius].every(Number.isFinite) || radius <= 0) return false;
  for (const wall of walls) {
    const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1, length = Math.hypot(dx, dy);
    if (length < 1e-9) continue;
    const ux = dx / length, uy = dy / length;
    const along = (x - wall.x1) * ux + (y - wall.y1) * uy;
    const clamped = Math.max(0, Math.min(length, along));
    if (Math.hypot(x - wall.x1 - ux * clamped, y - wall.y1 - uy * clamped) > (wall.thickness ?? 0.15) / 2 + radius) continue;
    if (!wall.doorGaps.some(gap => gap.halfWidth >= radius && Math.abs(along - gap.center) <= gap.halfWidth - radius + 1e-8)) return false;
  }
  return true;
}

export function moveWalkPosition(start: { x: number; y: number }, target: { x: number; y: number }, walls: WalkWall[], radius = 0.24) {
  if (![start.x, start.y, target.x, target.y, radius].every(Number.isFinite) || radius <= 0) return start;
  const distance = Math.hypot(target.x - start.x, target.y - start.y);
  const steps = Math.max(1, Math.ceil(distance / Math.min(0.05, radius / 2)));
  const dx = (target.x - start.x) / steps, dy = (target.y - start.y) / steps;
  let position = { ...start };
  for (let i = 0; i < steps; i++) {
    const next = { x: position.x + dx, y: position.y + dy };
    if (canWalkTo(next.x, next.y, walls, radius)) position = next;
    else {
      if (canWalkTo(next.x, position.y, walls, radius)) position.x = next.x;
      if (canWalkTo(position.x, next.y, walls, radius)) position.y = next.y;
    }
  }
  return position;
}

export function walkStep(yaw: number, forward: number, strafe: number, speed: number, elapsedMs: number) {
  if (![yaw, forward, strafe, speed, elapsedMs].every(Number.isFinite)) return { x: 0, y: 0 };
  const magnitude = Math.max(1, Math.hypot(forward, strafe));
  const distance = Math.max(0, speed) * Math.max(0, Math.min(100, elapsedMs)) / (1000 / 60);
  return {
    x: (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * distance / magnitude,
    y: (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * distance / magnitude,
  };
}
