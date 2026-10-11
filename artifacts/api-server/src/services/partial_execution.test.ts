import { test, expect } from "vitest";
import { calculateExecutionBalances, validateExecutionLot } from "./partial_execution.js";

const items = [{ itemId: "janela", contractedQuantity: 10 }, { itemId: "porta", contractedQuantity: 2 }];
test("reserva parcial preserva saldo e item ainda não executado", () => {
  const result = validateExecutionLot(items, [], [{ itemId: "janela", quantity: 4 }]);
  expect(result.balancesAfter.map((x) => x.available)).toEqual([6, 2]);
});
test("lote posterior não excede quantidade contratada", () => {
  const prior = [{ lotId: "l1", itemId: "janela", quantity: 7, status: "in_progress" as const }];
  expect(() => validateExecutionLot(items, prior, [{ itemId: "janela", quantity: 4 }])).toThrow(/excede/);
});
test("cancelamento libera saldo; concluído continua contabilizado", () => {
  const balances = calculateExecutionBalances(items, [
    { lotId: "1", itemId: "janela", quantity: 3, status: "cancelled" },
    { lotId: "2", itemId: "janela", quantity: 5, status: "completed" },
  ]);
  expect(balances[0].available).toBe(5);
  expect(balances[0].completed).toBe(5);
});
test("rejeita duplicidade, negativos, item estranho e excesso de precisão", () => {
  expect(() => validateExecutionLot(items, [], [{ itemId: "janela", quantity: 1 }, { itemId: "janela", quantity: 1 }])).toThrow(/repetido/);
  expect(() => validateExecutionLot(items, [], [{ itemId: "janela", quantity: -1 }])).toThrow(/inválida/);
  expect(() => validateExecutionLot(items, [], [{ itemId: "outra", quantity: 1 }])).toThrow(/não pertence/);
  expect(() => validateExecutionLot(items, [], [{ itemId: "janela", quantity: 0.0000001 }])).toThrow(/precisão/);
});
test("não muda arrays fornecidos pelo chamador", () => {
  const input = [{ itemId: "janela", quantity: 2 }];
  validateExecutionLot(items, [], input);
  expect(input).toEqual([{ itemId: "janela", quantity: 2 }]);
});
