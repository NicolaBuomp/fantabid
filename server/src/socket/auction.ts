import { Server, Socket } from "socket.io";
import { supabaseAdmin } from "../config/supabase";
import { AuthUser, verifySupabaseJwt } from "../lib/jwt";
import { buildBidErrorMessage, processBid } from "./auction/bidding";
import {
  extractErrorCode,
  handlePlayerSold,
  logAuctionAction,
} from "./auction/lifecycle";
import {
  activeRooms,
  clearCurrentAuction,
  destroyRoom,
  getMemberByUserId,
  getRoomState,
  hasConnectedMembers,
  initRoom,
  isAdminMember,
  serializeRoomMember,
  syncMembersFromDb,
  updateMemberConnection,
} from "./auction/state";
import {
  ADMIN_PULSE_CHECK_INTERVAL_MS,
  ADMIN_PULSE_TIMEOUT_MS,
  AuctionPlayer,
  getRoomName,
  getTimerDurationMs,
  TIMER_TICK_MS,
  TokenRefreshAck,
  TokenRefreshPayload,
} from "./auction/types";

interface AuthenticatedSocket extends Socket {
  data: {
    user: AuthUser;
    leagueId?: string;
    memberId?: string;
  };
}

export function registerAuctionSocket(io: Server) {
  const auctionNamespace = io.of("/auction");

  auctionNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (typeof token !== "string" || !token) {
      return next(new Error("MISSING_TOKEN"));
    }

    try {
      socket.data.user = verifySupabaseJwt(token);
      return next();
    } catch {
      return next(new Error("INVALID_TOKEN"));
    }
  });

  setInterval(() => {
    const now = Date.now();

    for (const state of activeRooms.values()) {
      if (state.status !== "ACTIVE" || state.isPaused || !state.timerEndsAt) {
        continue;
      }

      if (now >= state.timerEndsAt) {
        void handlePlayerSold(auctionNamespace, state);
      }
    }
  }, TIMER_TICK_MS);

  setInterval(() => {
    const now = Date.now();

    for (const state of activeRooms.values()) {
      if (state.status !== "ACTIVE" || state.isPaused) {
        continue;
      }

      if (now - state.lastAdminPulse <= ADMIN_PULSE_TIMEOUT_MS) {
        continue;
      }

      state.isPaused = true;
      state.status = "PAUSED";
      state.pauseReason = "ADMIN_DISCONNECTED";
      state.remainingMs = state.timerEndsAt
        ? Math.max(0, state.timerEndsAt - now)
        : null;
      state.timerEndsAt = null;

      if (!state.adminDisconnectedEmitted) {
        state.adminDisconnectedEmitted = true;
        auctionNamespace
          .to(getRoomName(state.leagueId))
          .emit("admin_disconnected", {});
      }

      auctionNamespace
        .to(getRoomName(state.leagueId))
        .emit("auction_paused", {});
    }
  }, ADMIN_PULSE_CHECK_INTERVAL_MS);

  auctionNamespace.on("connection", (socket: AuthenticatedSocket) => {
    const user = socket.data.user;

    socket.on(
      "token_refresh",
      (payload: TokenRefreshPayload, ack?: TokenRefreshAck) => {
        if (!payload?.token) {
          ack?.({ ok: false, error: "MISSING_TOKEN" });
          return;
        }

        try {
          socket.data.user = verifySupabaseJwt(payload.token);
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: "INVALID_TOKEN" });
          socket.emit("auth_error", { error: "INVALID_TOKEN" });
        }
      },
    );

    socket.on("join_room", async (data: { leagueId?: string }) => {
      const leagueId = data?.leagueId;
      if (!leagueId) {
        socket.emit("join_error", { error: "MISSING_LEAGUE_ID" });
        return;
      }

      try {
        const state = await initRoom(leagueId);
        const member = getMemberByUserId(state, user.id);

        if (!member) {
          socket.emit("join_error", { error: "FORBIDDEN_MEMBER_REQUIRED" });
          return;
        }

        const previousLeagueId = socket.data.leagueId;
        const previousMemberId = socket.data.memberId;
        if (
          previousLeagueId &&
          previousMemberId &&
          previousLeagueId !== leagueId &&
          activeRooms.has(previousLeagueId)
        ) {
          const previousState = activeRooms.get(previousLeagueId)!;
          updateMemberConnection(previousState, previousMemberId, false, null);
          socket.leave(getRoomName(previousLeagueId));

          if (!hasConnectedMembers(previousState)) {
            destroyRoom(previousLeagueId);
          }
        }

        const roomName = getRoomName(leagueId);
        socket.join(roomName);
        socket.data.leagueId = leagueId;
        socket.data.memberId = member.memberId;

        updateMemberConnection(state, member.memberId, true, socket.id);

        if (isAdminMember(member)) {
          state.lastAdminPulse = Date.now();
          if (state.adminDisconnectedEmitted) {
            state.adminDisconnectedEmitted = false;
            auctionNamespace.to(roomName).emit("admin_reconnected", {});
          }
        }

        socket.emit("auction_state", getRoomState(state));
        socket.emit("server_time", { timestamp: Date.now() });
        socket.to(roomName).emit("member_connected", {
          memberId: member.memberId,
          username: member.username,
        });
      } catch (error) {
        socket.emit("join_error", {
          error: "JOIN_FAILED",
          detail: extractErrorCode(error),
        });
      }
    });

    socket.on("admin_start_player", async (data: { playerId?: number }) => {
      const leagueId = socket.data.leagueId;
      const memberId = socket.data.memberId;

      if (!leagueId || !memberId) {
        socket.emit("admin_error", { code: "ROOM_NOT_JOINED" });
        return;
      }

      const state = activeRooms.get(leagueId);
      const actorMember = state?.members.get(memberId);
      if (!state || !actorMember) {
        socket.emit("admin_error", { code: "ROOM_NOT_FOUND" });
        return;
      }

      if (!isAdminMember(actorMember)) {
        socket.emit("admin_error", { code: "FORBIDDEN_ADMIN_ONLY" });
        return;
      }

      if (state.status !== "IDLE") {
        socket.emit("admin_error", { code: "AUCTION_NOT_IDLE" });
        return;
      }

      if (typeof data?.playerId !== "number") {
        socket.emit("admin_error", { code: "PLAYER_ID_REQUIRED" });
        return;
      }

      const { data: playerRow, error: playerError } = await supabaseAdmin
        .from("players")
        .select("id, league_id, name, team_real, roles, roles_mantra, status")
        .eq("league_id", leagueId)
        .eq("id", data.playerId)
        .in("status", ["AVAILABLE", "SKIPPED"])
        .maybeSingle();

      if (playerError) {
        socket.emit("admin_error", { code: "PLAYER_LOAD_FAILED" });
        return;
      }

      if (!playerRow) {
        socket.emit("admin_error", { code: "PLAYER_NOT_AVAILABLE" });
        return;
      }

      const currentPlayer: AuctionPlayer = {
        id: playerRow.id,
        leagueId: playerRow.league_id,
        name: playerRow.name,
        teamReal: playerRow.team_real,
        roles: Array.isArray(playerRow.roles) ? playerRow.roles : [],
        rolesMantra: Array.isArray(playerRow.roles_mantra)
          ? playerRow.roles_mantra
          : [],
        status: playerRow.status,
      };

      state.currentPlayer = currentPlayer;
      state.currentBid =
        typeof state.leagueSettings.min_start_bid === "number" &&
        state.leagueSettings.min_start_bid > 0
          ? state.leagueSettings.min_start_bid
          : 1;
      state.highestBidderMemberId = null;
      state.bidCount = 0;
      state.isPaused = false;
      state.pauseReason = null;
      state.remainingMs = null;
      state.status = "ACTIVE";
      state.timerEndsAt =
        Date.now() + getTimerDurationMs(0, state.leagueSettings);

      void logAuctionAction({
        leagueId,
        action: "START_PLAYER",
        actorId: user.id,
        playerId: currentPlayer.id,
        payload: {
          player_name: currentPlayer.name,
          player_id: currentPlayer.id,
          min_bid: state.currentBid,
        },
      });

      auctionNamespace.to(getRoomName(leagueId)).emit("new_player_on_auction", {
        player: currentPlayer,
        timerEndsAt: state.timerEndsAt,
        minBid: state.currentBid,
      });
    });

    socket.on("admin_pause", async () => {
      const leagueId = socket.data.leagueId;
      const memberId = socket.data.memberId;

      if (!leagueId || !memberId) {
        socket.emit("admin_error", { code: "ROOM_NOT_JOINED" });
        return;
      }

      const state = activeRooms.get(leagueId);
      const actorMember = state?.members.get(memberId);

      if (!state || !actorMember || !isAdminMember(actorMember)) {
        socket.emit("admin_error", { code: "FORBIDDEN_ADMIN_ONLY" });
        return;
      }

      if (state.status !== "ACTIVE" || state.isPaused || !state.timerEndsAt) {
        socket.emit("admin_error", { code: "AUCTION_NOT_ACTIVE" });
        return;
      }

      state.remainingMs = Math.max(0, state.timerEndsAt - Date.now());
      state.isPaused = true;
      state.status = "PAUSED";
      state.pauseReason = "MANUAL";
      state.timerEndsAt = null;

      await logAuctionAction({
        leagueId,
        action: "PAUSE",
        actorId: user.id,
        playerId: state.currentPlayer?.id ?? null,
        payload: { reason: "admin_manual" },
      });

      auctionNamespace.to(getRoomName(leagueId)).emit("auction_paused", {});
    });

    socket.on("admin_resume", async () => {
      const leagueId = socket.data.leagueId;
      const memberId = socket.data.memberId;

      if (!leagueId || !memberId) {
        socket.emit("admin_error", { code: "ROOM_NOT_JOINED" });
        return;
      }

      const state = activeRooms.get(leagueId);
      const actorMember = state?.members.get(memberId);

      if (!state || !actorMember || !isAdminMember(actorMember)) {
        socket.emit("admin_error", { code: "FORBIDDEN_ADMIN_ONLY" });
        return;
      }

      if (!state.isPaused || !state.currentPlayer) {
        socket.emit("admin_error", { code: "AUCTION_NOT_PAUSED" });
        return;
      }

      state.timerEndsAt =
        Date.now() +
        (state.remainingMs ??
          getTimerDurationMs(state.bidCount, state.leagueSettings));
      state.remainingMs = null;
      state.isPaused = false;
      state.status = "ACTIVE";
      state.pauseReason = null;

      await logAuctionAction({
        leagueId,
        action: "RESUME",
        actorId: user.id,
        playerId: state.currentPlayer.id,
        payload: { reason: "admin_manual" },
      });

      auctionNamespace.to(getRoomName(leagueId)).emit("auction_resumed", {
        newTimerEndsAt: state.timerEndsAt,
      });
    });

    socket.on("admin_skip", async () => {
      const leagueId = socket.data.leagueId;
      const memberId = socket.data.memberId;

      if (!leagueId || !memberId) {
        socket.emit("admin_error", { code: "ROOM_NOT_JOINED" });
        return;
      }

      const state = activeRooms.get(leagueId);
      const actorMember = state?.members.get(memberId);

      if (!state || !actorMember || !isAdminMember(actorMember)) {
        socket.emit("admin_error", { code: "FORBIDDEN_ADMIN_ONLY" });
        return;
      }

      if (!state.currentPlayer) {
        socket.emit("admin_error", { code: "NO_ACTIVE_PLAYER" });
        return;
      }

      const skippedPlayer = state.currentPlayer;

      const { error: skipError } = await supabaseAdmin
        .from("players")
        .update({
          status: "SKIPPED",
          sold_to: null,
          sold_price: null,
          sold_at: null,
        })
        .eq("league_id", leagueId)
        .eq("id", skippedPlayer.id);

      if (skipError) {
        socket.emit("admin_error", { code: "SKIP_FAILED" });
        return;
      }

      await logAuctionAction({
        leagueId,
        action: "SKIP",
        actorId: user.id,
        playerId: skippedPlayer.id,
        payload: {
          player_name: skippedPlayer.name,
          reason: "admin_skip",
        },
      });

      clearCurrentAuction(state);
      auctionNamespace.to(getRoomName(leagueId)).emit("player_skipped", {
        player: skippedPlayer,
      });
    });

    socket.on("admin_rollback", async () => {
      const leagueId = socket.data.leagueId;
      const memberId = socket.data.memberId;

      if (!leagueId || !memberId) {
        socket.emit("admin_error", { code: "ROOM_NOT_JOINED" });
        return;
      }

      const state = activeRooms.get(leagueId);
      const actorMember = state?.members.get(memberId);

      if (!state || !actorMember || !isAdminMember(actorMember)) {
        socket.emit("admin_error", { code: "FORBIDDEN_ADMIN_ONLY" });
        return;
      }

      const { data: rollbackData, error: rollbackError } =
        await supabaseAdmin.rpc("rollback_last_sale", {
          p_league_id: leagueId,
          p_actor_id: user.id,
        });

      if (rollbackError) {
        socket.emit("admin_error", {
          code: "ROLLBACK_FAILED",
          detail: rollbackError.message,
        });
        return;
      }

      const success =
        rollbackData &&
        typeof rollbackData === "object" &&
        "success" in rollbackData
          ? Boolean((rollbackData as Record<string, unknown>).success)
          : false;

      if (!success) {
        socket.emit("admin_error", { code: "NO_SALE_TO_ROLLBACK" });
        return;
      }

      try {
        await syncMembersFromDb(state);
      } catch (error) {
        socket.emit("admin_error", {
          code: "ROLLBACK_SYNC_FAILED",
          detail: extractErrorCode(error),
        });
        return;
      }

      const restoredPlayerId =
        rollbackData &&
        typeof rollbackData === "object" &&
        "restored_player_id" in rollbackData
          ? Number((rollbackData as Record<string, unknown>).restored_player_id)
          : null;

      auctionNamespace.to(getRoomName(leagueId)).emit("rollback_executed", {
        restoredPlayerId,
        members: Array.from(state.members.values()).map(serializeRoomMember),
      });
    });

    socket.on("place_bid", (data: { amount?: number; leagueId?: string }) => {
      console.log("[place_bid] Received bid event:", {
        data,
        leagueId: socket.data.leagueId,
        memberId: socket.data.memberId,
      });

      const leagueId = socket.data.leagueId ?? data?.leagueId;
      const memberId = socket.data.memberId;

      if (!leagueId || !memberId || typeof data?.amount !== "number") {
        console.log("[place_bid] Invalid payload:", {
          leagueId,
          memberId,
          amount: data?.amount,
        });
        socket.emit("bid_error", {
          code: "INVALID_BID_PAYLOAD",
          message: "Invalid bid payload.",
        });
        return;
      }

      const bidResult = processBid(leagueId, memberId, data.amount);
      console.log("[place_bid] processBid result:", {
        ok: bidResult.ok,
        code: bidResult.code,
      });

      if (!bidResult.ok) {
        socket.emit("bid_error", {
          code: bidResult.code,
          message: buildBidErrorMessage(bidResult.code),
        });
        return;
      }

      void logAuctionAction({
        leagueId,
        action: "BID",
        actorId: user.id,
        playerId: activeRooms.get(leagueId)?.currentPlayer?.id ?? null,
        payload: {
          amount: bidResult.amount,
          bidder_member_id: bidResult.bidderMemberId,
          bid_count: bidResult.bidCount,
        },
      });

      auctionNamespace.to(getRoomName(leagueId)).emit("bid_update", {
        amount: bidResult.amount,
        bidderMemberId: bidResult.bidderMemberId,
        bidderName: bidResult.bidderName,
        newTimerEndsAt: bidResult.newTimerEndsAt,
        bidCount: bidResult.bidCount,
      });
    });

    socket.on("admin_pulse", async () => {
      const leagueId = socket.data.leagueId;
      const memberId = socket.data.memberId;

      if (!leagueId || !memberId) {
        return;
      }

      const state = activeRooms.get(leagueId);
      const actorMember = state?.members.get(memberId);
      if (!state || !actorMember || !isAdminMember(actorMember)) {
        return;
      }

      state.lastAdminPulse = Date.now();

      if (state.adminDisconnectedEmitted) {
        state.adminDisconnectedEmitted = false;
        auctionNamespace
          .to(getRoomName(leagueId))
          .emit("admin_reconnected", {});
      }

      // Handle resuming from admin disconnect pause
      if (
        state.isPaused &&
        state.pauseReason === "ADMIN_DISCONNECTED" &&
        state.currentPlayer
      ) {
        state.timerEndsAt =
          Date.now() +
          (state.remainingMs ??
            getTimerDurationMs(state.bidCount, state.leagueSettings));
        state.remainingMs = null;
        state.isPaused = false;
        state.status = "ACTIVE";
        state.pauseReason = null;

        auctionNamespace.to(getRoomName(leagueId)).emit("auction_resumed", {
          newTimerEndsAt: state.timerEndsAt,
        });
        return;
      }

      // Handle starting first player when idle
      if (state.status === "IDLE") {
        try {
          const { data: playerRow, error: playerError } = await supabaseAdmin
            .from("players")
            .select(
              "id, league_id, name, team_real, roles, roles_mantra, status",
            )
            .eq("league_id", leagueId)
            .in("status", ["AVAILABLE", "SKIPPED"])
            .order("id", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (playerError) {
            console.error(
              "[admin_pulse] Load first player failed:",
              playerError,
            );
            return;
          }

          if (!playerRow) {
            console.log("[admin_pulse] No available players found");
            return;
          }

          const currentPlayer: AuctionPlayer = {
            id: playerRow.id,
            leagueId: playerRow.league_id,
            name: playerRow.name,
            teamReal: playerRow.team_real,
            roles: Array.isArray(playerRow.roles) ? playerRow.roles : [],
            rolesMantra: Array.isArray(playerRow.roles_mantra)
              ? playerRow.roles_mantra
              : [],
          };

          state.currentPlayer = currentPlayer;
          state.currentBid =
            typeof state.leagueSettings.min_start_bid === "number" &&
            state.leagueSettings.min_start_bid > 0
              ? state.leagueSettings.min_start_bid
              : 1;
          state.highestBidderMemberId = null;
          state.bidCount = 0;
          state.isPaused = false;
          state.pauseReason = null;
          state.remainingMs = null;
          state.status = "ACTIVE";
          state.timerEndsAt =
            Date.now() + getTimerDurationMs(0, state.leagueSettings);

          void logAuctionAction({
            leagueId,
            action: "START_PLAYER",
            actorId: socket.data.user.id,
            playerId: currentPlayer.id,
            payload: {
              player_name: currentPlayer.name,
              player_id: currentPlayer.id,
              min_bid: state.currentBid,
            },
          });

          auctionNamespace
            .to(getRoomName(leagueId))
            .emit("new_player_on_auction", {
              player: currentPlayer,
              timerEndsAt: state.timerEndsAt,
            });

          auctionNamespace
            .to(getRoomName(leagueId))
            .emit("auction_state", getRoomState(state));
        } catch (error) {
          console.error("[admin_pulse] Error starting first player:", error);
        }
      }
    });

    socket.on("disconnect", () => {
      const leagueId = socket.data.leagueId;
      const memberId = socket.data.memberId;

      if (!leagueId || !memberId) {
        return;
      }

      const state = activeRooms.get(leagueId);
      if (!state) {
        return;
      }

      const member = state.members.get(memberId);
      if (!member) {
        return;
      }

      updateMemberConnection(state, memberId, false, null);

      auctionNamespace.to(getRoomName(leagueId)).emit("member_disconnected", {
        memberId,
        username: member.username,
      });

      if (!hasConnectedMembers(state)) {
        destroyRoom(leagueId);
      }
    });
  });
}
