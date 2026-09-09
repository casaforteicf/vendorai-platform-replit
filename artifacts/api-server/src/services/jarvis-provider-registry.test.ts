import { describe, expect, it } from "vitest";
import {
  detectCryptoAssets,
  detectFiatCurrencies,
  detectStockSymbols,
} from "./jarvis-provider-registry.js";

describe("jarvis provider registry", () => {
  it("detecta câmbio em linguagem natural", () => {
    expect(detectFiatCurrencies("Quanto vale 100 dólares em reais?")).toEqual(["USD", "BRL"]);
    expect(detectFiatCurrencies("EUR para USD")).toEqual(["EUR", "USD"]);
  });

  it("usa USD/BRL como referência quando o pedido de câmbio ou Forex é genérico", () => {
    expect(detectFiatCurrencies("E câmbio?")).toEqual(["USD", "BRL"]);
    expect(detectFiatCurrencies("Como está Forex hoje?")).toEqual(["USD", "BRL"]);
  });

  it("detecta criptoativos comuns", () => {
    expect(detectCryptoAssets("Bitcoin e Ethereum agora")).toEqual(["bitcoin", "ethereum"]);
    expect(detectCryptoAssets("BTC em BRL")).toEqual(["bitcoin"]);
  });

  it("detecta ações conhecidas e ticker explícito", () => {
    expect(detectStockSymbols("Como está PETR4 e VALE3?")).toEqual(["PETR4", "VALE3"]);
    expect(detectStockSymbols("Veja $NVDA")).toEqual(["NVDA"]);
  });
});
