import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrimaryContact, selectPrimaryContact } from './crm-v4-primary-contact.mjs';

test('casal exige um único contato principal', () => {
  assert.equal(validatePrimaryContact([{ id: 'a', primary: true }, { id: 'b', primary: false }]).valid, true);
  assert.equal(validatePrimaryContact([{ id: 'a' }, { id: 'b' }]).reason, 'PRIMARY_CONTACT_REQUIRED');
  assert.equal(validatePrimaryContact([{ id: 'a', primary: true }, { id: 'b', primary: true }]).reason, 'MULTIPLE_PRIMARY_CONTACTS');
});
test('impede participantes duplicados e IDs ausentes', () => {
  assert.equal(validatePrimaryContact([{ id: 'a', primary: true }, { id: 'a' }]).reason, 'DUPLICATE_PARTICIPANT');
  assert.equal(validatePrimaryContact([{ id: '', primary: true }]).reason, 'PARTICIPANT_ID_REQUIRED');
});
test('troca contato principal imutavelmente', () => {
  const original = [{ id: 'a', primary: true, role: 'comprador' }, { id: 'b', primary: false, role: 'compradora' }];
  const updated = selectPrimaryContact(original, 'b');
  assert.deepEqual(updated.map(p => p.primary), [false, true]);
  assert.deepEqual(original.map(p => p.primary), [true, false]);
  assert.equal(updated[1].role, 'compradora');
});
test('proíbe contato principal que não participa do negócio', () => {
  assert.throws(() => selectPrimaryContact([{ id: 'a' }], 'outro'), RangeError);
});
