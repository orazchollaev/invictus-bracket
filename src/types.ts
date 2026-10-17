/** Anything that can be placed in a bracket. Extra fields are preserved by the generic helpers. */
export interface Participant {
  id: string
  /** Strength used to seed. Higher is better. Override with the `rank` option. */
  power?: number
}

export type LegMode = "single" | "double" | "triple" | "quadruple" | "half"

/** Named knockout stages, keyed by distance from the final (1 = semifinal, 5+ = r64). */
export type KnockoutStage = "r64" | "r32" | "r16" | "quarterfinal" | "semifinal"

export interface MatchResult {
  home: number
  away: number
  penHome?: number
  penAway?: number
}

export interface Match {
  id: string
  homeId: string | null
  awayId: string | null
  result: MatchResult | null
  /** undefined = single leg, null = two-leg tie with leg 2 not played, object = played. */
  leg2Result?: MatchResult | null
}

export interface Round {
  name: string
  matches: Match[]
}

/** Leg configuration read by `applyLegModes` / `resolveRoundLegMode`. */
export interface LegConfig {
  /** Default for every round that has no entry in `roundLegModes`. */
  knockoutLegMode?: LegMode
  roundLegModes?: Partial<Record<KnockoutStage, LegMode>>
  finalLegMode?: LegMode
}
