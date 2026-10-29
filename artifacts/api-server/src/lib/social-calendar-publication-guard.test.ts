import { describe, expect, it } from "vitest";
import { calendarPublicationConflict } from "./social-calendar-publication-guard";

describe("calendar social publication conflict contract", () => {
  it("allows a first submission with no existing publication", () => {
    expect(calendarPublicationConflict(null)).toBeNull();
    expect(calendarPublicationConflict(undefined)).toBeNull();
  });

  it.each(["draft", "queued", "publishing", "scheduled", "published", "failed"])(
    "does not silently create another publication when a %s record exists",
    (status) => {
      expect(calendarPublicationConflict({ id: "pub-existing", status })).toEqual({
        error: "calendar_publication_already_exists",
        publicationId: "pub-existing",
        status,
      });
    },
  );
});
