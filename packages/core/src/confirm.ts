/**
 * The typed confirmation for what can't be undone (ConfirmSheet's `typed`
 * level): the person types a name or a word before the button wakes up.
 * Case and the spaces around it don't count; spelling does.
 */
export function typedConfirmMatches(typed: string, expected: string): boolean {
  const want = expected.trim().toLowerCase()
  return want.length > 0 && typed.trim().toLowerCase() === want
}

/** The disabled button's reason until it matches: 'Type "DELETE" to confirm.' */
export function typedConfirmHint(expected: string): string {
  return `Type "${expected.trim()}" to confirm.`
}
