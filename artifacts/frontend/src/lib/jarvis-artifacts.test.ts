import { describe, expect, it } from "vitest";
import { detectJarvisArtifactRequest } from "./jarvis-artifacts";

describe("JARVIS artifact request detection", () => {
  it("detecta formatos de escritório em linguagem natural", () => {
    expect(detectJarvisArtifactRequest("Transforme esta tabela em Excel")).toBe("xlsx");
    expect(detectJarvisArtifactRequest("Converta o anexo para Word")).toBe("docx");
    expect(detectJarvisArtifactRequest("Gere um PDF com esse relatório")).toBe("pdf");
    expect(detectJarvisArtifactRequest("Exporte isso em CSV")).toBe("csv");
  });

  it("não dispara download para menções sem intenção de gerar arquivo", () => {
    expect(detectJarvisArtifactRequest("O que é um arquivo PDF?" )).toBeNull();
    expect(detectJarvisArtifactRequest("Explique Excel para mim")).toBeNull();
  });
});
