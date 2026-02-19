import { z } from "zod";

export const LEAGUE_MODE_VALUES = ["CLASSIC", "MANTRA"] as const;
export const ACCESS_TYPE_VALUES = ["OPEN", "PASSWORD", "APPROVAL"] as const;

const timerDecayRuleSchema = z.object({
  from_bid: z.number().int().min(1),
  to_bid: z.number().int().min(1),
  seconds: z.number().int().min(1),
});

const baseSettingsSchema = z.object({
  budget_type: z.enum(["FIXED", "CUSTOM"]).optional(),
  base_budget: z.number().int().min(1).optional(),
  timer_seconds: z.number().int().min(1).optional(),
  timer_decay_enabled: z.boolean().optional(),
  timer_decay_rules: z.array(timerDecayRuleSchema).optional(),
  min_start_bid: z.number().int().min(1).optional(),
});

const classicRosterLimitsSchema = z.object({
  P: z.number().int().min(0),
  D: z.number().int().min(0),
  C: z.number().int().min(0),
  A: z.number().int().min(0),
});

const mantraRosterLimitsSchema = z.object({
  Por: z.number().int().min(0),
  Ds: z.number().int().min(0),
  Dd: z.number().int().min(0),
  Dc: z.number().int().min(0),
  E: z.number().int().min(0),
  M: z.number().int().min(0),
  C: z.number().int().min(0),
  W: z.number().int().min(0),
  T: z.number().int().min(0),
  A: z.number().int().min(0),
  Pc: z.number().int().min(0),
});

export const createLeagueBodySchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    mode: z.enum(LEAGUE_MODE_VALUES).default("CLASSIC"),
    access_type: z.enum(ACCESS_TYPE_VALUES).default("OPEN"),
    password: z.string().min(4).max(72).optional(),
    max_members: z.number().int().min(2).max(20).optional(),
    settings: z
      .object({
        ...baseSettingsSchema.shape,
        roster_limits: z
          .union([classicRosterLimitsSchema, mantraRosterLimitsSchema])
          .optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.access_type === "PASSWORD" && !value.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password is required when access_type is PASSWORD",
      });
    }
  });

export const leagueIdParamsSchema = z.object({
  id: z.uuid(),
});

export const leagueMemberParamsSchema = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
});

const settingsPatchSchema = z
  .object({
    ...baseSettingsSchema.shape,
    roster_limits: z
      .union([classicRosterLimitsSchema, mantraRosterLimitsSchema])
      .optional(),
  })
  .strict();

export const updateLeagueSettingsBodySchema = z
  .object({
    settings: settingsPatchSchema,
  })
  .strict();

export const joinLeagueBodySchema = z
  .object({
    password: z.string().min(4).max(72).optional(),
  })
  .strict();
