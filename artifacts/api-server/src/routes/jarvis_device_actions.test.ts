import { describe, expect, it } from "vitest";
import { extractSpotifyQuery } from "./jarvis_device_actions.js";

describe("JARVIS device actions", () => {
  it("extrai música pedida explicitamente no Spotify", () => {
    expect(extractSpotifyQuery("Jarvis, toque a música Time do Pink Floyd no Spotify"))
      .toBe("Time do Pink Floyd");
  });

  it("extrai álbum sem manter palavras de comando", () => {
    expect(extractSpotifyQuery("coloque o álbum Random Access Memories no spotify"))
      .toBe("Random Access Memories");
  });

  it("não transforma conversa genérica sobre Spotify em execução", () => {
    expect(extractSpotifyQuery("qual a diferença entre Spotify e YouTube Music?"))
      .toBeNull();
  });
});
