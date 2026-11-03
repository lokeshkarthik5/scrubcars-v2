/// <reference types="bun" />
import { expect, test } from 'bun:test';

import {
  canMakeOwner,
  isTenDigits,
  ROLE_OPTIONS,
  ROLE_SHORT_OPTIONS,
  roleLabel,
  suspendChange,
  transferPrompt,
} from './members-view';

test('role words', () => {
  expect(roleLabel('vendor_admin')).toBe('Admin');
  expect(roleLabel('vendor_operator')).toBe('Operator');
  expect(ROLE_OPTIONS[0]).toEqual({ value: 'vendor_operator', label: 'Operator — jobs only' });
  expect(ROLE_SHORT_OPTIONS.map((o) => o.label)).toEqual(['Operator', 'Admin']);
});

test('a phone is exactly ten digits', () => {
  expect(isTenDigits('9000001002')).toBe(true);
  expect(isTenDigits('900000100')).toBe(false);
  expect(isTenDigits('')).toBe(false);
});

test('suspend and restore', () => {
  expect(suspendChange('active')).toEqual({ next: 'suspended', done: 'Member suspended', label: 'Suspend' });
  expect(suspendChange('suspended')).toEqual({ next: 'active', done: 'Member restored', label: 'Restore' });
});

test('only the owner seat can make an active member the owner', () => {
  const active = { isOwner: false, status: 'active' };
  expect(canMakeOwner(true, active)).toBe(true);
  expect(canMakeOwner(false, active)).toBe(false);
  expect(canMakeOwner(true, { isOwner: false, status: 'suspended' })).toBe(false);
  expect(canMakeOwner(true, { isOwner: true, status: 'active' })).toBe(false);
});

test('the transfer question is the web\'s', () => {
  expect(transferPrompt('Oviya')).toBe('Make Oviya the owner? You stay an admin, but you cannot undo this yourself.');
});
