import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Socket } from 'socket.io-client';
import { SocketService } from './socket.service';
import { SupabaseService } from './supabase.service';

export type AuctionStatus = 'IDLE' | 'ACTIVE' | 'PAUSED';

export type AuctionPlayer = {
  id: number;
  leagueId: string;
  name: string;
  teamReal: string;
  roles: string[];
  rolesMantra: string[];
};

export type RoomMember = {
  memberId: string;
  userId: string;
  username: string;
  role: 'ADMIN' | 'USER';
  budgetCurrent: number;
  slotsFilled: Record<string, number>;
  connected: boolean;
};

export type OpponentInfo = {
  memberId: string;
  username: string;
  budgetCurrent: number;
  slotsFilled: Record<string, number>;
  connected: boolean;
};

type AuctionState = {
  leagueId: string | null;
  status: AuctionStatus;
  isPaused: boolean;
  currentPlayer: AuctionPlayer | null;
  currentBid: number;
  highestBidderMemberId: string | null;
  highestBidderName: string | null;
  timerEndsAt: number | null;
  bidCount: number;
  myUserId: string | null;
  myMemberId: string | null;
  isAdmin: boolean;
  myBudget: number;
  mySlotsFilled: Record<string, number>;
  opponents: OpponentInfo[];
  serverOffsetMs: number;
  lastError: string | null;
  lastInfo: string | null;
};

const INITIAL_STATE: AuctionState = {
  leagueId: null,
  status: 'IDLE',
  isPaused: false,
  currentPlayer: null,
  currentBid: 0,
  highestBidderMemberId: null,
  highestBidderName: null,
  timerEndsAt: null,
  bidCount: 0,
  myUserId: null,
  myMemberId: null,
  isAdmin: false,
  myBudget: 0,
  mySlotsFilled: {},
  opponents: [],
  serverOffsetMs: 0,
  lastError: null,
  lastInfo: null,
};

@Injectable({
  providedIn: 'root',
})
export class AuctionStore {
  private readonly state = signal<AuctionState>(INITIAL_STATE);
  private readonly nowMs = signal(Date.now());

  private socket: Socket | null = null;
  private frameId: number | null = null;

  readonly status = computed(() => this.state().status);
  readonly currentPlayer = computed(() => this.state().currentPlayer);
  readonly currentBid = computed(() => this.state().currentBid);
  readonly highestBidderName = computed(() => this.state().highestBidderName);
  readonly isAdmin = computed(() => this.state().isAdmin);
  readonly myBudget = computed(() => this.state().myBudget);
  readonly opponents = computed(() => this.state().opponents);
  readonly lastError = computed(() => this.state().lastError);
  readonly lastInfo = computed(() => this.state().lastInfo);
  readonly minNextBid = computed(() => this.state().currentBid + 1);

  readonly timeRemainingMs = computed(() => {
    const currentState = this.state();
    if (!currentState.timerEndsAt || currentState.status !== 'ACTIVE' || currentState.isPaused) {
      return 0;
    }

    const serverNow = this.nowMs() + currentState.serverOffsetMs;
    return Math.max(0, currentState.timerEndsAt - serverNow);
  });

  readonly canBid = computed(() => {
    const currentState = this.state();
    const result =
      currentState.status === 'ACTIVE' &&
      !currentState.isPaused &&
      this.minNextBid() <= currentState.myBudget;

    console.log('[AuctionStore.canBid]', {
      status: currentState.status,
      isPaused: currentState.isPaused,
      minNextBid: this.minNextBid(),
      myBudget: currentState.myBudget,
      result,
    });

    return result;
  });

  constructor(
    private readonly socketService: SocketService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async connect(leagueId: string) {
    console.log('[AuctionStore.connect] Connecting to league:', leagueId);

    const session = await firstValueFrom(this.supabaseService.getCurrentSession$());
    const myUserId = session?.user?.id ?? null;

    this.state.update((prev) => ({
      ...prev,
      leagueId,
      myUserId,
      lastError: null,
      lastInfo: null,
    }));

    const socket = await this.socketService.connect(leagueId);
    console.log('[AuctionStore.connect] Socket connected:', socket.connected);

    this.detachSocketListeners();

    this.socket = socket;
    this.attachSocketListeners(socket);
    this.startTimerDisplay();

    console.log('[AuctionStore.connect] Connect completed, socket is set');
  }

  disconnect() {
    this.stopTimerDisplay();
    this.detachSocketListeners();
    this.socketService.disconnect();
    this.socket = null;
    this.state.set(INITIAL_STATE);
  }

  addBid(amount: number) {
    if (!this.socket) {
      return;
    }

    this.state.update((prev) => ({ ...prev, lastError: null }));
    this.socket.emit('place_bid', { amount });
  }

  adminAction(
    action: 'admin_pause' | 'admin_resume' | 'admin_skip' | 'admin_rollback' | 'admin_pulse',
  ) {
    console.log(
      `[AuctionStore.adminAction] Action: ${action}, Socket connected:`,
      this.socket?.connected,
    );

    if (!this.socket) {
      console.error('[AuctionStore.adminAction] Socket is null!');
      return;
    }

    console.log(`[AuctionStore.adminAction] Emitting ${action} event`);
    this.socket.emit(action, {});
  }

  private attachSocketListeners(socket: Socket) {
    socket.on('auction_state', (payload) => {
      console.log('[AuctionStore] Received auction_state payload:', payload);

      const roomState = this.unwrapAuctionStatePayload(payload);
      const members: RoomMember[] = Array.isArray(roomState?.members) ? roomState.members : [];

      const myUserId = this.state().myUserId;
      const me = members.find((member) => member.userId === myUserId) ?? null;

      console.log('[AuctionStore] My user info:', { myUserId, me, myRole: me?.role });

      this.state.update((prev) => ({
        ...prev,
        leagueId: roomState?.leagueId ?? prev.leagueId,
        status: roomState?.status ?? 'IDLE',
        isPaused: Boolean(roomState?.isPaused),
        currentPlayer: roomState?.currentPlayer ?? null,
        currentBid: Number(roomState?.currentBid ?? 0),
        highestBidderMemberId: roomState?.highestBidderMemberId ?? null,
        timerEndsAt: roomState?.timerEndsAt ?? null,
        bidCount: Number(roomState?.bidCount ?? 0),
        myMemberId: me?.memberId ?? null,
        isAdmin: me?.role === 'ADMIN',
        myBudget: Number(me?.budgetCurrent ?? 0),
        mySlotsFilled: me?.slotsFilled ?? {},
        opponents: members
          .filter((member) => member.memberId !== me?.memberId)
          .map((member) => ({
            memberId: member.memberId,
            username: member.username,
            budgetCurrent: member.budgetCurrent,
            slotsFilled: member.slotsFilled,
            connected: member.connected,
          })),
      }));

      console.log('[AuctionStore] Updated state - isAdmin:', me?.role === 'ADMIN');
    });

    socket.on('server_time', (payload: { timestamp?: number; time?: number }) => {
      const serverTime = payload.timestamp ?? payload.time;
      if (typeof serverTime !== 'number') {
        return;
      }

      this.state.update((prev) => ({
        ...prev,
        serverOffsetMs: serverTime - Date.now(),
      }));
    });

    socket.on('new_player_on_auction', (payload) => {
      this.state.update((prev) => ({
        ...prev,
        status: 'ACTIVE',
        isPaused: false,
        currentPlayer: payload?.player ?? null,
        currentBid: Number(payload?.minBid ?? prev.currentBid),
        highestBidderMemberId: null,
        highestBidderName: null,
        timerEndsAt: payload?.timerEndsAt ?? null,
        bidCount: 0,
        lastInfo: payload?.player?.name ? `Asta iniziata: ${payload.player.name}` : 'Asta iniziata',
      }));
    });

    socket.on('bid_update', (payload) => {
      this.state.update((prev) => ({
        ...prev,
        currentBid: Number(payload?.amount ?? prev.currentBid),
        highestBidderMemberId: payload?.bidderMemberId ?? null,
        highestBidderName: payload?.bidderName ?? null,
        timerEndsAt: payload?.newTimerEndsAt ?? prev.timerEndsAt,
        bidCount: Number(payload?.bidCount ?? prev.bidCount),
      }));
    });

    socket.on('player_sold', (payload) => {
      const winnerMemberId = payload?.winnerMemberId ?? null;
      const soldPrice = Number(payload?.price ?? 0);

      this.state.update((prev) => {
        const updatedOpponents = prev.opponents.map((opponent) =>
          opponent.memberId === winnerMemberId
            ? {
                ...opponent,
                budgetCurrent: Math.max(0, opponent.budgetCurrent - soldPrice),
              }
            : opponent,
        );

        const myBudget =
          prev.myMemberId === winnerMemberId
            ? Math.max(0, prev.myBudget - soldPrice)
            : prev.myBudget;

        return {
          ...prev,
          status: 'IDLE',
          isPaused: false,
          currentPlayer: null,
          currentBid: 0,
          highestBidderMemberId: null,
          highestBidderName: null,
          timerEndsAt: null,
          bidCount: 0,
          myBudget,
          opponents: updatedOpponents,
          lastInfo:
            payload?.player?.name && payload?.winnerName
              ? `${payload.player.name} venduto a ${payload.winnerName} (${soldPrice})`
              : 'Giocatore venduto',
        };
      });
    });

    socket.on('player_skipped', (payload) => {
      this.state.update((prev) => ({
        ...prev,
        status: 'IDLE',
        isPaused: false,
        currentPlayer: null,
        currentBid: 0,
        highestBidderMemberId: null,
        highestBidderName: null,
        timerEndsAt: null,
        bidCount: 0,
        lastInfo: payload?.player?.name ? `${payload.player.name} skippato` : 'Giocatore skippato',
      }));
    });

    socket.on('auction_paused', () => {
      this.state.update((prev) => ({
        ...prev,
        status: prev.currentPlayer ? 'PAUSED' : prev.status,
        isPaused: true,
      }));
    });

    socket.on('auction_resumed', (payload) => {
      this.state.update((prev) => ({
        ...prev,
        status: prev.currentPlayer ? 'ACTIVE' : prev.status,
        isPaused: false,
        timerEndsAt: payload?.newTimerEndsAt ?? prev.timerEndsAt,
      }));
    });

    socket.on('rollback_executed', (payload) => {
      const members: RoomMember[] = Array.isArray(payload?.members) ? payload.members : [];
      const myMemberId = this.state().myMemberId;
      const me = members.find((member) => member.memberId === myMemberId) ?? null;

      this.state.update((prev) => ({
        ...prev,
        myBudget: Number(me?.budgetCurrent ?? prev.myBudget),
        mySlotsFilled: me?.slotsFilled ?? prev.mySlotsFilled,
        opponents: members
          .filter((member) => member.memberId !== myMemberId)
          .map((member) => ({
            memberId: member.memberId,
            username: member.username,
            budgetCurrent: member.budgetCurrent,
            slotsFilled: member.slotsFilled,
            connected: member.connected,
          })),
        lastInfo: 'Rollback eseguito',
      }));
    });

    socket.on('admin_disconnected', () => {
      this.state.update((prev) => ({
        ...prev,
        lastInfo: 'Admin disconnesso: asta in pausa',
      }));
    });

    socket.on('admin_reconnected', () => {
      this.state.update((prev) => ({
        ...prev,
        lastInfo: 'Admin riconnesso',
      }));
    });

    socket.on('bid_error', (payload) => {
      this.state.update((prev) => ({
        ...prev,
        lastError: payload?.message ?? payload?.code ?? 'Bid rifiutata',
      }));
    });

    socket.on('admin_error', (payload) => {
      this.state.update((prev) => ({
        ...prev,
        lastError: payload?.detail ?? payload?.code ?? 'Azione admin non valida',
      }));
    });

    socket.on('join_error', (payload) => {
      this.state.update((prev) => ({
        ...prev,
        lastError: payload?.detail ?? payload?.error ?? 'Join room fallita',
      }));
    });

    socket.on('auth_error', (payload) => {
      this.state.update((prev) => ({
        ...prev,
        lastError: payload?.error ?? 'Errore autenticazione socket',
      }));
    });
  }

  private detachSocketListeners() {
    if (!this.socket) {
      return;
    }

    this.socket.off('auction_state');
    this.socket.off('server_time');
    this.socket.off('new_player_on_auction');
    this.socket.off('bid_update');
    this.socket.off('player_sold');
    this.socket.off('player_skipped');
    this.socket.off('auction_paused');
    this.socket.off('auction_resumed');
    this.socket.off('rollback_executed');
    this.socket.off('admin_disconnected');
    this.socket.off('admin_reconnected');
    this.socket.off('bid_error');
    this.socket.off('admin_error');
    this.socket.off('join_error');
    this.socket.off('auth_error');
  }

  private startTimerDisplay() {
    this.stopTimerDisplay();

    const tick = () => {
      this.nowMs.set(Date.now());
      this.frameId = window.requestAnimationFrame(tick);
    };

    this.frameId = window.requestAnimationFrame(tick);
  }

  private stopTimerDisplay() {
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private unwrapAuctionStatePayload(payload: unknown): any {
    if (
      payload &&
      typeof payload === 'object' &&
      'fullState' in payload &&
      typeof (payload as any).fullState === 'object'
    ) {
      return (payload as any).fullState;
    }

    return payload as any;
  }
}
