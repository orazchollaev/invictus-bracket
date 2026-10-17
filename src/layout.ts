import { getWinnerId } from "./bracket"
import type { Round } from "./types"

export interface LayoutOptions {
  /** `classic`: rounds left to right. `double-sided`: halves converge on a centred final. */
  mode?: "classic" | "double-sided"
  cardWidth?: number
  cardHeight?: number
  /** Vertical space between cards in the first round. */
  cardGap?: number
  /** Horizontal space between columns, where the connectors are drawn. */
  columnGap?: number
  /** Space reserved above the cards for round titles. */
  headerHeight?: number
}

export type Side = "left" | "right" | "center"

export interface MatchRef {
  roundIndex: number
  matchIndex: number
}

export interface CardBox extends MatchRef {
  matchId: string
  x: number
  y: number
  width: number
  height: number
  side: Side
}

export interface HeaderBox {
  roundIndex: number
  name: string
  side: Side
  x: number
  y: number
  width: number
  height: number
}

export interface Connector {
  /**
   * `elbow`: two matches feed one. `link`: a single straight line, used between
   * each semi-final and the final in the double-sided layout.
   */
  kind: "elbow" | "link"
  /** Which way the strands run: `left` runs right towards the final, `right` runs left. */
  side: "left" | "right"
  /** Left edge and width of the gap the connector fills. */
  x: number
  width: number
  /** Centre y of each source card (one for `link`, two for `elbow`). */
  sourceYs: number[]
  /** Centre y of the destination card. */
  destY: number
  sources: MatchRef[]
  dest: MatchRef
}

export interface BracketLayout {
  width: number
  height: number
  cards: CardBox[]
  headers: HeaderBox[]
  connectors: Connector[]
}

const DEFAULTS = {
  mode: "classic",
  cardWidth: 190,
  cardHeight: 58,
  cardGap: 20,
  columnGap: 32,
  headerHeight: 28,
} satisfies Required<LayoutOptions>

/**
 * Pure geometry for a bracket: where every card, round title and connector
 * goes, in pixels. Render it with anything: DOM, SVG, canvas, a native view.
 * Round shapes must halve each round (as `buildPureBracket` produces).
 */
export function computeBracketLayout(rounds: Round[], options: LayoutOptions = {}): BracketLayout {
  const o = { ...DEFAULTS, ...options }
  if (rounds.length === 0) return { width: 0, height: 0, cards: [], headers: [], connectors: [] }
  return o.mode === "double-sided" && rounds.length > 1
    ? doubleSided(rounds, o)
    : classic(rounds, o)
}

type Resolved = Required<LayoutOptions>

function classic(rounds: Round[], o: Resolved): BracketLayout {
  const { cardWidth: W, cardHeight: H, cardGap, columnGap: G, headerHeight } = o
  const n0 = rounds[0].matches.length
  const bodyH = n0 * H + (n0 - 1) * cardGap
  const colX = (ri: number) => ri * (W + G)
  const centerY = (ri: number, mi: number) => {
    const slot = bodyH / rounds[ri].matches.length
    return headerHeight + slot * mi + slot / 2
  }

  const layout: BracketLayout = {
    width: rounds.length * W + (rounds.length - 1) * G,
    height: headerHeight + bodyH,
    cards: [],
    headers: [],
    connectors: [],
  }

  rounds.forEach((round, ri) => {
    layout.headers.push({
      roundIndex: ri,
      name: round.name,
      side: "center",
      x: colX(ri),
      y: 0,
      width: W,
      height: headerHeight,
    })
    round.matches.forEach((m, mi) =>
      layout.cards.push({
        roundIndex: ri,
        matchIndex: mi,
        matchId: m.id,
        x: colX(ri),
        y: centerY(ri, mi) - H / 2,
        width: W,
        height: H,
        side: "center",
      })
    )
    if (ri === rounds.length - 1) return
    for (let ci = 0; ci < rounds[ri + 1].matches.length; ci++) {
      layout.connectors.push({
        kind: "elbow",
        side: "left",
        x: colX(ri) + W,
        width: G,
        sourceYs: [centerY(ri, ci * 2), centerY(ri, ci * 2 + 1)],
        destY: centerY(ri + 1, ci),
        sources: [
          { roundIndex: ri, matchIndex: ci * 2 },
          { roundIndex: ri, matchIndex: ci * 2 + 1 },
        ],
        dest: { roundIndex: ri + 1, matchIndex: ci },
      })
    }
  })
  return layout
}

function doubleSided(rounds: Round[], o: Resolved): BracketLayout {
  const { cardWidth: W, cardHeight: H, cardGap, columnGap: G, headerHeight } = o
  const last = rounds.length - 1 // index of the final
  const step = W + G
  const k0 = rounds[0].matches.length / 2 // first-round matches per half
  const bodyH = k0 * H + (k0 - 1) * cardGap
  const totalW = 2 * last * step + W
  const leftX = (ri: number) => ri * step
  const rightX = (ri: number) => totalW - W - ri * step
  const finalX = last * step

  // matchIndex is the index within the round; the right half starts at count / 2.
  const half = (ri: number) => rounds[ri].matches.length / 2
  const centerY = (ri: number, mi: number) => {
    const k = half(ri)
    const local = mi >= k ? mi - k : mi
    const slot = bodyH / k
    return headerHeight + slot * local + slot / 2
  }
  const finalY = headerHeight + bodyH / 2

  const layout: BracketLayout = {
    width: totalW,
    height: headerHeight + bodyH,
    cards: [],
    headers: [],
    connectors: [],
  }

  for (let ri = 0; ri < last; ri++) {
    const k = half(ri)
    const header = (side: "left" | "right", x: number): HeaderBox => ({
      roundIndex: ri,
      name: rounds[ri].name,
      side,
      x,
      y: 0,
      width: W,
      height: headerHeight,
    })
    layout.headers.push(header("left", leftX(ri)), header("right", rightX(ri)))

    rounds[ri].matches.forEach((m, mi) => {
      const onRight = mi >= k
      layout.cards.push({
        roundIndex: ri,
        matchIndex: mi,
        matchId: m.id,
        x: onRight ? rightX(ri) : leftX(ri),
        y: centerY(ri, mi) - H / 2,
        width: W,
        height: H,
        side: onRight ? "right" : "left",
      })
    })

    if (ri === last - 1) {
      // semi-finals link straight into the final, one from each half
      layout.connectors.push(
        {
          kind: "link",
          side: "left",
          x: leftX(ri) + W,
          width: G,
          sourceYs: [centerY(ri, 0)],
          destY: finalY,
          sources: [{ roundIndex: ri, matchIndex: 0 }],
          dest: { roundIndex: last, matchIndex: 0 },
        },
        {
          kind: "link",
          side: "right",
          x: rightX(ri) - G,
          width: G,
          sourceYs: [centerY(ri, 1)],
          destY: finalY,
          sources: [{ roundIndex: ri, matchIndex: 1 }],
          dest: { roundIndex: last, matchIndex: 0 },
        }
      )
      continue
    }

    const kNext = half(ri + 1)
    for (let ci = 0; ci < kNext; ci++) {
      for (const side of ["left", "right"] as const) {
        const base = side === "left" ? 0 : k
        const destBase = side === "left" ? 0 : kNext
        layout.connectors.push({
          kind: "elbow",
          side,
          x: side === "left" ? leftX(ri) + W : rightX(ri) - G,
          width: G,
          sourceYs: [centerY(ri, base + ci * 2), centerY(ri, base + ci * 2 + 1)],
          destY: centerY(ri + 1, destBase + ci),
          sources: [
            { roundIndex: ri, matchIndex: base + ci * 2 },
            { roundIndex: ri, matchIndex: base + ci * 2 + 1 },
          ],
          dest: { roundIndex: ri + 1, matchIndex: destBase + ci },
        })
      }
    }
  }

  layout.headers.push({
    roundIndex: last,
    name: rounds[last].name,
    side: "center",
    x: finalX,
    y: 0,
    width: W,
    height: headerHeight,
  })
  layout.cards.push({
    roundIndex: last,
    matchIndex: 0,
    matchId: rounds[last].matches[0].id,
    x: finalX,
    y: finalY - H / 2,
    width: W,
    height: H,
    side: "center",
  })
  return layout
}

export interface ConnectorStrand {
  /** Index into `connector.sources` this strand belongs to. */
  source: number
  /** SVG path data in layout coordinates (draw it in an svg the size of the layout). */
  d: string
}

/**
 * SVG path data for each strand of a connector. An elbow runs from each source
 * out to the mid-gap, along to the destination's midpoint, and on to the edge;
 * a link is a straight line. The two elbow strands stop 1px either side of the
 * midpoint so they read as two lines meeting.
 */
export function connectorStrands(c: Connector): ConnectorStrand[] {
  const [from, to] = c.side === "left" ? [c.x, c.x + c.width] : [c.x + c.width, c.x]
  const mid = c.x + c.width / 2
  if (c.kind === "link") return [{ source: 0, d: `M${from},${c.sourceYs[0]} H${to}` }]
  const yMid = (c.sourceYs[0] + c.sourceYs[1]) / 2
  return c.sourceYs.map((sy, i) => ({
    source: i,
    d: `M${from},${sy} H${mid} V${yMid + (i === 0 ? -1 : 1)} H${to}`,
  }))
}

export interface ConnectorState {
  /** Winner of each source match (null while undecided), parallel to `connector.sources`. */
  winners: (string | null)[]
  /** Source indices whose winner already sits in the destination match. */
  advanced: number[]
  /** Both slots of the destination are filled. */
  active: boolean
}

/** What a connector should look like right now: who won, who advanced, whether the next tie is set. */
export function connectorState(c: Connector, rounds: Round[]): ConnectorState {
  const dest = rounds[c.dest.roundIndex]?.matches[c.dest.matchIndex]
  const winners = c.sources.map((s) => {
    const m = rounds[s.roundIndex]?.matches[s.matchIndex]
    return m ? getWinnerId(m) : null
  })
  const advanced = winners.flatMap((w, i) =>
    w && (dest?.homeId === w || dest?.awayId === w) ? [i] : []
  )
  return { winners, advanced, active: !!(dest?.homeId && dest?.awayId) }
}

/**
 * Every match a participant appears in, ordered by round (including the one
 * they lost, if any). Use it to highlight one team's path on hover.
 */
export function participantPath(rounds: Round[], participantId: string): MatchRef[] {
  const path: MatchRef[] = []
  rounds.forEach((round, roundIndex) =>
    round.matches.forEach((m, matchIndex) => {
      if (m.homeId === participantId || m.awayId === participantId) {
        path.push({ roundIndex, matchIndex })
      }
    })
  )
  return path
}
