export type KnownValues = { email?: string | null; displayName?: string | null };

export function findPii(text: string): Array<'email' | 'phone'> {
  const kinds: Array<'email' | 'phone'> = [];
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) kinds.push('email');
  if (/(?:\+66|0)[\d\s()-]{8,}\d/.test(text)) kinds.push('phone');
  return kinds;
}

export function findKnownValues(text: string, known: KnownValues): Array<'email' | 'displayName'> {
  const normalized = text.toLocaleLowerCase();
  const values = (['email', 'displayName'] as const).filter(key => {
    const value = known[key]?.trim();
    return !!value && normalized.includes(value.toLocaleLowerCase());
  });
  return values;
}

export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
  // Very short values (a flag such as "1") are not secrets and would mangle every message.
  return secrets.filter((item): item is string => !!item && item.length >= 4).reduce((value, secret) => value.replaceAll(secret, '[redacted]'), text);
}
