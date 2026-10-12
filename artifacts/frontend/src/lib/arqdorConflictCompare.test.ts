import { describe, expect, it } from "vitest";
import { compareArqdorSnapshots } from "./arqdorConflictCompare";

describe("MULTI-04.11 snapshot comparison", () => {
  it("finds differences without mutating project snapshots", () => {
    const local = { rooms: { sala: { width: 4 } }, title: "local" };
    const remote = { rooms: { sala: { width: 5 } }, title: "server" };
    const beforeLocal = JSON.stringify(local);
    const beforeRemote = JSON.stringify(remote);
    expect(compareArqdorSnapshots(local, remote).map(item => item.path))
      .toEqual(["rooms.sala.width", "title"]);
    expect(JSON.stringify(local)).toBe(beforeLocal);
    expect(JSON.stringify(remote)).toBe(beforeRemote);
  });
  it("distinguishes additions and removals", () => {
    const result = compareArqdorSnapshots({ localOnly: 1 }, { serverOnly: 2 });
    expect(result).toMatchObject([
      { path: "localOnly", kind: "added" },
      { path: "serverOnly", kind: "removed" },
    ]);
  });
  it("caps excessive changes", () => {
    const local = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`key${i}`, i]));
    const remote = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`key${i}`, -1]));
    expect(compareArqdorSnapshots(local, remote).length).toBe(200);
  });
});
