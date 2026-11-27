import { describe, expect, it } from "vitest";
import {
  canTransitionPiece,
  deriveOperationalState,
  derivePieceAction,
  derivePieceMediaState,
  transitionPiece,
} from "./media-plan-execution";

const base = { calendarStatus: "aprovado", hasGeneration: false };

describe("derivePieceMediaState", () => {
  it("marca pronto quando há vídeo final", () => {
    expect(derivePieceMediaState({ ...base, hasGeneration: true, isVideo: true, hasFinalVideo: true })).toBe("ready");
  });

  it("marca processando quando o vídeo ainda não existe mas está gerando", () => {
    expect(derivePieceMediaState({ ...base, hasGeneration: true, isVideo: true, hasFinalVideo: false })).toBe("pending");
    expect(derivePieceMediaState({ calendarStatus: "gerado", hasGeneration: true, isVideo: true, hasFinalVideo: false })).toBe("processing");
  });

  it("marca pendente quando a peça estática ainda não tem imagem", () => {
    expect(derivePieceMediaState({ calendarStatus: "gerado", hasGeneration: true, hasVisual: false })).toBe("pending");
  });

  it("marca pronto para peça estática com imagem", () => {
    expect(derivePieceMediaState({ calendarStatus: "gerado", hasGeneration: true, hasVisual: true })).toBe("ready");
  });

  it("marca falha quando a materialização falhou", () => {
    expect(derivePieceMediaState({ ...base, hasGeneration: true, materializationStatus: "failed" })).toBe("failed");
  });

  it("publicação existente implica mídia pronta", () => {
    expect(derivePieceMediaState({ calendarStatus: "publicado" })).toBe("ready");
  });
});

describe("derivePieceAction", () => {
  it("planejado libera, autorizado produz", () => {
    expect(derivePieceAction("planned", "pending")).toMatchObject({ code: "release", enabled: true });
    expect(derivePieceAction("authorized", "pending")).toMatchObject({ code: "produce", enabled: true });
  });

  it("em revisão só aprova com mídia pronta", () => {
    expect(derivePieceAction("in_review", "ready").code).toBe("approve");
    const blocked = derivePieceAction("in_review", "processing");
    expect(blocked.code).toBe("wait");
    expect(blocked.enabled).toBe(false);
    expect(blocked.reason).toBeTruthy();
  });

  it("em revisão com falha pede retry", () => {
    expect(derivePieceAction("in_review", "failed")).toMatchObject({ code: "retry", enabled: true });
  });

  it("aprovado publica somente com mídia pronta", () => {
    expect(derivePieceAction("approved", "ready").code).toBe("publish");
    expect(derivePieceAction("approved", "pending").enabled).toBe(false);
  });
});

describe("transições", () => {
  it("permite o caminho feliz", () => {
    expect(canTransitionPiece("planned", "authorized")).toBe(true);
    expect(canTransitionPiece("authorized", "producing")).toBe(true);
    expect(canTransitionPiece("producing", "in_review")).toBe(true);
    expect(canTransitionPiece("in_review", "approved")).toBe(true);
    expect(canTransitionPiece("approved", "scheduled")).toBe(true);
    expect(canTransitionPiece("scheduled", "published")).toBe(true);
  });

  it("bloqueia saltos inválidos", () => {
    expect(canTransitionPiece("planned", "published")).toBe(false);
    expect(canTransitionPiece("producing", "approved")).toBe(false);
    expect(canTransitionPiece("published", "in_review")).toBe(false);
  });

  it("transição inválida lança código estável", () => {
    expect(() => transitionPiece("planned", "published")).toThrow("INVALID_PIECE_TRANSITION:planned->published");
    expect(transitionPiece("producing", "in_review")).toBe("in_review");
  });
});

describe("integração com deriveOperationalState", () => {
  it("vídeo sem arquivo final não vira revisão", () => {
    const state = deriveOperationalState({ calendarStatus: "gerado", hasGeneration: true, isVideo: true, hasFinalVideo: false });
    expect(state.code).toBe("producing");
    expect(derivePieceAction(state.code, derivePieceMediaState({ calendarStatus: "gerado", hasGeneration: true, isVideo: true, hasFinalVideo: false })).code).toBe("wait");
  });
});
