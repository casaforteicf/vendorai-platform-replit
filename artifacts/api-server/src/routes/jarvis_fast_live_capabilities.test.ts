import { describe, expect, it } from "vitest";
import {
  detectGenericMusicIntent,
  detectWeatherIntent,
  extractSpecificMusicQuery,
  extractWeatherLocation,
} from "./jarvis_fast_live_capabilities.js";

describe("JARVIS fast live capabilities", () => {
  it("detecta pedido genérico de música que antes caía no LLM", () => {
    expect(detectGenericMusicIntent("queria escutar uma música agora")).toBe(true);
    expect(extractSpecificMusicQuery("queria escutar uma música agora")).toBeNull();
  });

  it("extrai música específica", () => {
    expect(detectGenericMusicIntent("Jarvis, quero ouvir Time do Pink Floyd")).toBe(true);
    expect(extractSpecificMusicQuery("Jarvis, quero ouvir Time do Pink Floyd")).toBe("Time do Pink Floyd");
  });

  it("detecta previsão do tempo e extrai cidade explícita", () => {
    expect(detectWeatherIntent("qual a previsão do tempo hoje em São Paulo?")).toBe(true);
    expect(extractWeatherLocation("qual a previsão do tempo hoje em São Paulo?")).toBe("São Paulo");
  });

  it("não inventa local quando a cidade não foi informada", () => {
    expect(detectWeatherIntent("gostaria de saber a previsão do tempo hoje")).toBe(true);
    expect(extractWeatherLocation("gostaria de saber a previsão do tempo hoje")).toBeNull();
  });
});
