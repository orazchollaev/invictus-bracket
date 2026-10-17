export type Rng = () => number

export function uid(): string {
  return Math.random().toString(36).slice(2)
}

/** Fisher-Yates shuffle. Pass a seeded `rng` for a reproducible result. */
export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Deterministic PRNG (mulberry32). Returns floats in [0, 1). */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function getRoundName(matchCount: number): string {
  if (matchCount === 1) return "Final"
  if (matchCount === 2) return "Semi-Finals"
  if (matchCount === 4) return "Quarter-Finals"
  return `Round of ${matchCount * 2}`
}
