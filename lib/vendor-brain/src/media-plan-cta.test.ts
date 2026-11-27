import { describe, expect, it } from "vitest";
import { appendUtm, pieceCtaLabel } from "./media-plan-execution";

describe("pieceCtaLabel", () => {
  it("usa rótulos por destino", () => {
    expect(pieceCtaLabel("whatsapp")).toBe("Falar no WhatsApp");
    expect(pieceCtaLabel("formulario_lead")).toBe("Receber proposta");
    expect(pieceCtaLabel("produto")).toBe("Ver produto");
    expect(pieceCtaLabel("landing_page")).toBe("Saiba mais");
    expect(pieceCtaLabel("landing_page", "venda")).toBe("Ver oferta");
  });
});

describe("appendUtm", () => {
  it("acrescenta parâmetros preservando os existentes", () => {
    const url = appendUtm("https://site.appvendorai.com/pacotes?x=1", {
      source: "Instagram",
      medium: "organic",
      campaign: "camp-1",
      content: "piece-1",
    });
    expect(url).toContain("x=1");
    expect(url).toContain("utm_source=Instagram");
    expect(url).toContain("utm_medium=organic");
    expect(url).toContain("utm_campaign=camp-1");
    expect(url).toContain("utm_content=piece-1");
  });

  it("não sobrescreve utm existente", () => {
    const url = appendUtm("https://site.appvendorai.com/?utm_source=meta", { source: "instagram" });
    expect(url).toContain("utm_source=meta");
  });

  it("devolve a entrada quando a URL é inválida", () => {
    expect(appendUtm("nao-e-url", { source: "x" })).toBe("nao-e-url");
  });
});
