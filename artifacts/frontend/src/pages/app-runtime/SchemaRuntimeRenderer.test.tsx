import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SchemaRuntimeRenderer, { type RuntimePayload } from "./SchemaRuntimeRenderer";

function payloadWithPages(count: number, emphasizedIndex?: number): RuntimePayload {
  return {
    runtimeVersion: 1,
    publishedVersionId: "version-test",
    publishedVersion: 1,
    app: {
      id: "preview-navigation-test",
      name: "App Exemplo",
      slug: "app-exemplo",
      theme: { primary: "#334155" },
      navigation: [],
    },
    template: { versionId: "template-version-test", version: 1 },
    runtime: {
      version: 1,
      defaultPageId: "page-1",
      pages: Array.from({ length: count }, (_, index) => ({
        id: `page-${index + 1}`,
        title: `Página ${index + 1}`,
        icon: index === 0 ? "home" : "circle",
        navigationEmphasis: emphasizedIndex === index,
        blocks: [],
      })),
    },
  };
}

describe("SchemaRuntimeRenderer mobile navigation", () => {
  it("uses bottom navigation only when the app has five destinations or fewer", () => {
    render(<SchemaRuntimeRenderer payload={payloadWithPages(5)} lang="pt" />);

    expect(screen.getAllByRole("navigation")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Página 5" }).length).toBeGreaterThan(0);
  });

  it("renders a template page marked as the center navigation action", () => {
    render(<SchemaRuntimeRenderer payload={payloadWithPages(5, 2)} lang="pt" />);

    const pageThreeButtons = screen.getAllByRole("button", { name: "Página 3" });
    expect(pageThreeButtons.some((button) => button.className.includes("-translate-y-2"))).toBe(true);
  });

  it("keeps every page reachable when a legacy app has more than five destinations", () => {
    render(<SchemaRuntimeRenderer payload={payloadWithPages(6)} lang="pt" />);

    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    for (let index = 1; index <= 6; index += 1) {
      expect(screen.getByRole("button", { name: `Página ${index}` })).toBeInTheDocument();
    }
  });
});
