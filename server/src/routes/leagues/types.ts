import { LEAGUE_MODE_VALUES } from "./schemas";

export type LeagueMode = (typeof LEAGUE_MODE_VALUES)[number];

export type LeagueSettings = {
  budget_type: "FIXED" | "CUSTOM";
  base_budget: number;
  timer_seconds: number;
  timer_decay_enabled: boolean;
  timer_decay_rules: Array<{
    from_bid: number;
    to_bid: number;
    seconds: number;
  }>;
  roster_limits: Record<string, number>;
  min_start_bid: number;
};

export function getDefaultSettings(mode: LeagueMode): LeagueSettings {
  if (mode === "MANTRA") {
    return {
      budget_type: "FIXED",
      base_budget: 500,
      timer_seconds: 15,
      timer_decay_enabled: true,
      timer_decay_rules: [
        { from_bid: 1, to_bid: 3, seconds: 15 },
        { from_bid: 4, to_bid: 8, seconds: 10 },
        { from_bid: 9, to_bid: 15, seconds: 7 },
        { from_bid: 16, to_bid: 999, seconds: 5 },
      ],
      roster_limits: {
        Por: 3,
        Ds: 4,
        Dd: 4,
        Dc: 4,
        E: 4,
        M: 4,
        C: 4,
        W: 4,
        T: 4,
        A: 4,
        Pc: 4,
      },
      min_start_bid: 1,
    };
  }

  return {
    budget_type: "FIXED",
    base_budget: 500,
    timer_seconds: 15,
    timer_decay_enabled: true,
    timer_decay_rules: [
      { from_bid: 1, to_bid: 3, seconds: 15 },
      { from_bid: 4, to_bid: 8, seconds: 10 },
      { from_bid: 9, to_bid: 15, seconds: 7 },
      { from_bid: 16, to_bid: 999, seconds: 5 },
    ],
    roster_limits: {
      P: 3,
      D: 8,
      C: 8,
      A: 6,
    },
    min_start_bid: 1,
  };
}
