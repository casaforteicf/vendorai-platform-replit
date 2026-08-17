import { describe, expect, it } from "vitest";
import { detectVehicleQueryType, normalizeVehicleQuery, validateVehicleQuery, VehicleNormalizer, MockVehicleProvider } from "../services/vehicle-lookup.js";

describe("vehicle lookup input", () => {
  it.each([
    ["abc-1234", "ABC1234", "plate"],
    ["abc 1d23", "ABC1D23", "plate"],
    ["abc1d23", "ABC1D23", "plate"],
    ["9bwzzz377vt004251", "9BWZZZ377VT004251", "chassis"],
    ["9BW ZZZ 377 VT004251", "9BWZZZ377VT004251", "chassis"],
  ])("normaliza e detecta %s", (input, normalized, type) => {
    expect(normalizeVehicleQuery(input)).toBe(normalized);
    expect(detectVehicleQueryType(input)).toBe(type);
  });
  it.each(["", "ABC", "@@@", "1234567", "IOQ123456"])("rejeita entrada inválida %s", (input) => {
    expect(validateVehicleQuery(input).valid).toBe(false);
  });
});

describe("VehicleNormalizer", () => {
  const normalizer = new VehicleNormalizer();
  it("aplica aliases sem inventar versão", () => {
    const result = normalizer.normalize({ source: "TEST", brand: "VW", model: "T CROSS", rawDescription: "VW/T CROSS HL TSI AE" }, "plate", "ABC1D23");
    expect(result.brand).toBe("Volkswagen");
    expect(result.model).toBe("T Cross");
    expect(result.version).toBeNull();
  });
  it("mantém resultado ambíguo abaixo de 70%", () => {
    const result = normalizer.normalize({ source: "TEST", brand: "VW", model: "T-Cross", possibleVersions: ["Comfortline", "Highline"] }, "chassis", "9BWZZZ377VT004251");
    expect(result.possibleVersions).toHaveLength(2);
    expect(result.confidence).toBeLessThan(0.7);
  });
  it("preserva desconhecidos como null", () => {
    const result = normalizer.normalize({ source: "TEST" }, "plate", "ABC1D23");
    expect(result.engine).toBeNull();
    expect(result.fipeCode).toBeNull();
  });
});

describe("MockVehicleProvider", () => {
  const provider = new MockVehicleProvider();
  it("encontra veículo por placa", async () => expect(await provider.lookupByPlate("ABC1D23")).toMatchObject({ model: "T-Cross" }));
  it("retorna null quando não encontrado", async () => expect(await provider.lookupByPlate("ZZZ9Z99")).toBeNull());
  it("encontra resultado ambíguo por chassi", async () => expect((await provider.lookupByChassis("9BWZZZ377VT004251"))?.possibleVersions).toHaveLength(3));
});
