import { describe, expect, it } from "vitest"
import {
  buildPureBracket,
  computeBracketLayout,
  connectorState,
  connectorStrands,
  participantPath,
} from "../index"

const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}` }))
const opts = { cardWidth: 100, cardHeight: 40, cardGap: 10, columnGap: 20, headerHeight: 30 }

describe("computeBracketLayout (classic)", () => {
  const rounds = buildPureBracket(teams(8))
  const l = computeBracketLayout(rounds, opts)

  it("sizes the canvas from the first round", () => {
    expect(l.width).toBe(3 * 100 + 2 * 20)
    expect(l.height).toBe(30 + 4 * 40 + 3 * 10)
  })

  it("emits one card per match and one header per round", () => {
    expect(l.cards).toHaveLength(7)
    expect(l.headers.map((h) => h.name)).toEqual(["Quarter-Finals", "Semi-Finals", "Final"])
  })

  it("centres each later-round card between its two feeders", () => {
    const centre = (ri: number, mi: number) => {
      const c = l.cards.find((c) => c.roundIndex === ri && c.matchIndex === mi)!
      return c.y + c.height / 2
    }
    expect(centre(1, 0)).toBeCloseTo((centre(0, 0) + centre(0, 1)) / 2)
    expect(centre(2, 0)).toBeCloseTo((centre(1, 0) + centre(1, 1)) / 2)
  })

  it("emits an elbow per next-round match, in the gap right of its sources", () => {
    expect(l.connectors).toHaveLength(2 + 1) // one per match in rounds 2 and 3
    const c = l.connectors[0]
    expect(c.kind).toBe("elbow")
    expect(c.x).toBe(100)
    expect(c.width).toBe(20)
    expect(c.sources).toEqual([
      { roundIndex: 0, matchIndex: 0 },
      { roundIndex: 0, matchIndex: 1 },
    ])
  })

  it("returns an empty layout for no rounds", () => {
    expect(computeBracketLayout([])).toEqual({
      width: 0,
      height: 0,
      cards: [],
      headers: [],
      connectors: [],
    })
  })
})

describe("computeBracketLayout (double-sided)", () => {
  const rounds = buildPureBracket(teams(8))
  const l = computeBracketLayout(rounds, { ...opts, mode: "double-sided" })

  it("puts the final in the centre and mirrors the halves", () => {
    const final = l.cards.find((c) => c.roundIndex === 2)!
    expect(final.side).toBe("center")
    expect(final.x + final.width / 2).toBeCloseTo(l.width / 2)
    const left = l.cards.filter((c) => c.side === "left")
    const right = l.cards.filter((c) => c.side === "right")
    expect(left).toHaveLength(right.length)
    for (const c of left) {
      const mirror = right.find((r) => r.roundIndex === c.roundIndex && r.y === c.y)!
      expect(mirror.x + mirror.width).toBeCloseTo(l.width - c.x)
    }
  })

  it("links each semi-final straight to the final", () => {
    const links = l.connectors.filter((c) => c.kind === "link")
    expect(links.map((c) => c.side).sort()).toEqual(["left", "right"])
    expect(links.every((c) => c.dest.roundIndex === 2)).toBe(true)
  })

  it("reads the right half's matches from the second half of each round", () => {
    const rightElbows = l.connectors.filter((c) => c.kind === "elbow" && c.side === "right")
    expect(rightElbows).toHaveLength(1)
    expect(rightElbows[0].sources.map((s) => s.matchIndex)).toEqual([2, 3])
    expect(rightElbows[0].dest).toEqual({ roundIndex: 1, matchIndex: 1 })
  })

  it("falls back to classic for a single round", () => {
    const one = computeBracketLayout(buildPureBracket(teams(2)), { mode: "double-sided" })
    expect(one.cards).toHaveLength(1)
    expect(one.connectors).toHaveLength(0)
  })
})

describe("connectorStrands / connectorState / participantPath", () => {
  // fresh per test: the state tests below mutate results
  const setup = () => {
    const rounds = buildPureBracket(teams(4))
    const l = computeBracketLayout(rounds, opts)
    return { rounds, l, c: l.connectors[0] }
  }

  it("draws two strands for an elbow and one for a link", () => {
    const { rounds, c } = setup()
    expect(connectorStrands(c)).toHaveLength(2)
    const link = computeBracketLayout(rounds, { ...opts, mode: "double-sided" }).connectors.find(
      (k) => k.kind === "link"
    )!
    expect(connectorStrands(link)).toHaveLength(1)
  })

  it("reports winners and advancement", () => {
    const { rounds, l, c } = setup()
    const [a, b] = rounds[0].matches
    a.result = { home: 1, away: 0 }
    expect(connectorState(c, rounds).winners).toEqual([a.homeId, null])
    expect(connectorState(c, rounds).active).toBe(false)

    b.result = { home: 0, away: 1 }
    rounds[1].matches[0].homeId = a.homeId
    rounds[1].matches[0].awayId = b.awayId
    const s = connectorState(l.connectors[0], rounds)
    expect(s.advanced).toEqual([0, 1])
    expect(s.active).toBe(true)
  })

  it("lists the matches a participant appears in", () => {
    const { rounds } = setup()
    const id = rounds[0].matches[0].homeId!
    expect(participantPath(rounds, id)).toEqual([{ roundIndex: 0, matchIndex: 0 }])
  })
})
