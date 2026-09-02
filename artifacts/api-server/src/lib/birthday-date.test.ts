import { describe, expect, it } from "vitest";
import { isBirthdayOn, parseBirthdayParts } from "./birthday-date.js";

describe("parseBirthdayParts", () => {
  it.each([
    ["1990-09-02", { month: 9, day: 2 }],
    ["1990/09/02", { month: 9, day: 2 }],
    ["02/09/1990", { month: 9, day: 2 }],
    ["02-09-1990", { month: 9, day: 2 }],
    ["02/09", { month: 9, day: 2 }],
    ["1990-09-02T23:00:00.000Z", { month: 9, day: 2 }],
  ])("reads %s", (value, expected) => expect(parseBirthdayParts(value)).toEqual(expected));

  it.each(["", "not-a-date", "31/02/1990", "1990-13-01", "09/31/1990"])(
    "rejects %s",
    (value) => expect(parseBirthdayParts(value)).toBeNull(),
  );

  it("matches month and day", () => {
    expect(isBirthdayOn("02/09/1990", 9, 2)).toBe(true);
    expect(isBirthdayOn("1990-09-03", 9, 2)).toBe(false);
  });
});
