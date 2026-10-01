import { describe, expect, it } from "vitest";
import { runParallelMissions } from "./web-parallel-runner.js";

describe("parallel web mission runner", () => {
  it("preserves result order and isolates failures", async () => {
    const missions = [
      { id: "a", payload: 1 },
      { id: "b", payload: 2 },
      { id: "c", payload: 3 },
    ];
    const result = await runParallelMissions(missions, async (mission) => {
      if (mission.id === "b") throw new Error("boom");
      return mission.payload * 2;
    }, 2);

    expect(result).toEqual([
      { id: "a", ok: true, result: 2 },
      { id: "b", ok: false, error: "boom" },
      { id: "c", ok: true, result: 6 },
    ]);
  });
});
