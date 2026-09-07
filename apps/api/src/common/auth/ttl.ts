/**
 * Maqsad: `15m`, `7d` ko'rinishidagi TTL qiymatini soniyaga o'girish.
 * Auth servisi va cookie yordamchisi ikkalasi ishlatadi.
 */

/** `15m`, `30d`, `3600` kabi qiymatlarni soniyaga o'giradi. */
export function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])?$/.exec(ttl.trim());
  if (!match) return 900;
  const value = Number(match[1]);
  switch (match[2]) {
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86_400;
    default:
      return value;
  }
}
