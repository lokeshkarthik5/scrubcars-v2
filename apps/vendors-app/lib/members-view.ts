import type { VendorRole } from '@repo/core/api/types';

/**
 * Words and small rules of the Team screen (apps/vendors/app/settings/members/page.tsx),
 * kept pure so they can be tested.
 */
export const ROLE_OPTIONS: { value: VendorRole; label: string }[] = [
  { value: 'vendor_operator', label: 'Operator — jobs only' },
  { value: 'vendor_admin', label: 'Admin — full access' },
];

export function roleLabel(role: VendorRole): string {
  return role === 'vendor_admin' ? 'Admin' : 'Operator';
}

/** The short names the role select on a member's row shows. */
export const ROLE_SHORT_OPTIONS = ROLE_OPTIONS.map((option) => ({
  value: option.value,
  label: roleLabel(option.value),
}));

export const PHONE_PROBLEM = 'Enter a 10-digit phone number';
export const ADD_NOTE =
  'They get access the next time they log in with this number. Operators can work on jobs but cannot see earnings or change settings.';
export const OWNER_LOCKED =
  'The owner cannot be changed or removed. Transfer ownership first.';

export const isTenDigits = (phone: string) => phone.length === 10;

export const transferPrompt = (name: string) =>
  `Make ${name} the owner? You stay an admin, but you cannot undo this yourself.`;

export const removePrompt = (name: string) => `Remove ${name}? They will no longer be able to use this garage.`;

/** What a Suspend / Restore press does, and says. */
export function suspendChange(status: 'active' | 'suspended') {
  return status === 'active'
    ? { next: 'suspended' as const, done: 'Member suspended', label: 'Suspend' }
    : { next: 'active' as const, done: 'Member restored', label: 'Restore' };
}

/** "Make owner": the owner seat only, and only for a member who can sign in. */
export const canMakeOwner = (viewerIsOwner: boolean, member: { isOwner: boolean; status: string }) =>
  viewerIsOwner && !member.isOwner && member.status === 'active';
