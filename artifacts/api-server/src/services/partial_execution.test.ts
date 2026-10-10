import assert from "node:assert/strict";
import test from "node:test";
import { calculateExecutionBalances, validateExecutionLot } from "./partial_execution.js";

const items = [{ itemId: "janela", contractedQuantity: 10 }, { itemId: "porta", contractedQuantity: 2 }];
test("reserva parcial preserva saldo e item ainda não executado", () => {
  const result = validateExecutionLot(items, [], [{ itemId: "janela", quantity: 4 }]);
  assert.deepEqual(result.balancesAfter.map((x) => x.available), [6, 2]);
});
test("lote posterior não excede quantidade contratada", () => {
  const prior = [{ lotId: "l1", itemId: "janela", quantity: 7, status: "in_progress" as const }];
  assert.throws(() => validateExecutionLot(items, prior, [{ itemId: "janela", quantity: 4 }]), /excede/);
});
test("cancelamento libera saldo; concluído continua contabilizado", () => {
  const balances = calculateExecutionBalances(items, [
    { lotId: "1", itemId: "janela", quantity: 3, status: "cancelled" },
    { lotId: "2", itemId: "janela", quantity: 5, status: "completed" },
  ]);
  assert.equal(balances[0].available, 5);
  assert.equal(balances[0].completed, 5);
});
test("rejeita duplicidade, negativos, item estranho e excesso de precisão", () => {
  assert.throws(() => validateExecutionLot(items, [], [{ itemId: "janela", quantity: 1 }, { itemId: "janela", quantity: 1 }]), /repetido/);
  assert.throws(() => validateExecutionLot(items, [], [{ itemId: "janela", quantity: -1 }]), /inválida/);
  assert.throws(() => validateExecutionLot(items, [], [{ itemId: "outra", quantity: 1 }]), /não pertence/);
  assert.throws(() => validateExecutionLot(items, [], [{ itemId: "janela", quantity: 0.0000001 }]), /precisão/);
});
test("não muda arrays fornecidos pelo chamador", () => {
  const input = [{ itemId: "janela", quantity: 2 }];
  validateExecutionLot(items, [], input);
  assert.deepEqual(input, [{ itemId: "janela", quantity: 2 }]);
});
