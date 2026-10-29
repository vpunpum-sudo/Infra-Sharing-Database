type Provider = { providerId: string; email?: string | null };
export function passwordProviderEmail(providers: readonly Provider[]): string | null {
  return providers.find(provider => provider.providerId === 'password')?.email?.trim() || null;
}
export function passwordSectionMode(providers: readonly Provider[]): 'password' | 'password+google' | 'google-only' | 'none' | 'password-no-email' {
  const password = providers.some(p => p.providerId === 'password');
  const google = providers.some(p => p.providerId === 'google.com');
  if (password && !passwordProviderEmail(providers)) return 'password-no-email';
  return password ? (google ? 'password+google' : 'password') : (google ? 'google-only' : 'none');
}
