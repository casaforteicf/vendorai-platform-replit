import { describe, expect, it } from "vitest";
import { getContentAutopilotBlogPostUrl } from "./contentAutopilotBlogUrl";

describe("getContentAutopilotBlogPostUrl", () => {
  it("uses the generated site's slug instead of a fixed tenant", () => {
    expect(
      getContentAutopilotBlogPostUrl(
        "https://windoor-acabamentos-lp-75b6.appvendorai.com",
        "como-escolher-esquadrias",
      ),
    ).toBe(
      "/api/sites/windoor-acabamentos-lp-75b6/blog/como-escolher-esquadrias",
    );
  });

  it("normalizes paths and encodes the post slug", () => {
    expect(
      getContentAutopilotBlogPostUrl(
        "https://meu-site.appvendorai.com/landing",
        "post novo",
      ),
    ).toBe("/api/sites/meu-site/blog/post%20novo");
  });

  it("does not generate an invalid preview for external or missing sites", () => {
    expect(
      getContentAutopilotBlogPostUrl("https://example.com", "post"),
    ).toBeNull();
    expect(getContentAutopilotBlogPostUrl(null, "post")).toBeNull();
  });
});
