import { describe, expect, it } from "vitest";
import {
  deriveJarvisContinuitySubject,
  isJarvisContinuityRecall,
  shouldPersistJarvisContinuity,
} from "./jarvis-continuity-memory.js";

describe("JARVIS continuity memory", () => {
  it("não persiste cumprimentos nem comandos puros de retomada", () => {
    expect(shouldPersistJarvisContinuity("Bom dia, Jarvis")).toBe(false);
    expect(shouldPersistJarvisContinuity("Continua de onde paramos")).toBe(false);
    expect(isJarvisContinuityRecall("Retoma o assunto")).toBe(true);
  });

  it("persiste assuntos substantivos de negócio", () => {
    expect(shouldPersistJarvisContinuity("Quero rever nossa estratégia comercial para Joinville neste trimestre")).toBe(true);
    expect(shouldPersistJarvisContinuity("Estou preocupado com a conversão das propostas desta semana")).toBe(true);
  });

  it("mantém o assunto compacto", () => {
    const subject = deriveJarvisContinuitySubject(`${"estratégia ".repeat(40)}. Depois vemos marketing.`);
    expect(subject.length).toBeLessThanOrEqual(180);
  });
});
