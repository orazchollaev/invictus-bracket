# invictus-bracket

Headless single-elimination bracket engine plus layout geometry. No framework, no
dependencies, no styles: it gives you the rounds and the coordinates, you draw them
however you like (DOM, SVG, canvas, native).

Extracted from Invictus Tournament Maker.

```bash
npm install invictus-bracket
```

## Engine

```ts
import { buildPureBracket, applyLegModes, propagateWinners, getWinnerId, makeRng } from "invictus-bracket"

const teams = [
  { id: "a", power: 90 },
  { id: "b", power: 80 },
  { id: "c", power: 70 },
  { id: "d", power: 60 },
  { id: "e", power: 50 },
]

// 5 teams → bracket of 8, the 3 strongest get byes (auto-resolved walkovers)
const rounds = buildPureBracket(teams, { seeded: true, rng: makeRng(42) })

// optional: make the quarter-finals two-legged
applyLegModes(rounds, { roundLegModes: { quarterfinal: "double" } })

// enter a result, then push winners forward
rounds[0].matches[1].result = { home: 2, away: 1 }
propagateWinners(rounds)
```

A `Match` is plain data, so store it however you want:

```ts
interface Match {
  id: string
  homeId: string | null
  awayId: string | null
  result: { home: number; away: number; penHome?: number; penAway?: number } | null
  leg2Result?: MatchResult | null // undefined = single leg, null = leg 2 not played yet
}
```

`getWinnerId` handles single-leg ties (score, then penalties) and two-leg ties
(aggregate, then leg-2 penalties). `getLoserId` is its mirror.

### `buildPureBracket(teams, options?)`

| option         | default                | meaning                                                                       |
| -------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `seeded`       | `false`                | Best teams get byes; the rest are split into two pots so strong meets weak.   |
| `orderedTeams` | -                      | A drawn order, byes first then home/away pairs. Overrides `seeded`.           |
| `rank`         | `t.power ?? 50`        | Strength function used when `seeded`.                                         |
| `rng`          | `Math.random`          | Pass `makeRng(seed)` for a reproducible bracket.                              |
| `roundName`    | Final / Semi-Finals …  | `(matchCount) => string`, for localised or custom round titles.               |

Any team count of 2 or more works; byes pad up to the next power of two and are
spread across the tree so they never meet early.

Lower-level building blocks are exported too: `buildBracketRounds`,
`buildEmptyBracketRounds`, `bracketOrder`, `spreadByeSlots`, `seedPairOrder`,
`packDirectSlots`, `stageForDistance`, `resolveRoundLegMode`.

## Layout (the customisable UI part)

`computeBracketLayout` turns rounds into pixel positions. Everything is configurable
and nothing is rendered.

```ts
import { computeBracketLayout, connectorStrands, connectorState } from "invictus-bracket"
// or: import { ... } from "invictus-bracket/layout"

const layout = computeBracketLayout(rounds, {
  mode: "classic", // or "double-sided": two halves converging on a centred final
  cardWidth: 190,
  cardHeight: 58,
  cardGap: 20,
  columnGap: 32,
  headerHeight: 28,
})

layout.width, layout.height // size of the canvas
layout.cards // { matchId, roundIndex, matchIndex, x, y, width, height, side }[]
layout.headers // { name, roundIndex, x, y, width, height, side }[]
layout.connectors // elbow / link descriptors between rounds
```

Render the cards with whatever you like, looking each match up by `matchId` or
`rounds[roundIndex].matches[matchIndex]`:

```tsx
<div style={{ position: "relative", width: layout.width, height: layout.height }}>
  {layout.cards.map((c) => (
    <MyMatchCard key={c.matchId} match={rounds[c.roundIndex].matches[c.matchIndex]}
      style={{ position: "absolute", left: c.x, top: c.y, width: c.width, height: c.height }} />
  ))}

  <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0 }}>
    {layout.connectors.flatMap((c, i) => {
      const state = connectorState(c, rounds) // winners, advanced sources, active
      return connectorStrands(c).map((s) => (
        <path key={`${i}-${s.source}`} d={s.d} fill="none"
          stroke={state.active ? "currentColor" : "#888"}
          strokeOpacity={state.advanced.includes(s.source) ? 1 : 0.4} />
      ))
    })}
  </svg>
</div>
```

`connectorState` and `participantPath(rounds, id)` give you what you need for winner
colouring and hover-to-highlight a team's route. Colours, fonts, animation and card
content are entirely yours.

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## License

MIT
