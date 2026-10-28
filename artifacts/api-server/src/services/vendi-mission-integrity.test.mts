import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preservePendingSteps, isObserverReadOnlyTool, completedPlan } from './vendi-mission-integrity.ts';
const step = (toolId: string, input: Record<string, unknown> = {}) => ({toolId, input, reason: ''});
test('adaptive plan cannot drop activities after listing leads', () => {
  const pending = [step('crm.deals.list'), step('admin.operational_attention')];
  assert.deepEqual(preservePendingSteps(pending, [pending[0]!]), pending);
});
test('input object key order does not duplicate calls, but distinct inputs survive', () => {
  const pending = [step('read', {a: 1, b: 2}), step('read', {a: 2})];
  assert.equal(preservePendingSteps(pending, [step('read', {b: 2, a: 1})]).length, 2);
});
test('repeated pending steps retain multiplicity', () => {
  assert.equal(preservePendingSteps([step('read'), step('read')], [step('read')]).length, 2);
});
test('observer cannot use external actions or internal mutations', () => {
  assert.equal(isObserverReadOnlyTool({mutates: true, externalEffect: true}), false);
  assert.equal(isObserverReadOnlyTool({mutates: true, externalEffect: false}), false);
  assert.equal(isObserverReadOnlyTool({mutates: false, externalEffect: true}), false);
  assert.equal(isObserverReadOnlyTool({mutates: false, externalEffect: false}), true);
});
test('empty and partially executed plans cannot complete', () => {
  assert.equal(completedPlan([], []), false);
  const plan = [step('leads'), step('activities')];
  assert.equal(completedPlan(plan, [{stepIndex:0, toolId:'leads', ok:true}]), false);
  assert.equal(completedPlan(plan, [{stepIndex:0, toolId:'leads', ok:true}, {stepIndex:1, toolId:'other', ok:true}]), false);
  assert.equal(completedPlan(plan, [{stepIndex:0, toolId:'leads', ok:true}, {stepIndex:1, toolId:'activities', ok:false}]), false);
  assert.equal(completedPlan(plan, [{stepIndex:0, toolId:'leads', ok:true}, {stepIndex:1, toolId:'activities', ok:true}]), true);
});
