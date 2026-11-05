/** Délai avant la nouvelle tentative : 5 s, 10 s, 20 s, 40 s, puis 60 s maximum. */
export function backoffDelay(attempt: number, baseMs = 5_000, maxMs = 60_000): number {
  return Math.min(baseMs * 2 ** Math.max(0, attempt), maxMs);
}
