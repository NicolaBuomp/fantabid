import { supabaseAdmin } from "../../config/supabase";
import { LeagueSettings, RoomMember, RoomState } from "./types";

export const activeRooms = new Map<string, RoomState>();

function normalizeSlotsFilled(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const normalized: Record<string, number> = {};

  for (const [role, amount] of entries) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric < 0) {
      normalized[role] = 0;
      continue;
    }
    normalized[role] = Math.floor(numeric);
  }

  return normalized;
}

export function clearCurrentAuction(state: RoomState) {
  state.currentPlayer = null;
  state.currentBid = 0;
  state.highestBidderMemberId = null;
  state.timerEndsAt = null;
  state.bidCount = 0;
  state.isPaused = false;
  state.pauseReason = null;
  state.remainingMs = null;
  state.status = "IDLE";
}

export async function syncMembersFromDb(state: RoomState): Promise<void> {
  const { data: membersRows, error: membersError } = await supabaseAdmin
    .from("league_members")
    .select("id, user_id, role, status, budget_current, slots_filled")
    .eq("league_id", state.leagueId)
    .eq("status", "APPROVED");

  if (membersError || !membersRows) {
    throw membersError ?? new Error("FAILED_TO_SYNC_MEMBERS");
  }

  const userIds = membersRows.map((member) => member.user_id);
  const { data: profilesRows, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, username")
    .in("id", userIds);

  if (profilesError || !profilesRows) {
    throw profilesError ?? new Error("FAILED_TO_SYNC_PROFILES");
  }

  const usernames = new Map<string, string>(
    profilesRows.map((profile) => [profile.id, profile.username]),
  );

  const nextMembers = new Map<string, RoomMember>();

  for (const row of membersRows) {
    const previous = state.members.get(row.id);
    nextMembers.set(row.id, {
      memberId: row.id,
      userId: row.user_id,
      username: usernames.get(row.user_id) ?? `user_${row.user_id.slice(0, 8)}`,
      role: row.role,
      budgetCurrent: row.budget_current,
      slotsFilled: normalizeSlotsFilled(row.slots_filled),
      connected: previous?.connected ?? false,
      socketId: previous?.socketId ?? null,
      lastBidAt: previous?.lastBidAt ?? 0,
    });
  }

  state.members = nextMembers;
}

export async function initRoom(leagueId: string): Promise<RoomState> {
  const existing = activeRooms.get(leagueId);
  if (existing) {
    return existing;
  }

  const { data: leagueRow, error: leagueError } = await supabaseAdmin
    .from("leagues")
    .select("id, admin_id, settings")
    .eq("id", leagueId)
    .single();

  if (leagueError || !leagueRow) {
    throw leagueError ?? new Error("LEAGUE_NOT_FOUND");
  }

  const state: RoomState = {
    leagueId,
    currentPlayer: null,
    currentBid: 0,
    highestBidderMemberId: null,
    timerEndsAt: null,
    bidCount: 0,
    status: "IDLE",
    isPaused: false,
    pauseReason: null,
    remainingMs: null,
    lastAdminPulse: Date.now(),
    adminDisconnectedEmitted: false,
    leagueSettings:
      leagueRow.settings && typeof leagueRow.settings === "object"
        ? (leagueRow.settings as LeagueSettings)
        : {},
    adminUserId: leagueRow.admin_id,
    members: new Map<string, RoomMember>(),
    isSelling: false,
  };

  await syncMembersFromDb(state);

  activeRooms.set(leagueId, state);
  return state;
}

export function destroyRoom(leagueId: string) {
  activeRooms.delete(leagueId);
}

export function serializeRoomMember(member: RoomMember) {
  return {
    memberId: member.memberId,
    userId: member.userId,
    username: member.username,
    role: member.role,
    budgetCurrent: member.budgetCurrent,
    slotsFilled: member.slotsFilled,
    connected: member.connected,
  };
}

export function getRoomState(state: RoomState) {
  return {
    leagueId: state.leagueId,
    status: state.status,
    isPaused: state.isPaused,
    currentPlayer: state.currentPlayer,
    currentBid: state.currentBid,
    highestBidderMemberId: state.highestBidderMemberId,
    timerEndsAt: state.timerEndsAt,
    bidCount: state.bidCount,
    members: Array.from(state.members.values()).map(serializeRoomMember),
  };
}

export function getMemberByUserId(
  state: RoomState,
  userId: string,
): RoomMember | null {
  for (const member of state.members.values()) {
    if (member.userId === userId) {
      return member;
    }
  }

  return null;
}

export function isAdminMember(member: RoomMember): boolean {
  return member.role === "ADMIN";
}

export function updateMemberConnection(
  state: RoomState,
  memberId: string,
  connected: boolean,
  socketId: string | null,
) {
  const member = state.members.get(memberId);
  if (!member) {
    return;
  }

  member.connected = connected;
  member.socketId = socketId;
}

export function hasConnectedMembers(state: RoomState): boolean {
  for (const member of state.members.values()) {
    if (member.connected) {
      return true;
    }
  }
  return false;
}
