import { describe, expect, it } from "vitest";
import { chooseWebExecutionStrategy } from "./web-execution-router.js";

describe("Vendi web execution router", () => {
  it("uses fetch for public read-only research", () => {
    expect(chooseWebExecutionStrategy({ goal: "Leia esta página e extraia preços" })).toBe("fetch");
  });

  it("uses browser for authenticated connections", () => {
    expect(chooseWebExecutionStrategy({ goal: "Consulte o pedido", connectionId: "supplier" })).toBe("browser");
  });

  it("uses browser for interactions and writes", () => {
    expect(chooseWebExecutionStrategy({ goal: "Preencha o formulário e envie" })).toBe("browser");
    expect(chooseWebExecutionStrategy({ goal: "Leia a página", allowWrite: true })).toBe("browser");
  });
});
