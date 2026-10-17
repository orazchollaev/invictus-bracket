import { describe, expect, it } from "vitest"
import {
  applyLegModes,
  bracketOrder,
  buildBracketRounds,
  buildEmptyBracketRounds,
  buildPureBracket,
  getLoserId,
  getWinnerId,
  makeRng,
  propagateWinners,
  resolveRoundLegMode,
  spreadByeSlots,
  stageForDistance,
} from "../index"

function makeTeams(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, power: 100 - i }))
}

const match = (result: object | null, extra: object = {}) => ({
  id: "m",
  homeId: "a",
  awayId: "b",
  result: result as never,
  ...extra,
})

describe("stageForDistance / resolveRoundLegMode", () => {
  it("maps round distance to a named stage", () => {
    expect(stageForDistance(1)).toBe("semifinal")
    expect(stageForDistance(2)).toBe("quarterfinal")
    expect(stageForDistance(3)).toBe("r16")
    expect(stageForDistance(4)).toBe("r32")
    expect(stageForDistance(9)).toBe("r64")
  })

  it("prefers per-stage overrides over the global leg mode", () => {
    const c = { knockoutLegMode: "single" as const, roundLegModes: { quarterfinal: "double" as const } }
    expect(resolveRoundLegMode(c, 1)).toBe("single")
    expect(resolveRoundLegMode(c, 2)).toBe("double")
  })
})

describe("getWinnerId", () => {
  it("returns null without a result", () => {
    expect(getWinnerId(match(null))).toBeNull()
  })

  it("resolves single-leg ties by score then penalties", () => {
    expect(getWinnerId(match({ home: 2, away: 1 }))).toBe("a")
    expect(getWinnerId(match({ home: 1, away: 3 }))).toBe("b")
    expect(getWinnerId(match({ home: 1, away: 1, penHome: 4, penAway: 3 }))).toBe("a")
    expect(getWinnerId(match({ home: 1, away: 1, penHome: 2, penAway: 5 }))).toBe("b")
    expect(getWinnerId(match({ home: 1, away: 1 }))).toBeNull()
  })

  it("keeps a two-leg tie pending until leg 2 is played", () => {
    expect(getWinnerId(match({ home: 1, away: 0 }, { leg2Result: null }))).toBeNull()
  })

  it("decides a two-leg tie on aggregate", () => {
    // leg1 a 2-0, leg2 (b home) 1-1 → aggregate a 3-1
    expect(
      getWinnerId(match({ home: 2, away: 0 }, { leg2Result: { home: 1, away: 1 } }))
    ).toBe("a")
  })

  it("decides a level two-leg tie on leg-2 penalties", () => {
    const leg = (penHome: number, penAway: number) => ({
      leg2Result: { home: 1, away: 1, penHome, penAway },
    })
    expect(getWinnerId(match({ home: 1, away: 1 }, leg(3, 4)))).toBe("a")
    expect(getWinnerId(match({ home: 1, away: 1 }, leg(4, 3)))).toBe("b")
  })
})

describe("getLoserId", () => {
  it("returns the losing side, or null when undecided", () => {
    expect(getLoserId(match({ home: 2, away: 1 }))).toBe("b")
    expect(getLoserId(match({ home: 0, away: 1 }))).toBe("a")
    expect(getLoserId(match(null))).toBeNull()
  })
})

describe("buildBracketRounds", () => {
  it("builds log2 rounds and names them", () => {
    const rounds = buildBracketRounds(makeTeams(4))
    expect(rounds.map((r) => r.name)).toEqual(["Semi-Finals", "Final"])
    expect(rounds.map((r) => r.matches.length)).toEqual([2, 1])
  })

  it("auto-resolves byes as walkover wins", () => {
    const t = makeTeams(3)
    const rounds = buildBracketRounds([t[0], null, t[1], t[2]])
    expect(rounds[0].matches[0].result).toEqual({ home: 1, away: 0 })
    expect(rounds[0].matches[1].result).toBeNull()
  })

  it("accepts custom round names", () => {
    const rounds = buildBracketRounds(makeTeams(4), { roundName: (n) => `R${n}` })
    expect(rounds.map((r) => r.name)).toEqual(["R2", "R1"])
  })

  it("builds empty rounds of the right sizes", () => {
    const rounds = buildEmptyBracketRounds(8)
    expect(rounds.map((r) => r.matches.length)).toEqual([4, 2, 1])
  })
})

describe("buildPureBracket", () => {
  it("places every team exactly once", () => {
    const rounds = buildPureBracket(makeTeams(8))
    const placed = rounds[0].matches.flatMap((m) => [m.homeId, m.awayId]).filter(Boolean)
    expect(new Set(placed).size).toBe(8)
  })

  it("gives the strongest teams byes when seeded and not a power of two", () => {
    const rounds = buildPureBracket(makeTeams(5), { seeded: true })
    const byes = rounds[0].matches.filter((m) => m.result && (!m.homeId || !m.awayId))
    expect(byes.map((m) => m.homeId ?? m.awayId).sort()).toEqual(["t1", "t2", "t3"])
  })

  it("ranks by a custom function", () => {
    const teams = makeTeams(5)
    const rounds = buildPureBracket(teams, { seeded: true, rank: (t) => Number(t.id.slice(1)) })
    const byes = rounds[0].matches.filter((m) => !m.homeId || !m.awayId)
    expect(byes.map((m) => m.homeId ?? m.awayId).sort()).toEqual(["t3", "t4", "t5"])
  })

  it("is reproducible with a seeded rng", () => {
    const ids = (seed: number) =>
      buildPureBracket(makeTeams(16), { rng: makeRng(seed) })[0].matches.map((m) => m.homeId)
    expect(ids(7)).toEqual(ids(7))
    expect(ids(7)).not.toEqual(ids(8))
  })

  it("reads an explicit ordered list as bye-front and spreads the byes", () => {
    const teams = makeTeams(6)
    const rounds = buildPureBracket(teams, { orderedTeams: teams })
    const byeSlots = rounds[0].matches
      .map((m, i) => (!m.homeId || !m.awayId ? i : -1))
      .filter((i) => i >= 0)
    expect(byeSlots).toHaveLength(2)
    expect(Math.floor(byeSlots[0] / 2)).not.toBe(Math.floor(byeSlots[1] / 2))
  })

  it("propagates bye winners into round 2", () => {
    const rounds = buildPureBracket(makeTeams(3), { seeded: true })
    const filled = rounds[1].matches[0]
    expect([filled.homeId, filled.awayId].filter(Boolean)).toEqual(["t1"])
  })

  it("rejects fewer than 2 participants", () => {
    expect(() => buildPureBracket(makeTeams(1))).toThrow(RangeError)
  })
})

describe("propagateWinners", () => {
  it("fills the next round with winners in the right slots", () => {
    const rounds = buildBracketRounds(makeTeams(4))
    rounds[0].matches[0].result = { home: 1, away: 0 } // t1 beats t2
    rounds[0].matches[1].result = { home: 0, away: 2 } // t4 beats t3
    propagateWinners(rounds)
    expect(rounds[1].matches[0].homeId).toBe("t1")
    expect(rounds[1].matches[0].awayId).toBe("t4")
  })
})

describe("applyLegModes", () => {
  it("marks non-bye matches as two-leg only where configured", () => {
    const rounds = buildPureBracket(makeTeams(8))
    applyLegModes(rounds, {
      knockoutLegMode: "single",
      roundLegModes: { quarterfinal: "double" },
      finalLegMode: "single",
    })
    expect(rounds[0].matches.every((m) => m.leg2Result === null)).toBe(true)
    expect(rounds[1].matches.every((m) => m.leg2Result === undefined)).toBe(true)
    expect(rounds[2].matches.every((m) => m.leg2Result === undefined)).toBe(true)
  })

  it("never marks bye matches as two-leg", () => {
    const rounds = buildPureBracket(makeTeams(5))
    applyLegModes(rounds, { knockoutLegMode: "double", finalLegMode: "double" })
    for (const m of rounds[0].matches) {
      const bye = (m.homeId && !m.awayId) || (!m.homeId && m.awayId)
      expect(m.leg2Result === undefined).toBe(!!bye)
    }
  })
})

describe("bracketOrder / spreadByeSlots", () => {
  it("produces the standard snake bracket order", () => {
    expect(bracketOrder(4)).toEqual([0, 3, 1, 2])
    expect(bracketOrder(8)).toEqual([0, 7, 3, 4, 1, 6, 2, 5])
  })

  it("spreads byes across different subtrees", () => {
    expect(spreadByeSlots(2, 8)).toEqual([0, 7])
    expect(spreadByeSlots(3, 8)).toEqual([0, 7, 3])
    expect(spreadByeSlots(0, 8)).toEqual([])
  })
})
