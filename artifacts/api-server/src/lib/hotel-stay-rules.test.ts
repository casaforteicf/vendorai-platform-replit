import {describe,it,expect} from "vitest";
import {datesOverlap,validStay} from "./hotel-stay-rules.js";
describe("HOTEL-04 reservation date policy",()=>{
 it("requires checkout after arrival",()=>{expect(validStay("2026-10-30","2026-10-31")).toBe(true);expect(validStay("2026-10-30","2026-10-30")).toBe(false);expect(validStay("2026-11-01","2026-10-30")).toBe(false);});
 it("bounds length to 365 nights",()=>{expect(validStay("2026-01-01","2027-01-01")).toBe(true);expect(validStay("2026-01-01","2027-01-02")).toBe(false);});
 it("rejects invalid date encodings",()=>{expect(validStay("not a date","2026-10-31")).toBe(false);expect(validStay("2026-10-30","not a date")).toBe(false);expect(validStay("2026-02-30","2026-03-02")).toBe(false);expect(validStay("2026-13-01","2027-01-01")).toBe(false);});
 it("allows consecutive stays without collision",()=>{expect(datesOverlap("2026-11-01","2026-11-03","2026-11-03","2026-11-05")).toBe(false);});
 it("detects overlapping ranges",()=>{expect(datesOverlap("2026-11-01","2026-11-04","2026-11-03","2026-11-06")).toBe(true);expect(datesOverlap("2026-11-01","2026-11-05","2026-11-02","2026-11-03")).toBe(true);});
});
