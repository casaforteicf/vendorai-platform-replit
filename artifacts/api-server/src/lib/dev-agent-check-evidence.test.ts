import { describe, expect, it } from "vitest";
import { evaluateRegressionTestContract } from "./dev-agent-check-evidence.js";

describe("evaluateRegressionTestContract", () => {
  it("bloqueia quando código testável muda em módulo com convenção de testes e nenhum teste é alterado", () => {
    expect(evaluateRegressionTestContract({
      productionFiles: ["artifacts/api-server/src/lib/example.ts"],
      changedTestFiles: [],
      directoriesWithConvention: ["artifacts/api-server/src/lib"],
    })).toEqual({
      required: true,
      conventionDetected: true,
      satisfied: false,
    });
  });

  it("libera quando um teste do mesmo módulo também é alterado", () => {
    expect(evaluateRegressionTestContract({
      productionFiles: ["artifacts/api-server/src/lib/example.ts"],
      changedTestFiles: ["artifacts/api-server/src/lib/example.test.ts"],
      directoriesWithConvention: ["artifacts/api-server/src/lib"],
    })).toEqual({
      required: true,
      conventionDetected: true,
      satisfied: true,
    });
  });

  it("reconhece testes dentro de __tests__ como pertencentes ao módulo", () => {
    expect(evaluateRegressionTestContract({
      productionFiles: ["artifacts/api-server/src/lib/example.ts"],
      changedTestFiles: ["artifacts/api-server/src/lib/__tests__/example.spec.ts"],
      directoriesWithConvention: ["artifacts/api-server/src/lib"],
    }).satisfied).toBe(true);
  });

  it("não exige teste quando não existe convenção local comprovada", () => {
    expect(evaluateRegressionTestContract({
      productionFiles: ["artifacts/api-server/src/routes/example.ts"],
      changedTestFiles: [],
      directoriesWithConvention: [],
    })).toEqual({
      required: false,
      conventionDetected: false,
      satisfied: true,
    });
  });
});
