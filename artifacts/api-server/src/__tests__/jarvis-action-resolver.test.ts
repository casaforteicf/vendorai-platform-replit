import { describe, expect, it } from "vitest";
import { resolveJarvisRoute } from "../services/jarvis-action-resolver.js";

describe("resolveJarvisRoute", () => {
  it("prioritizes approval", () => expect(resolveJarvisRoute("aprovar a proposta").route).toBe("approval"));
  it("routes mission execution to mission", () => expect(resolveJarvisRoute("execute a missão").route).toBe("mission"));
  it("routes plan requests centrally", () => expect(resolveJarvisRoute("crie um plano de ação").route).toBe("action_plan"));
  it("routes email actions to email", () => expect(resolveJarvisRoute("envie um e-mail para o cliente").route).toBe("email"));
  it("does not infer execution from plain conversation", () => expect(resolveJarvisRoute("como estão minhas vendas?").route).toBe("chat"));
  it("marks explicit execution as approval-gated", () => expect(resolveJarvisRoute("exclua este lead").requiresApproval).toBe(true));
});
