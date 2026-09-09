import { describe, expect, it } from "vitest";
import {
  extractContactDeviceIntent,
  extractContextNavigationIntent,
  extractSpotifyQuery,
  extractVendorAiRoute,
} from "./jarvis_device_actions.js";

describe("JARVIS device actions", () => {
  it("extrai música pedida explicitamente no Spotify", () => {
    expect(extractSpotifyQuery("Jarvis, toque a música Time do Pink Floyd no Spotify"))
      .toBe("Time do Pink Floyd");
  });

  it("extrai álbum sem manter palavras de comando", () => {
    expect(extractSpotifyQuery("coloque o álbum Random Access Memories no spotify"))
      .toBe("Random Access Memories");
  });

  it("não transforma conversa genérica sobre Spotify em execução", () => {
    expect(extractSpotifyQuery("qual a diferença entre Spotify e YouTube Music?"))
      .toBeNull();
  });

  it("reconhece pedido explícito para ligar para contato", () => {
    expect(extractContactDeviceIntent("Jarvis, ligue para João"))
      .toEqual({ kind: "call", contactQuery: "João" });
  });

  it("reconhece abertura de conversa no WhatsApp sem confundir com envio", () => {
    expect(extractContactDeviceIntent("abra o whatsapp da Maria"))
      .toEqual({ kind: "whatsapp", contactQuery: "Maria" });
    expect(extractContactDeviceIntent("envie um whatsapp para Maria dizendo oi"))
      .toBeNull();
  });

  it("reconhece pedido de rota para contato", () => {
    expect(extractContactDeviceIntent("trace a rota para Pedro"))
      .toEqual({ kind: "route", contactQuery: "Pedro" });
  });

  it("reconhece entidades específicas antes da navegação genérica", () => {
    expect(extractContextNavigationIntent("Jarvis, abra o cliente João"))
      .toEqual({ kind: "lead", query: "João" });
    expect(extractContextNavigationIntent("mostre a proposta Casa Forte"))
      .toEqual({ kind: "proposal", query: "Casa Forte" });
    expect(extractContextNavigationIntent("abra a campanha Setembro"))
      .toEqual({ kind: "campaign", query: "Setembro" });
    expect(extractContextNavigationIntent("abra o Caso Vendor margem baixa"))
      .toEqual({ kind: "case", query: "margem baixa" });
  });

  it("não anuncia filtro contextual enquanto a tela de Leads não consumir o parâmetro", () => {
    expect(extractContextNavigationIntent("filtre os leads de Chapecó"))
      .toBeNull();
  });

  it("mapeia navegação para rotas reais conhecidas do VendorAI", () => {
    expect(extractVendorAiRoute("Jarvis, abra a agenda"))
      .toEqual({ path: "/agenda", label: "Agenda" });
    expect(extractVendorAiRoute("vá para o prospector"))
      .toEqual({ path: "/app/prospector", label: "Prospector" });
  });

  it("não navega quando a frase só comenta uma área", () => {
    expect(extractVendorAiRoute("a agenda está cheia hoje"))
      .toBeNull();
  });
});
