import assert from "node:assert/strict";
import test from "node:test";
import { assertLotTransition } from "./execution_lot_lifecycle.js";

test("permite avanço reservado para execução", () => {
  assert.doesNotThrow(() => assertLotTransition("reserved", "in_progress"));
});
test("permite concluir lote em andamento", () => {
  assert.doesNotThrow(() => assertLotTransition("in_progress", "completed"));
});
test("permite cancelar antes de concluir", () => {
  assert.doesNotThrow(() => assertLotTransition("reserved", "cancelled"));
  assert.doesNotThrow(() => assertLotTransition("in_progress", "cancelled"));
});
test("não permite pular execução, voltar etapas ou reabrir estados finais", () => {
  assert.throws(() => assertLotTransition("reserved", "completed"));
  assert.throws(() => assertLotTransition("completed", "in_progress"));
  assert.throws(() => assertLotTransition("cancelled", "reserved"));
  assert.throws(() => assertLotTransition("in_progress", "reserved"));
});
