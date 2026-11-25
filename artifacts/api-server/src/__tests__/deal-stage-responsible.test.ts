import { describe, expect, it } from "vitest";
import { userMatchesStageResponsibleFunctions } from "../lib/stage-responsible.js";

const activeSeller = {
  active: true,
  platformRole: "member",
  userFunction: "representante_comercial",
  customFunctionId: null,
};

describe("userMatchesStageResponsibleFunctions", () => {
  it("aceita qualquer usuário ativo quando a etapa não tem funções configuradas", () => {
    expect(userMatchesStageResponsibleFunctions(activeSeller, [])).toBe(true);
    expect(userMatchesStageResponsibleFunctions(activeSeller, null)).toBe(true);
  });

  it("continua bloqueando usuário inativo mesmo em etapa sem configuração", () => {
    expect(userMatchesStageResponsibleFunctions({ ...activeSeller, active: false }, [])).toBe(false);
  });

  it("aceita administrador mesmo quando a etapa exige outra função", () => {
    expect(userMatchesStageResponsibleFunctions(
      { active: true, platformRole: "tenant_admin", userFunction: "vendedor", customFunctionId: null },
      ["builtin:representante_comercial"],
    )).toBe(true);
    expect(userMatchesStageResponsibleFunctions(
      { active: true, platformRole: "member", userFunction: "administrador", customFunctionId: null },
      ["builtin:representante_comercial"],
    )).toBe(true);
  });

  it("respeita a função configurada quando a etapa restringe responsáveis", () => {
    expect(userMatchesStageResponsibleFunctions(activeSeller, ["builtin:representante_comercial"])).toBe(true);
    expect(userMatchesStageResponsibleFunctions(activeSeller, ["builtin:vendedor"])).toBe(false);
  });

  it("aceita função customizada configurada para a etapa", () => {
    expect(userMatchesStageResponsibleFunctions(
      { active: true, platformRole: "member", userFunction: null, customFunctionId: "fn-krafht" },
      ["custom:fn-krafht"],
    )).toBe(true);
  });
});
