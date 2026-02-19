import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
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
  imports: [CommonModule],
  template: `
    <main class="mx-auto max-w-5xl p-6">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Lobby Lega</h1>
          <p class="text-sm opacity-80">{{ league()?.name || 'Dettaglio lega' }}</p>
        </div>
        <div class="flex gap-2">
          @if (isAdmin()) {
            <button (click)="goToSetup()" class="rounded bg-blue-600 px-4 py-2 text-white">
              Setup
            </button>
          }
          <button (click)="goDashboard()" class="rounded border px-4 py-2">Dashboard</button>
        </div>
      </header>

      @if (message()) {
        <p class="mb-4 text-sm">{{ message() }}</p>
      }

      @if (loading()) {
        <p class="text-sm opacity-80">Caricamento lobby...</p>
      } @else if (!league()) {
        <p class="text-sm">Lega non trovata.</p>
      } @else {
        @if (viewerMembership()?.status === 'PENDING') {
          <section class="theme-surface mb-4 rounded border p-4">
            <p class="font-medium">In attesa di approvazione</p>
            <p class="mt-1 text-sm opacity-80">Un admin deve approvare la tua richiesta.</p>
          </section>
        }

        <section class="theme-surface rounded border p-4">
          <h2 class="mb-3 text-lg font-semibold">Membri</h2>

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

                  @if (isAdmin() && member.role !== 'ADMIN') {
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
      }
    </main>
  `,
})
export class LeagueLobbyPageComponent {
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
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.message.set(this.parseHttpError(error, 'Caricamento lobby fallito'));
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

  goToSetup() {
    this.router.navigateByUrl(`/league/${this.leagueId()}/setup`);
  }

  goDashboard() {
    this.router.navigateByUrl('/dashboard');
  }

  private reloadLeague() {
    this.leagueApi.getLeagueDetail(this.leagueId()).subscribe({
      next: ({ league, viewerMembership, members }) => {
        this.league.set(league);
        this.viewerMembership.set(viewerMembership);
        this.members.set(members);
      },
      error: (error: unknown) => {
        this.message.set(this.parseHttpError(error, 'Aggiornamento lobby fallito'));
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
