import { test, expect } from "vitest";
import { validateCompletedQuantity } from "./execution_progress_rules.js";

test("permite progresso parcial e conclusão", () => {
  expect(validateCompletedQuantity(10, 2, 6)).toBe(6);
  expect(validateCompletedQuantity(10, 6, 10)).toBe(10);
});
test("não permite retroceder ou exceder saldo", () => {
  expect(() => validateCompletedQuantity(10, 5, 4)).toThrow(/estorno/);
  expect(() => validateCompletedQuantity(10, 5, 11)).toThrow(/ultrapassa/);
});
test("rejeita dados não finitos, negativos e excesso de precisão", () => {
  expect(() => validateCompletedQuantity(10, 0, NaN)).toThrow();
  expect(() => validateCompletedQuantity(10, 0, -1)).toThrow();
  expect(() => validateCompletedQuantity(10, 0, 0.1234567)).toThrow();
});
