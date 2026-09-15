import { describe, expect, it } from "vitest";
import { resolveMotionPreference } from "./site_generator_motion_preferences.js";

describe("Site Generator 2 preview controls", () => {
  it("resolves motion preferences from natural language", () => {
    expect(resolveMotionPreference("deixe as animações mais sutis")).toBe("subtle");
    expect(resolveMotionPreference("quero movimento cinematográfico")).toBe("cinematic");
    expect(resolveMotionPreference("sem animação no site")).toBe("none");
    expect(resolveMotionPreference("deixa a IA escolher a animação automaticamente")).toBe("auto");
  });

  it("ignores messages that are not about motion", () => {
    expect(resolveMotionPreference("troque apenas o texto do hero")).toBeNull();
  });
});
