import { describe, expect, it, vi } from "vitest";

vi.mock("./objectStorage.js", () => ({
  ObjectStorageService: class {
    async getObjectEntitySignedUrl(path: string) {
      return `https://signed.example${path}?token=abc`;
    }
  },
}));

import { resolvePublicMediaUrl } from "./media-publish-url";

describe("resolvePublicMediaUrl", () => {
  it("mantém URLs públicas http(s)", async () => {
    expect(await resolvePublicMediaUrl("https://cdn.example/video.mp4")).toBe("https://cdn.example/video.mp4");
  });

  it("assina objetos privados do Storage", async () => {
    expect(await resolvePublicMediaUrl("/objects/tenants/t1/video.mp4")).toBe(
      "https://signed.example/objects/tenants/t1/video.mp4?token=abc",
    );
    expect(await resolvePublicMediaUrl("/api/storage/objects/tenants/t1/image.png")).toBe(
      "https://signed.example/objects/tenants/t1/image.png?token=abc",
    );
  });

  it("devolve vazio para entrada vazia e não altera caminhos desconhecidos", async () => {
    expect(await resolvePublicMediaUrl("")).toBe("");
    expect(await resolvePublicMediaUrl(null)).toBe("");
    expect(await resolvePublicMediaUrl("/midias/arquivo")).toBe("/midias/arquivo");
  });
});
