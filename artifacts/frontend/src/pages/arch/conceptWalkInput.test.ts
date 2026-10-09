import { describe, expect, it } from "vitest";
import { isWalkEditingTarget, walkDirection } from "./conceptWalkInput";
describe("independent walk input sources", () => {
  it("keeps keyboard movement when a touch ends", () => {
    expect(walkDirection(["w"], [])).toEqual({ forward: 1, strafe: 0 });
    expect(walkDirection(["w"], ["w", "d"])).toEqual({ forward: 1, strafe: 1 });
  });
  it("cancels opposite commands across sources", () => {
    expect(walkDirection(["arrowup", "a"], ["s", "d"])).toEqual({ forward: 0, strafe: 0 });
  });
  it("recognizes descendants of editable controls", () => {
    const editor = document.createElement("div"); editor.setAttribute("contenteditable", "true");
    const child = document.createElement("span"); editor.append(child);
    expect(isWalkEditingTarget(child)).toBe(true);
    expect(isWalkEditingTarget(document.createElement("input"))).toBe(true);
    expect(isWalkEditingTarget(document.createElement("button"))).toBe(false);
    expect(isWalkEditingTarget(null)).toBe(false);
  });
});
