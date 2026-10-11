import assert from "node:assert/strict";
import test from "node:test";
import { validateCompletedQuantity } from "./execution_progress_rules.js";

test("permite progresso parcial e conclusão", () => {
  assert.equal(validateCompletedQuantity(10, 2, 6), 6);
  assert.equal(validateCompletedQuantity(10, 6, 10), 10);
});
test("não permite retroceder ou exceder saldo", () => {
  assert.throws(() => validateCompletedQuantity(10, 5, 4), /estorno/);
  assert.throws(() => validateCompletedQuantity(10, 5, 11), /ultrapassa/);
});
test("rejeita dados não finitos, negativos e excesso de precisão", () => {
  assert.throws(() => validateCompletedQuantity(10, 0, NaN));
  assert.throws(() => validateCompletedQuantity(10, 0, -1));
  assert.throws(() => validateCompletedQuantity(10, 0, 0.1234567));
});
