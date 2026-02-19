export type TokenRefreshPayload = {
  token?: string;
};

export type TokenRefreshAck = (response: {
  ok: boolean;
  error?: "MISSING_TOKEN" | "INVALID_TOKEN";
}) => void;

export type AuctionStatus = "IDLE" | "ACTIVE" | "PAUSED";
export type PauseReason = "MANUAL" | "ADMIN_DISCONNECTED" | null;

export type LeagueSettings = {
  timer_seconds?: number;
  timer_decay_enabled?: boolean;
  timer_decay_rules?: Array<{
    from_bid: number;
    to_bid: number;
    seconds: number;
  }>;
  min_start_bid?: number;
};

export type AuctionPlayer = {
  id: number;
  leagueId: string;
  name: string;
  teamReal: string;
  roles: string[];
  rolesMantra: string[];
  status: "AVAILABLE" | "SOLD" | "SKIPPED";
};

export type RoomMember = {
  memberId: string;
  userId: string;
  username: string;
  role: "ADMIN" | "USER";
  budgetCurrent: number;
  slotsFilled: Record<string, number>;
  connected: boolean;
  socketId: string | null;
  lastBidAt: number;
};

export type RoomState = {
  leagueId: string;
  currentPlayer: AuctionPlayer | null;
  currentBid: number;
  highestBidderMemberId: string | null;
  timerEndsAt: number | null;
  bidCount: number;
  status: AuctionStatus;
  isPaused: boolean;
  pauseReason: PauseReason;
  remainingMs: number | null;
  lastAdminPulse: number;
  adminDisconnectedEmitted: boolean;
  leagueSettings: LeagueSettings;
  adminUserId: string;
  members: Map<string, RoomMember>;
  isSelling: boolean;
};

export const BID_RATE_LIMIT_MS = 500;
export const ADMIN_PULSE_TIMEOUT_MS = 10_000;
export const ADMIN_PULSE_CHECK_INTERVAL_MS = 5_000;
export const TIMER_TICK_MS = 100;

export function getRoomName(leagueId: string): string {
  return `league_${leagueId}`;
}

export function getTimerDurationMs(
  bidCount: number,
  settings: LeagueSettings,
): number {
  const timerSeconds =
    typeof settings.timer_seconds === "number" && settings.timer_seconds > 0
      ? settings.timer_seconds
      : 15;

  if (!settings.timer_decay_enabled) {
    return timerSeconds * 1000;
  }

  const rules = Array.isArray(settings.timer_decay_rules)
    ? settings.timer_decay_rules
    : [];
  const matchedRule = rules.find(
    (rule) => bidCount >= rule.from_bid && bidCount <= rule.to_bid,
  );

  return (matchedRule?.seconds ?? timerSeconds) * 1000;
}
