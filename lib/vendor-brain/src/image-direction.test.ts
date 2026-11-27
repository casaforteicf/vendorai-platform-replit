import { describe, expect, it } from "vitest";
import { buildImageDirection, buildScenePrompt, detectVisualKind } from "./image-direction";

describe("direção visual por tipo de negócio", () => {
  it("reconhece hotelaria mesmo com vertical genérica de serviços", () => {
    expect(detectVisualKind({
      vertical: "servicos",
      tenantName: "Aj termas irai",
      productName: "Pacote tiradentes 2027",
      theme: "Reels 1: educação sobre pacotes 2027",
    })).toBe("hospitality");
  });

  it("reconhece restaurante, imóvel, varejo e serviço", () => {
    expect(detectVisualKind({ productName: "Pizza artesanal", theme: "cardápio" })).toBe("food");
    expect(detectVisualKind({ productName: "Apartamento 3 quartos", theme: "lançamento" })).toBe("realestate");
    expect(detectVisualKind({ productName: "Coleção verão", theme: "moda" })).toBe("retail");
    expect(detectVisualKind({ productName: "Consultoria financeira", theme: "planejamento" })).toBe("service");
  });

  it("usa nome do tenant quando o nome fantasia está vazio", () => {
    const direction = buildImageDirection({ tenantName: "Aj termas irai", productName: "Pacote tiradentes 2027" });
    expect(direction.brand).toBe("Aj termas irai");
    expect(direction.kind).toBe("hospitality");
    expect(direction.subject).toContain("Pacote tiradentes 2027");
  });

  it("não usa conceito de produto para hotelaria", () => {
    const direction = buildImageDirection({ tenantName: "Hotel Serra Azul", productName: "Pacote fim de semana" });
    expect(direction.scenes.some((scene) => /product|flat-lay|macro/i.test(scene.prompt))).toBe(false);
    expect(direction.scenes[0]?.prompt).toMatch(/venue|suite|pool/i);
  });

  it("inclui restrições negativas e marca no prompt final", () => {
    const direction = buildImageDirection({ tenantName: "Hotel Serra Azul", productName: "Pacote fim de semana" });
    const prompt = buildScenePrompt(direction, 1, "Feed (square 1:1)");
    expect(prompt).toContain("Hotel Serra Azul");
    expect(prompt).toContain("Pacote fim de semana");
    expect(prompt).toContain("no text");
    expect(prompt).toContain("no watermark");
    expect(prompt).toContain("no frame");
  });

  it("prompt de hotelaria não usa conceito de produto nem 'Improve this image'", () => {
    const direction = buildImageDirection({
      tenantName: "Aj termas irai",
      productName: "Pacote tiradentes 2027",
      theme: "Reels 1: educação sobre pacotes",
    });
    const prompt = buildScenePrompt(direction, 0, "Feed (square 1:1)");
    expect(prompt).not.toMatch(/product photograph|flat-lay|Improve this image/i);
    expect(prompt).toMatch(/venue|suite|pool|hospitality/i);
    expect(prompt).toContain("no text");
  });

  it("não repete o produto quando o tema já está contido nele", () => {
    const direction = buildImageDirection({ productName: "Pacote Tiradentes", theme: "Pacote Tiradentes — oferta" });
    expect(direction.subject.match(/Pacote Tiradentes/g)?.length).toBe(1);
  });
});
