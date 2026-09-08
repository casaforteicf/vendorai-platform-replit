import { describe, expect, it } from "vitest";
import { calendarIntentMissingFields, type JarvisCalendarIntent } from "./jarvis-calendar-action-intent.js";

function intent(overrides: Partial<JarvisCalendarIntent> = {}): JarvisCalendarIntent {
  return {
    isSchedulingRequest: true,
    leadQuery: "João",
    title: "Reunião com João",
    startIso: "2026-09-10T15:00:00-03:00",
    endIso: "2026-09-10T16:00:00-03:00",
    modality: "meet",
    location: null,
    notes: null,
    ...overrides,
  };
}

describe("JARVIS calendar intent", () => {
  it("não aponta pendência quando pessoa e intervalo estão completos", () => {
    expect(calendarIntentMissingFields(intent())).toEqual([]);
  });

  it("expõe somente os campos realmente ausentes", () => {
    expect(calendarIntentMissingFields(intent({ leadQuery: null, startIso: null, endIso: null }))).toEqual([
      "pessoa/cliente",
      "data e horário",
      "horário final/duração",
    ]);
  });
});
