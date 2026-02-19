import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { LeagueApiService, UserLeagueItem } from '../../../core/league-api.service';
import { SupabaseService } from '../../../core/supabase.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="mx-auto max-w-5xl p-6">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Le tue leghe</h1>
          <p class="text-sm opacity-80">Gestione leghe, richieste di accesso e setup iniziale.</p>
        </div>
        <div class="flex gap-2">
          <button (click)="goToCreateLeague()" class="rounded bg-blue-600 px-4 py-2 text-white">
            Crea Lega
          </button>
          <button
            (click)="logout()"
            [disabled]="loading()"
            class="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-60"
          >
            {{ loading() ? 'Uscita...' : 'Logout' }}
          </button>
        </div>
      </header>

      <section class="theme-surface mb-6 rounded border p-4">
        <h2 class="text-lg font-semibold">Unisciti a una lega</h2>
        <p class="mt-1 text-sm opacity-80">Inserisci ID lega (UUID) ed eventuale password.</p>

        <div class="mt-4 grid gap-3 md:grid-cols-3">
          <input
            [ngModel]="joinLeagueId()"
            (ngModelChange)="joinLeagueId.set($event)"
            placeholder="League ID"
            class="theme-surface rounded border px-3 py-2 md:col-span-2"
          />
          <input
            [ngModel]="joinPassword()"
            (ngModelChange)="joinPassword.set($event)"
            placeholder="Password (opzionale)"
            class="theme-surface rounded border px-3 py-2"
          />
        </div>

        <button
          (click)="joinLeague()"
          [disabled]="joining() || !joinLeagueId().trim()"
          class="mt-3 rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
        >
          {{ joining() ? 'Invio...' : 'Unisciti a Lega' }}
        </button>
      </section>

      @if (message()) {
        <p class="mb-4 text-sm">{{ message() }}</p>
      }

      <section class="space-y-3">
        @if (loadingLeagues()) {
          <p class="text-sm opacity-80">Caricamento leghe...</p>
        } @else if (!leagues().length) {
          <div class="theme-surface rounded border p-4">
            <p class="font-medium">Nessuna lega disponibile</p>
            <p class="mt-1 text-sm opacity-80">Crea una nuova lega o unisciti tramite ID.</p>
          </div>
        } @else {
          @for (item of leagues(); track item.league.id) {
            <article class="theme-surface rounded border p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 class="text-lg font-semibold">{{ item.league.name }}</h3>
                  <p class="text-sm opacity-80">
                    Mode: {{ item.league.mode }} · Stato lega: {{ item.league.status }} · Stato
                    membro: {{ item.membership.status }} · Membri:
                    {{ memberCountMap()[item.league.id] ?? '-' }}
                  </p>
                </div>

                <div class="flex gap-2">
                  <button
                    (click)="goToLobby(item.league.id)"
                    class="rounded border px-3 py-2 text-sm"
                  >
                    Apri Lobby
                  </button>

                  @if (item.membership.role === 'ADMIN') {
                    <button
                      (click)="goToSetup(item.league.id)"
                      class="rounded bg-blue-600 px-3 py-2 text-sm text-white"
                    >
                      Setup
                    </button>
                  }
                </div>
              </div>
            </article>
          }
        }
      </section>
    </main>
  `,
})
export class DashboardPageComponent {
  private readonly supabaseService = inject(SupabaseService);
  private readonly leagueApi = inject(LeagueApiService);
  private readonly router = inject(Router);

  readonly user = toSignal(this.supabaseService.user$);
  readonly loading = signal(false);
  readonly loadingLeagues = signal(false);
  readonly joining = signal(false);
  readonly message = signal('');
  readonly leagues = signal<UserLeagueItem[]>([]);
  readonly joinLeagueId = signal('');
  readonly joinPassword = signal('');
  readonly memberCountMap = signal<Partial<Record<string, number>>>({});

  constructor() {
    this.loadLeagues();
  }

  logout() {
    this.loading.set(true);
    this.supabaseService.signOut().subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/login');
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  goToCreateLeague() {
    this.router.navigateByUrl('/leagues/new');
  }

  goToLobby(leagueId: string) {
    this.router.navigateByUrl(`/league/${leagueId}/lobby`);
  }

  goToSetup(leagueId: string) {
    this.router.navigateByUrl(`/league/${leagueId}/setup`);
  }

  joinLeague() {
    const leagueId = this.joinLeagueId().trim();
    if (!leagueId) {
      return;
    }

    this.joining.set(true);
    this.message.set('');

    this.leagueApi.joinLeague(leagueId, this.joinPassword().trim() || undefined).subscribe({
      next: () => {
        this.joining.set(false);
        this.message.set('Richiesta inviata con successo.');
        this.joinLeagueId.set('');
        this.joinPassword.set('');
        this.loadLeagues();
        this.router.navigateByUrl(`/league/${leagueId}/lobby`);
      },
      error: (error: unknown) => {
        this.joining.set(false);
        this.message.set(this.parseHttpError(error, 'Join lega fallita'));
      },
    });
  }

  private loadLeagues() {
    this.loadingLeagues.set(true);
    this.message.set('');

    this.leagueApi.getUserLeagues().subscribe({
      next: ({ leagues }) => {
        this.leagues.set(leagues);

        if (!leagues.length) {
          this.memberCountMap.set({});
          this.loadingLeagues.set(false);
          return;
        }

        const detailRequests = leagues.map((item) =>
          this.leagueApi.getLeagueDetail(item.league.id).pipe(
            map((detail) => ({
              leagueId: item.league.id,
              count: detail.members.length,
            })),
            catchError(() => of({ leagueId: item.league.id, count: 0 })),
          ),
        );

        forkJoin(detailRequests).subscribe({
          next: (counts) => {
            const nextMap = counts.reduce<Partial<Record<string, number>>>((acc, item) => {
              acc[item.leagueId] = item.count;
              return acc;
            }, {});

            this.memberCountMap.set(nextMap);
            this.loadingLeagues.set(false);
          },
          error: () => {
            this.loadingLeagues.set(false);
          },
        });
      },
      error: (error: unknown) => {
        this.loadingLeagues.set(false);
        this.message.set(this.parseHttpError(error, 'Caricamento leghe fallito'));
      },
    });
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
