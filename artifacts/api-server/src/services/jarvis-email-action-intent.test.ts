import { describe, expect, it } from "vitest";
import { emailIntentMissingFields, type JarvisEmailIntent } from "./jarvis-email-action-intent.js";

function intent(overrides: Partial<JarvisEmailIntent> = {}): JarvisEmailIntent {
  return {
    isEmailRequest: true,
    leadQuery: "João",
    subject: "Proposta",
    body: "Segue a proposta conforme conversamos.",
    ...overrides,
  };
}

describe("JARVIS email intent", () => {
  it("aceita destinatário, assunto e conteúdo completos", () => {
    expect(emailIntentMissingFields(intent())).toEqual([]);
  });

  it("expõe campos ausentes sem inventá-los", () => {
    expect(emailIntentMissingFields(intent({ leadQuery: null, subject: null, body: null }))).toEqual([
      "destinatário",
      "assunto",
      "conteúdo",
    ]);
  });
});
