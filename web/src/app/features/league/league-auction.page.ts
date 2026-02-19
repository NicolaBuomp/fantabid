import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuctionStore } from '../../../core/auction.store';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="mx-auto max-w-6xl p-6">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">War Room</h1>
          <p class="text-sm opacity-80">Lega: {{ leagueId() }}</p>
        </div>
        <button (click)="goToLobby()" class="rounded border px-4 py-2">Torna alla Lobby</button>
      </header>

      @if (store.lastError()) {
        <section class="mb-4 rounded border border-red-500 p-3 text-sm">
          {{ store.lastError() }}
        </section>
      }

      @if (store.lastInfo()) {
        <section class="mb-4 rounded border border-blue-500 p-3 text-sm">
          {{ store.lastInfo() }}
        </section>
      }

      <section class="theme-surface mb-6 rounded border p-4">
        <h2 class="mb-2 text-lg font-semibold">Arena</h2>
        <p class="text-sm">
          Stato: <strong>{{ store.status() }}</strong>
        </p>
        <p class="text-sm">
          Timer: <strong>{{ timeRemainingSeconds() }}s</strong>
        </p>
        <p class="text-sm">
          Bid corrente: <strong>{{ store.currentBid() }}</strong>
        </p>
        <p class="text-sm">
          Miglior offerente: <strong>{{ store.highestBidderName() || '-' }}</strong>
        </p>

        @if (store.currentPlayer()) {
          <article class="mt-3 rounded border p-3">
            <p class="font-medium">{{ store.currentPlayer()!.name }}</p>
            <p class="text-sm opacity-80">
              {{ store.currentPlayer()!.teamReal }} ·
              {{
                store.currentPlayer()!.roles.join('/') ||
                  store.currentPlayer()!.rolesMantra.join('/')
              }}
            </p>
          </article>
        } @else {
          <p class="mt-3 text-sm opacity-80">In attesa del prossimo giocatore...</p>
        }
      </section>

      <section class="theme-surface mb-6 rounded border p-4">
        <h2 class="mb-2 text-lg font-semibold">Bidding Controls</h2>
        <p class="mb-3 text-sm">
          Budget: <strong>{{ store.myBudget() }}</strong>
        </p>

        <div class="flex flex-wrap gap-2">
          <button
            class="rounded border px-3 py-2"
            [disabled]="!store.canBid()"
            (click)="quickBid(1)"
          >
            +1
          </button>
          <button
            class="rounded border px-3 py-2"
            [disabled]="!store.canBid()"
            (click)="quickBid(5)"
          >
            +5
          </button>
          <button
            class="rounded border px-3 py-2"
            [disabled]="!store.canBid()"
            (click)="quickBid(10)"
          >
            +10
          </button>

          <input
            type="number"
            min="1"
            class="theme-surface w-32 rounded border px-3 py-2"
            [ngModel]="manualBidInput()"
            (ngModelChange)="manualBidInput.set(toNumber($event))"
          />
          <button
            class="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
            [disabled]="!store.canBid()"
            (click)="placeManualBid()"
          >
            Offri
          </button>
        </div>
      </section>

      @if (store.isAdmin()) {
        <section class="theme-surface rounded border p-4">
          <h2 class="mb-2 text-lg font-semibold">Admin Controls</h2>
          <div class="flex flex-wrap gap-2">
            <button class="rounded border px-3 py-2" (click)="store.adminAction('admin_pulse')">
              Pulse
            </button>
            <button class="rounded border px-3 py-2" (click)="store.adminAction('admin_pause')">
              Pause
            </button>
            <button class="rounded border px-3 py-2" (click)="store.adminAction('admin_resume')">
              Resume
            </button>
            <button class="rounded border px-3 py-2" (click)="store.adminAction('admin_skip')">
              Skip
            </button>
            <button class="rounded border px-3 py-2" (click)="store.adminAction('admin_rollback')">
              Rollback
            </button>
          </div>
        </section>
      }
    </main>
  `,
})
export class LeagueAuctionPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(AuctionStore);

  readonly leagueId = signal('');
  readonly manualBidInput = signal(0); // User's typed value
  readonly manualBid = computed(() => {
    // Always show at least minNextBid (currentBid + 1)
    const userValue = this.manualBidInput();
    const minBid = this.store.minNextBid();
    return userValue > minBid ? userValue : minBid;
  });
  readonly timeRemainingSeconds = computed(() => Math.ceil(this.store.timeRemainingMs() / 1000));

  ngOnInit(): void {
    const leagueId = this.route.snapshot.paramMap.get('id') ?? '';
    this.leagueId.set(leagueId);
    if (!leagueId) {
      return;
    }

    console.log('[LeagueAuctionPage] Starting connect to leagueId:', leagueId);
    this.store
      .connect(leagueId)
      .then(() => {
        console.log('[LeagueAuctionPage] Connect completed successfully');
      })
      .catch((error: unknown) => {
        console.error('[LeagueAuctionPage] Connect failed:', error);
      });
  }

  ngOnDestroy(): void {
    this.store.disconnect();
  }

  quickBid(increment: number) {
    const nextAmount = this.store.currentBid() + increment;
    this.store.addBid(nextAmount);
    this.manualBidInput.set(nextAmount);
  }

  placeManualBid() {
    this.store.addBid(this.manualBid());
  }

  goToLobby() {
    this.router.navigateByUrl(`/league/${this.leagueId()}/lobby`);
  }

  toNumber(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return this.manualBid();
    }

    return Math.max(1, Math.floor(numeric));
  }
}
