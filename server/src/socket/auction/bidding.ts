import { activeRooms } from "./state";
import { BID_RATE_LIMIT_MS, getTimerDurationMs } from "./types";

export type BidErrorCode =
  | "ROOM_NOT_FOUND"
  | "MEMBER_NOT_FOUND"
  | "NOT_ACTIVE"
  | "PAUSED"
  | "EXPIRED"
  | "TOO_LOW"
  | "INSUFFICIENT_BUDGET"
  | "RATE_LIMITED";

export function buildBidErrorMessage(code: BidErrorCode): string {
  switch (code) {
    case "ROOM_NOT_FOUND":
      return "Room not found.";
    case "MEMBER_NOT_FOUND":
      return "Member not found in room.";
    case "NOT_ACTIVE":
      return "Auction is not active.";
    case "PAUSED":
      return "Auction is paused.";
    case "EXPIRED":
      return "Auction timer already expired.";
    case "TOO_LOW":
      return "Bid must be greater than current bid.";
    case "INSUFFICIENT_BUDGET":
      return "Insufficient budget.";
    case "RATE_LIMITED":
      return "Too many bids. Try again in a moment.";
    default:
      return "Bid rejected.";
  }
}

export type ProcessBidResult =
  | {
      ok: false;
      code: BidErrorCode;
    }
  | {
      ok: true;
      amount: number;
      bidderMemberId: string;
      bidderName: string;
      newTimerEndsAt: number;
      bidCount: number;
    };

export function processBid(
  leagueId: string,
  memberId: string,
  amount: number,
): ProcessBidResult {
  const state = activeRooms.get(leagueId);
  if (!state) {
    return { ok: false, code: "ROOM_NOT_FOUND" };
  }

  const member = state.members.get(memberId);
  if (!member) {
    return { ok: false, code: "MEMBER_NOT_FOUND" };
  }

  const now = Date.now();

  console.log("[processBid] Validating bid:", {
    amount,
    currentBid: state.currentBid,
    status: state.status,
    isPaused: state.isPaused,
    timerEndsAt: state.timerEndsAt,
    hasCurrentPlayer: !!state.currentPlayer,
    budget: member.budgetCurrent,
  });

  if (state.status !== "ACTIVE" || !state.currentPlayer) {
    console.log(
      "[processBid] NOT_ACTIVE - status:",
      state.status,
      "currentPlayer:",
      !!state.currentPlayer,
    );
    return { ok: false, code: "NOT_ACTIVE" };
  }

  if (state.isPaused) {
    return { ok: false, code: "PAUSED" };
  }

  if (!state.timerEndsAt || now >= state.timerEndsAt) {
    return { ok: false, code: "EXPIRED" };
  }

  if (
    !Number.isFinite(amount) ||
    !Number.isInteger(amount) ||
    amount <= state.currentBid
  ) {
    console.log(
      "[processBid] TOO_LOW - amount:",
      amount,
      "currentBid:",
      state.currentBid,
    );
    return { ok: false, code: "TOO_LOW" };
  }

  if (amount > member.budgetCurrent) {
    return { ok: false, code: "INSUFFICIENT_BUDGET" };
  }

  if (now - member.lastBidAt < BID_RATE_LIMIT_MS) {
    return { ok: false, code: "RATE_LIMITED" };
  }

  state.currentBid = amount;
  state.highestBidderMemberId = memberId;
  state.bidCount += 1;
  state.timerEndsAt =
    now + getTimerDurationMs(state.bidCount, state.leagueSettings);
  member.lastBidAt = now;

  return {
    ok: true,
    amount,
    bidderMemberId: memberId,
    bidderName: member.username,
    newTimerEndsAt: state.timerEndsAt,
    bidCount: state.bidCount,
  };
}
