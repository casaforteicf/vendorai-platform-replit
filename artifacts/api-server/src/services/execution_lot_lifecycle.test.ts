import { test, expect } from "vitest";
import { assertLotTransition } from "./execution_lot_lifecycle.js";

test("permite avanço reservado para execução", () => {
  expect(() => assertLotTransition("reserved", "in_progress")).not.toThrow();
});
test("permite concluir lote em andamento", () => {
  expect(() => assertLotTransition("in_progress", "completed")).not.toThrow();
});
test("permite cancelar antes de concluir", () => {
  expect(() => assertLotTransition("reserved", "cancelled")).not.toThrow();
  expect(() => assertLotTransition("in_progress", "cancelled")).not.toThrow();
});
test("não permite pular execução, voltar etapas ou reabrir estados finais", () => {
  expect(() => assertLotTransition("reserved", "completed")).toThrow();
  expect(() => assertLotTransition("completed", "in_progress")).toThrow();
  expect(() => assertLotTransition("cancelled", "reserved")).toThrow();
  expect(() => assertLotTransition("in_progress", "reserved")).toThrow();
});
