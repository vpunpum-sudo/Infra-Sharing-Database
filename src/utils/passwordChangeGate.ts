export function passwordChangeGate(input: { requiresPasswordChange?: boolean; signInProvider?: string | null }): 'force' | 'skip' | 'pending' {
  if (input.requiresPasswordChange !== true) return 'skip';
  if (input.signInProvider === undefined) return 'pending';
  return input.signInProvider === 'google.com' ? 'skip' : 'force';
}
