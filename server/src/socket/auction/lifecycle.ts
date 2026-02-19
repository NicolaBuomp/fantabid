import { PostgrestError } from "@supabase/supabase-js";
import { Server } from "socket.io";
import { supabaseAdmin } from "../../config/supabase";
import { clearCurrentAuction } from "./state";
import { getRoomName, RoomState } from "./types";

export function extractErrorCode(error: unknown): string {
  const pgError = error as PostgrestError;
  return pgError?.message ?? "UNKNOWN_ERROR";
}

export async function logAuctionAction(args: {
  leagueId: string;
  action:
    | "BID"
    | "SOLD"
    | "SKIP"
    | "ROLLBACK"
    | "PAUSE"
    | "RESUME"
    | "START_PLAYER";
  actorId: string;
  playerId?: number | null;
  payload?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("auction_logs").insert({
    league_id: args.leagueId,
    action: args.action,
    actor_id: args.actorId,
    player_id: args.playerId ?? null,
    payload: args.payload ?? {},
  });
}

async function handleNoBidExpiration(
  auctionNamespace: ReturnType<Server["of"]>,
  state: RoomState,
) {
  const player = state.currentPlayer;
  if (!player) {
    clearCurrentAuction(state);
    return;
  }

  await supabaseAdmin
    .from("players")
    .update({ status: "SKIPPED" })
    .eq("id", player.id)
    .eq("league_id", state.leagueId);

  await logAuctionAction({
    leagueId: state.leagueId,
    action: "SKIP",
    actorId: state.adminUserId,
    playerId: player.id,
    payload: {
      player_name: player.name,
      reason: "no_bids",
    },
  });

  clearCurrentAuction(state);
  auctionNamespace
    .to(getRoomName(state.leagueId))
    .emit("player_skipped", { player });
}

export async function handlePlayerSold(
  auctionNamespace: ReturnType<Server["of"]>,
  state: RoomState,
) {
  if (state.isSelling) {
    return;
  }

  state.isSelling = true;

  try {
    if (!state.currentPlayer || !state.highestBidderMemberId) {
      await handleNoBidExpiration(auctionNamespace, state);
      return;
    }

    const winner = state.members.get(state.highestBidderMemberId);
    if (!winner) {
      await handleNoBidExpiration(auctionNamespace, state);
      return;
    }

    const primaryRole =
      state.currentPlayer.roles[0] ?? state.currentPlayer.rolesMantra[0] ?? "A";

    const { data: soldResult, error: soldError } = await supabaseAdmin.rpc(
      "sell_player",
      {
        p_player_id: state.currentPlayer.id,
        p_winner_member_id: winner.memberId,
        p_price: state.currentBid,
        p_league_id: state.leagueId,
        p_actor_id: state.adminUserId,
        p_player_role: primaryRole,
      },
    );

    if (soldError) {
      throw soldError;
    }

    const newBudget =
      soldResult && typeof soldResult === "object" && "new_budget" in soldResult
        ? Number((soldResult as Record<string, unknown>).new_budget)
        : winner.budgetCurrent - state.currentBid;

    winner.budgetCurrent = Number.isFinite(newBudget)
      ? newBudget
      : winner.budgetCurrent - state.currentBid;
    winner.slotsFilled = {
      ...winner.slotsFilled,
      [primaryRole]: (winner.slotsFilled[primaryRole] ?? 0) + 1,
    };

    const soldPlayer = state.currentPlayer;
    const soldPrice = state.currentBid;
    const winnerMemberId = winner.memberId;
    const winnerName = winner.username;

    clearCurrentAuction(state);

    auctionNamespace.to(getRoomName(state.leagueId)).emit("player_sold", {
      player: soldPlayer,
      winnerMemberId,
      winnerName,
      price: soldPrice,
    });
  } catch {
    state.isPaused = true;
    state.status = "PAUSED";
    state.pauseReason = "MANUAL";
    state.remainingMs = null;
    state.timerEndsAt = null;
    auctionNamespace.to(getRoomName(state.leagueId)).emit("auction_paused", {});
  } finally {
    state.isSelling = false;
  }
}
