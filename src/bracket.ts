import type { LegConfig, LegMode, KnockoutStage, Match, Participant, Round } from "./types"
import { getRoundName, shuffle, uid, type Rng } from "./utils"

// Maps a round's distance from the final (1 = semifinal, 2 = quarterfinal, …)
// to a named stage. Distances >= 5 all collapse into "r64".
export function stageForDistance(distance: number): KnockoutStage {
  if (distance === 1) return "semifinal"
  if (distance === 2) return "quarterfinal"
  if (distance === 3) return "r16"
  if (distance === 4) return "r32"
  return "r64"
}

export function resolveRoundLegMode(
  config: Pick<LegConfig, "knockoutLegMode" | "roundLegModes">,
  distanceFromFinal: number
): LegMode {
  return (
    config.roundLegModes?.[stageForDistance(distanceFromFinal)] ??
    config.knockoutLegMode ??
    "single"
  )
}

const isBye = (m: Match) => (m.homeId && !m.awayId) || (!m.homeId && m.awayId)

/**
 * Marks non-bye matches in every round as two-leg per that round's resolved
 * stage setting, and the final round per `finalLegMode`. Mutates `rounds`.
 */
export function applyLegModes(rounds: Round[], config: LegConfig) {
  for (let r = 0; r < rounds.length - 1; r++) {
    const distance = rounds.length - 1 - r
    if (resolveRoundLegMode(config, distance) === "double") {
      for (const m of rounds[r].matches) if (!isBye(m)) m.leg2Result = null
    }
  }
  if (config.finalLegMode === "double" && rounds.length > 0) {
    for (const m of rounds[rounds.length - 1].matches) if (!isBye(m)) m.leg2Result = null
  }
}

export function getWinnerId(match: Match): string | null {
  if (!match.result) return null

  // Two-leg tie: leg2Result undefined = single leg
  if (match.leg2Result !== undefined) {
    if (match.leg2Result === null) return null // leg 2 not yet played
    // homeId plays away in leg 2, so its goals there are leg2Result.away
    const aggHome = match.result.home + match.leg2Result.away
    const aggAway = match.result.away + match.leg2Result.home
    if (aggHome > aggAway) return match.homeId
    if (aggAway > aggHome) return match.awayId
    // Aggregate tied: leg-2 shootout (penHome is awayId's pens, penAway is homeId's)
    const { penHome, penAway } = match.leg2Result
    if (penHome !== undefined && penAway !== undefined) {
      if (penAway > penHome) return match.homeId
      if (penHome > penAway) return match.awayId
    }
    return null
  }

  if (match.result.home > match.result.away) return match.homeId
  if (match.result.away > match.result.home) return match.awayId
  const { penHome, penAway } = match.result
  if (penHome !== undefined && penAway !== undefined) {
    if (penHome > penAway) return match.homeId
    if (penAway > penHome) return match.awayId
  }
  return null
}

export function getLoserId(match: Match): string | null {
  const winner = getWinnerId(match)
  if (!winner || !match.result) return null
  return match.homeId === winner ? match.awayId : match.homeId
}

/** Copies every decided winner into its slot in the next round. Mutates `rounds`. */
export function propagateWinners(rounds: Round[]) {
  for (let r = 0; r < rounds.length - 1; r++) {
    const next = rounds[r + 1]
    rounds[r].matches.forEach((match, i) => {
      const winnerId = getWinnerId(match)
      if (!winnerId) return
      const slot = next.matches[Math.floor(i / 2)]
      if (i % 2 === 0) slot.homeId = winnerId
      else slot.awayId = winnerId
    })
  }
}

export interface RoundNaming {
  /** Name a round from its match count. Defaults to Final / Semi-Finals / … / Round of N. */
  roundName?: (matchCount: number) => string
}

/**
 * Builds the rounds from a slot list (home, away, home, away, …). The length
 * must already be a power of two; `null` slots are byes and auto-resolve.
 */
export function buildBracketRounds(
  orderedTeams: (Participant | null)[],
  opts: RoundNaming = {}
): Round[] {
  const name = opts.roundName ?? getRoundName
  const size = orderedTeams.length
  const firstMatches: Match[] = []

  for (let i = 0; i < size / 2; i++) {
    firstMatches.push({
      id: uid(),
      homeId: orderedTeams[i * 2]?.id ?? null,
      awayId: orderedTeams[i * 2 + 1]?.id ?? null,
      result: null,
    })
  }

  // auto-resolve byes
  for (const m of firstMatches) {
    if (m.homeId && !m.awayId) m.result = { home: 1, away: 0 }
    if (!m.homeId && m.awayId) m.result = { home: 0, away: 1 }
  }

  const rounds: Round[] = [{ name: name(size / 2), matches: firstMatches }]
  for (let n = firstMatches.length / 2; n >= 1; n /= 2) {
    rounds.push({
      name: name(n),
      matches: Array.from({ length: n }, () => ({
        id: uid(),
        homeId: null,
        awayId: null,
        result: null,
      })),
    })
  }
  return rounds
}

export function buildEmptyBracketRounds(size: number, opts: RoundNaming = {}): Round[] {
  const name = opts.roundName ?? getRoundName
  const rounds: Round[] = []
  for (let n = size / 2; n >= 1; n = Math.floor(n / 2)) {
    rounds.push({
      name: name(n),
      matches: Array.from({ length: n }, () => ({
        id: uid(),
        homeId: null,
        awayId: null,
        result: null,
      })),
    })
  }
  return rounds
}

/** Standard snake order: the slot index of each seed so 1 meets 2 only in the final. */
export function bracketOrder(n: number): number[] {
  if (n === 1) return [0]
  const half = bracketOrder(n / 2)
  const result: number[] = []
  for (const pos of half) {
    result.push(pos)
    result.push(n - 1 - pos)
  }
  return result
}

// Which `count` of `matchSlotCount` round-1 match slots should hold a bye,
// most-spread-apart first, so byes land in different subtrees.
export function spreadByeSlots(count: number, matchSlotCount: number): number[] {
  if (count <= 0) return []
  return bracketOrder(matchSlotCount).slice(0, count)
}

/**
 * Reorders rank-sorted ids (best first) so consecutive pairing puts a top-half
 * seed against a bottom-half seed in every match.
 */
export function seedPairOrder(ids: string[]): string[] {
  const half = Math.floor(ids.length / 2)
  const top = ids.slice(0, half)
  const bottom = ids.slice(half).reverse()
  const result: string[] = []
  for (let i = 0; i < top.length; i++) {
    result.push(top[i])
    if (bottom[i]) result.push(bottom[i])
  }
  return result
}

/**
 * Packs bye recipients (ids[0..byeCount-1]) + remaining ids into round-1 slots,
 * spreading byes across match slots so they don't collide in the same subtree.
 */
export function packDirectSlots<T extends Participant>(
  ids: string[],
  byeCount: number,
  matchSlotCount: number,
  teams: T[]
): (T | null)[] {
  const byId = new Map(teams.map((t) => [t.id, t]))
  const pick = (id?: string) => (id ? (byId.get(id) ?? null) : null)
  const byeIds = ids.slice(0, byeCount)
  const restIds = ids.slice(byeCount)
  const byeSlotSet = new Set(spreadByeSlots(byeCount, matchSlotCount))
  const slots: (T | null)[] = new Array(matchSlotCount * 2).fill(null)
  let byeIdx = 0
  let restIdx = 0
  for (let i = 0; i < matchSlotCount; i++) {
    if (byeSlotSet.has(i)) {
      slots[i * 2] = pick(byeIds[byeIdx++])
    } else {
      slots[i * 2] = pick(restIds[restIdx++])
      slots[i * 2 + 1] = pick(restIds[restIdx++])
    }
  }
  return slots
}

export interface PureBracketOptions extends RoundNaming {
  /** Seed by strength: the best teams get byes, the rest are split into two pots. */
  seeded?: boolean
  /**
   * A drawn order, bye recipients first, then home/away pairs
   * (`[...byeTeams, home, away, home, away, …]`). Takes precedence over `seeded`.
   */
  orderedTeams?: Participant[]
  /** Strength used when `seeded`. Defaults to `team.power ?? 50`. */
  rank?: (team: Participant) => number
  /** Random source for shuffles. Pass `makeRng(seed)` for a reproducible bracket. */
  rng?: Rng
}

/** Builds a complete bracket (any team count ≥ 2) with byes and winners propagated. */
export function buildPureBracket<T extends Participant>(
  teams: T[],
  opts: PureBracketOptions = {}
): Round[] {
  const rank = opts.rank ?? ((t: Participant) => t.power ?? 50)
  const rng = opts.rng ?? Math.random
  const count = teams.length
  if (count < 2) throw new RangeError("A bracket needs at least 2 participants")
  const size = Math.pow(2, Math.ceil(Math.log2(count)))
  const byes = size - count

  let slots: (Participant | null)[]

  if (opts.orderedTeams) {
    slots = packDirectSlots(
      opts.orderedTeams.map((t) => t.id),
      byes,
      size / 2,
      teams
    )
  } else if (opts.seeded) {
    const sorted = [...teams].sort((a, b) => rank(b) - rank(a))
    const r2Size = size / 2
    const r2Slots = bracketOrder(r2Size)
    const byeTeams = sorted.slice(0, byes)
    const rest = sorted.slice(byes)
    const half = rest.length / 2
    const pot1 = shuffle(rest.slice(0, half), rng)
    const pot2 = shuffle(rest.slice(half), rng)
    slots = new Array(size).fill(null)
    const byeSlots = spreadByeSlots(byes, r2Size)
    byeTeams.forEach((t, i) => (slots[byeSlots[i] * 2] = t))
    pot1.forEach((t, i) => {
      const pos = r2Slots[byes + i]
      slots[pos * 2] = t
      slots[pos * 2 + 1] = pot2[i]
    })
  } else {
    const shuffled = shuffle(teams, rng)
    slots = packDirectSlots(
      shuffled.map((t) => t.id),
      byes,
      size / 2,
      teams
    )
  }

  const rounds = buildBracketRounds(slots, opts)
  propagateWinners(rounds)
  return rounds
}
