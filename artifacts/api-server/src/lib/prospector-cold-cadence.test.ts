import { describe, expect, it } from "vitest";
import { nextProspectorCadenceStep } from "./prospector-cold-cadence.js";

describe("Prospector cold cadence", () => {
  it("starts the first follow-up after 48h", () => {
    expect(nextProspectorCadenceStep(47, [])).toBeNull();
    expect(nextProspectorCadenceStep(48, [])?.key).toBe("followup_48h");
  });

  it("advances to day 5 and day 9 without repeating sent steps", () => {
    expect(nextProspectorCadenceStep(120, ["followup_48h"])?.key).toBe("followup_120h");
    expect(nextProspectorCadenceStep(216, ["followup_48h", "followup_120h"])?.key).toBe("followup_216h");
    expect(nextProspectorCadenceStep(300, ["followup_48h", "followup_120h", "followup_216h"])).toBeNull();
  });

  it("does not burst stale missed steps after downtime", () => {
    expect(nextProspectorCadenceStep(220, [])?.key).toBe("followup_216h");
    expect(nextProspectorCadenceStep(220, ["followup_48h"])?.key).toBe("followup_216h");
  });
});
