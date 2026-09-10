import { describe, expect, it } from "vitest";
import { isJarvisSupportIncident } from "./jarvis_presence.js";

describe("JARVIS Presence Layer", () => {
  it("mantém conversa comum fora do suporte", () => {
    expect(isJarvisSupportIncident("Bom dia, Jarvis")).toBe(false);
    expect(isJarvisSupportIncident("Estou preocupado com as vendas deste mês")).toBe(false);
    expect(isJarvisSupportIncident("Queria escutar uma música agora")).toBe(false);
    expect(isJarvisSupportIncident("Como estamos no negócio hoje?")).toBe(false);
  });

  it("encaminha incidentes técnicos reais ao suporte", () => {
    expect(isJarvisSupportIncident("A tela está bugada e não carrega")).toBe(true);
    expect(isJarvisSupportIncident("Deu erro 500 ao salvar o cliente")).toBe(true);
    expect(isJarvisSupportIncident("O sistema entrou em loop infinito")).toBe(true);
    expect(isJarvisSupportIncident("Abra um chamado para esse problema")).toBe(true);
  });

  it("não transforma preocupação pessoal ou de negócio em chamado", () => {
    expect(isJarvisSupportIncident("Tenho um problema com a margem dos produtos")).toBe(false);
    expect(isJarvisSupportIncident("Estou preocupado com um cliente importante")).toBe(false);
  });
});
