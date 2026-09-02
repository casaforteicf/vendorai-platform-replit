import { describe, expect, it } from "vitest";
import { professionMatches } from "./professional-date.js";

describe("professionMatches", () => {
  it.each([
    ["Veterinário", ["veterinario"]],
    ["Médica Veterinária", ["veterinários"]],
    ["MEDICO VETERINARIO", ["médico veterinário"]],
    ["Engenheira Civil", ["engenheiro civil", "engenheira civil"]],
  ])("matches %s", (profession, configured) => {
    expect(professionMatches(profession, configured)).toBe(true);
  });

  it.each([
    [null, ["veterinario"]],
    ["", ["veterinario"]],
    ["Contador", ["veterinario"]],
    ["Veterinário", []],
  ])("does not match unrelated or missing data", (profession, configured) => {
    expect(professionMatches(profession, configured)).toBe(false);
  });
});
