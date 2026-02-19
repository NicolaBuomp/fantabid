import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, switchMap } from 'rxjs';
import {
  League,
  LeagueApiService,
  LeagueMember,
  LeagueMembership,
} from '../../../core/league-api.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="mx-auto max-w-5xl p-6">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Setup Lega</h1>
          <p class="text-sm opacity-80">{{ league()?.name || 'Configurazione admin' }}</p>
        </div>
        <div class="flex gap-2">
          <button (click)="goToImport()" class="rounded bg-emerald-600 px-4 py-2 text-white">
            Import Listone
          </button>
          <button (click)="goToLobby()" class="rounded border px-4 py-2">Torna alla Lobby</button>
        </div>
      </header>

      @if (message()) {
        <p class="mb-4 text-sm">{{ message() }}</p>
      }

      @if (loading()) {
        <p class="text-sm opacity-80">Caricamento setup...</p>
      } @else if (!isAdmin()) {
        <section class="theme-surface rounded border p-4">
          <p class="font-medium">Accesso negato</p>
          <p class="mt-1 text-sm opacity-80">Solo l'admin della lega può accedere al setup.</p>
        </section>
      } @else {
        <section class="theme-surface mb-6 rounded border p-4">
          <h2 class="mb-3 text-lg font-semibold">Gestione membri</h2>

          <div class="space-y-2">
            @for (member of members(); track member.id) {
              <article class="rounded border p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    <span class="font-medium">{{
                      member.profiles?.username || member.user_id || 'Utente'
                    }}</span>
                    · {{ member.role }} · {{ member.status }}
                  </p>

                  @if (member.role !== 'ADMIN') {
                    <div class="flex gap-2">
                      <button
                        (click)="approveMember(member)"
                        [disabled]="loadingAction()"
                        class="rounded bg-emerald-600 px-3 py-1 text-sm text-white disabled:opacity-60"
                      >
                        Approva
                      </button>
                      <button
                        (click)="rejectMember(member)"
                        [disabled]="loadingAction()"
                        class="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-60"
                      >
                        {{ member.status === 'PENDING' ? 'Rifiuta' : 'Rimuovi' }}
                      </button>
                    </div>
                  }
                </div>
              </article>
            }
          </div>
        </section>

        <section class="theme-surface rounded border p-4">
          <h2 class="mb-3 text-lg font-semibold">Modifica settings lega</h2>

          <div class="grid gap-4 md:grid-cols-3">
            <label class="block">
              <span class="mb-1 block text-sm font-medium">Budget base</span>
              <input
                type="number"
                min="1"
                [ngModel]="baseBudget()"
                (ngModelChange)="baseBudget.set(toNumber($event, 500))"
                class="theme-surface w-full rounded border px-3 py-2"
              />
            </label>

            <label class="block">
              <span class="mb-1 block text-sm font-medium">Timer (sec)</span>
              <input
                type="number"
                min="1"
                [ngModel]="timerSeconds()"
                (ngModelChange)="timerSeconds.set(toNumber($event, 15))"
                class="theme-surface w-full rounded border px-3 py-2"
              />
            </label>

            <label class="block">
              <span class="mb-1 block text-sm font-medium">Offerta minima</span>
              <input
                type="number"
                min="1"
                [ngModel]="minStartBid()"
                (ngModelChange)="minStartBid.set(toNumber($event, 1))"
                class="theme-surface w-full rounded border px-3 py-2"
              />
            </label>
          </div>

          <label class="mt-4 block">
            <span class="mb-1 block text-sm font-medium">Roster limits (JSON)</span>
            <textarea
              rows="8"
              [ngModel]="rosterLimitsJson()"
              (ngModelChange)="rosterLimitsJson.set($event)"
              class="theme-surface w-full rounded border px-3 py-2 font-mono text-sm"
            ></textarea>
          </label>

          <button
            (click)="saveSettings()"
            [disabled]="loadingAction()"
            class="mt-4 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
          >
            Salva settings
          </button>
        </section>
      }
    </main>
  `,
})
export class LeagueSetupPageComponent {
  private readonly leagueApi = inject(LeagueApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly leagueId = signal('');
  readonly league = signal<League | null>(null);
  readonly viewerMembership = signal<LeagueMembership | null>(null);
  readonly members = signal<LeagueMember[]>([]);
  readonly loading = signal(true);
  readonly loadingAction = signal(false);
  readonly message = signal('');
  readonly baseBudget = signal(500);
  readonly timerSeconds = signal(15);
  readonly minStartBid = signal(1);
  readonly rosterLimitsJson = signal('{}');

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const leagueId = params.get('id') ?? '';
          this.leagueId.set(leagueId);
          this.loading.set(true);
          this.message.set('');
          return this.leagueApi.getLeagueDetail(leagueId);
        }),
      )
      .subscribe({
        next: ({ league, viewerMembership, members }) => {
          this.league.set(league);
          this.viewerMembership.set(viewerMembership);
          this.members.set(members);

          const settings = league.settings ?? {};
          this.baseBudget.set(this.toNumber(String(settings.base_budget ?? 500), 500));
          this.timerSeconds.set(this.toNumber(String(settings.timer_seconds ?? 15), 15));
          this.minStartBid.set(this.toNumber(String(settings.min_start_bid ?? 1), 1));
          this.rosterLimitsJson.set(JSON.stringify(settings.roster_limits ?? {}, null, 2));
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.message.set(this.parseHttpError(error, 'Caricamento setup fallito'));
        },
      });
  }

  isAdmin(): boolean {
    return this.viewerMembership()?.role === 'ADMIN';
  }

  approveMember(member: LeagueMember) {
    this.loadingAction.set(true);
    this.message.set('');

    this.leagueApi.approveMember(this.leagueId(), member.id).subscribe({
      next: () => {
        this.loadingAction.set(false);
        this.reloadLeague();
      },
      error: (error: unknown) => {
        this.loadingAction.set(false);
        this.message.set(this.parseHttpError(error, 'Approvazione fallita'));
      },
    });
  }

  rejectMember(member: LeagueMember) {
    this.loadingAction.set(true);
    this.message.set('');

    const action$: Observable<unknown> =
      member.status === 'PENDING'
        ? this.leagueApi.rejectMember(this.leagueId(), member.id)
        : this.leagueApi.removeMember(this.leagueId(), member.id);

    action$.subscribe({
      next: () => {
        this.loadingAction.set(false);
        this.reloadLeague();
      },
      error: (error: unknown) => {
        this.loadingAction.set(false);
        this.message.set(this.parseHttpError(error, 'Azione membro fallita'));
      },
    });
  }

  saveSettings() {
    const rosterLimits = this.parseRosterLimits();
    if (!rosterLimits) {
      this.message.set('Roster limits non valido: inserisci un JSON oggetto con valori numerici.');
      return;
    }

    this.loadingAction.set(true);
    this.message.set('');

    this.leagueApi
      .updateLeagueSettings(this.leagueId(), {
        base_budget: this.baseBudget(),
        timer_seconds: this.timerSeconds(),
        min_start_bid: this.minStartBid(),
        roster_limits: rosterLimits,
      })
      .subscribe({
        next: () => {
          this.loadingAction.set(false);
          this.message.set('Settings aggiornati con successo.');
          this.reloadLeague();
        },
        error: (error: unknown) => {
          this.loadingAction.set(false);
          this.message.set(this.parseHttpError(error, 'Aggiornamento settings fallito'));
        },
      });
  }

  goToLobby() {
    this.router.navigateByUrl(`/league/${this.leagueId()}/lobby`);
  }

  goToImport() {
    this.router.navigateByUrl(`/league/${this.leagueId()}/import`);
  }

  toNumber(value: string, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private reloadLeague() {
    this.leagueApi.getLeagueDetail(this.leagueId()).subscribe({
      next: ({ league, viewerMembership, members }) => {
        this.league.set(league);
        this.viewerMembership.set(viewerMembership);
        this.members.set(members);
      },
      error: (error: unknown) => {
        this.message.set(this.parseHttpError(error, 'Aggiornamento setup fallito'));
      },
    });
  }

  private parseRosterLimits(): Record<string, number> | null {
    try {
      const parsed: unknown = JSON.parse(this.rosterLimitsJson());

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return null;
      }

      const entries = Object.entries(parsed);
      const hasInvalidValue = entries.some(([, value]) => {
        return typeof value !== 'number' || !Number.isFinite(value) || value < 0;
      });

      if (hasInvalidValue) {
        return null;
      }

      return entries.reduce<Record<string, number>>((acc, [key, value]) => {
        acc[key] = Math.floor(value as number);
        return acc;
      }, {});
    } catch {
      return null;
    }
  }

  private parseHttpError(error: unknown, fallback: string): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'error' in error.error &&
      typeof error.error.error === 'string'
    ) {
      return error.error.error;
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
  }
}
