import { describe, expect, it } from "vitest";
import {
  normalizeArqdorIntelligentProjectImport,
  universalModelDedupeKey,
} from "../lib/arqdor-intelligent-project-import.js";

describe("Arqdor intelligent project import", () => {
  it("normaliza memória e remove PII dos modelos universais", () => {
    const result = normalizeArqdorIntelligentProjectImport({
      document: {
        pages: 6,
        detectedSheets: [{ page: 1, type: "floor_plan", label: "Planta baixa", confidence: 0.98 }],
      },
      memory: {
        summary: "Residência térrea",
        totalAreaM2: 377.23,
        floors: 1,
        rooms: [{ label: "Sala", areaM2: 30 }],
        openings: [{ code: "J04", width: 1.2, height: 2.2 }],
        materials: [{ name: "Alumínio preto fosco" }],
        technicalNotes: ["Parede cerâmica 14 cm"],
        inconsistencies: [],
        sourcePages: [{ page: 1, evidence: "quadro de esquadrias" }],
      },
      universalCandidates: [{
        kind: "pre_project",
        title: "Residência térrea 377 m²",
        confidence: 0.91,
        architecture: {
          walls: [{ thickness: 0.15 }],
          cliente: "NÃO PODE VAZAR",
          cpf: "000.000.000-00",
        },
        metadata: {
          floors: 1,
          endereco: "NÃO PODE VAZAR",
        },
        provenance: {
          pages: [1, 2],
          email: "nao@vazar.com",
        },
      }],
      warnings: [],
    }, "cliente-nome-projeto.pdf");

    expect(result.memory.totalAreaM2).toBe(377.23);
    expect(result.universalCandidates).toHaveLength(1);
    expect(result.universalCandidates[0]?.architecture).toEqual({
      walls: [{ thickness: 0.15 }],
    });
    expect(result.universalCandidates[0]?.metadata).toEqual({ floors: 1 });
    expect(result.universalCandidates[0]?.provenance).toEqual({
      pages: [1, 2],
      sourceDocument: "imported_project",
      generatedFromImport: true,
    });
  });

  it("gera chave de deduplicação estável para o mesmo modelo", () => {
    const candidate = normalizeArqdorIntelligentProjectImport({
      document: {},
      memory: {},
      universalCandidates: [{
        kind: "facade",
        title: "Fachada contemporânea",
        confidence: 0.8,
        architecture: { roof: "gable" },
        metadata: { floors: 1 },
        provenance: { pages: [3] },
      }],
    }, "projeto.pdf").universalCandidates[0]!;

    expect(universalModelDedupeKey(candidate)).toBe(universalModelDedupeKey(candidate));
    expect(universalModelDedupeKey(candidate)).toHaveLength(64);
  });
});
