import { randomBytes } from 'crypto';

export function generateShareId(): string {
  const bytes = randomBytes(4).toString('hex').toUpperCase();
  return `CALEN-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}`;
}
