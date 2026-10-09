import { describe, expect, it } from "vitest";
import { sceneGesture } from "./conceptSceneGesture";
describe("scene selection gestures", () => {
  it("allows a tap with small movement", () => {
    const g = sceneGesture(); g.down(1, 10, 10); g.up(1, 12, 11); expect(g.canClick()).toBe(true);
  });
  it("rejects dragging even when returning to the initial point", () => {
    const g = sceneGesture(); g.down(1, 0, 0); g.move(1, 30, 0); g.up(1, 0, 0); expect(g.canClick()).toBe(false);
    g.down(2, 0, 0); g.up(2, 0, 0); expect(g.canClick()).toBe(true);
  });
  it("rejects multi touch and cancelled gestures", () => {
    const g = sceneGesture(); g.down(1, 0, 0); g.down(2, 10, 0); g.up(1, 0, 0); g.up(2, 10, 0); expect(g.canClick()).toBe(false);
    g.down(3, 0, 0); g.cancel(3); expect(g.canClick()).toBe(false);
  });
  it("checks movement at release even without a move event", () => {
    const g = sceneGesture(); g.down(1, 0, 0); expect(g.canClick()).toBe(false); g.up(1, 20, 0); expect(g.canClick()).toBe(false);
  });
});
