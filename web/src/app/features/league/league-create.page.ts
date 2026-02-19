import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  CreateLeaguePayload,
  LeagueAccessType,
  LeagueApiService,
  LeagueMode,
} from '../../../core/league-api.service';

const CLASSIC_DEFAULT_LIMITS = {
  P: 3,
  D: 8,
  C: 8,
  A: 6,
};

const MANTRA_DEFAULT_LIMITS = {
  Por: 3,
  Ds: 4,
  Dd: 4,
  Dc: 4,
  E: 4,
  M: 4,
  C: 4,
  W: 4,
  T: 4,
  A: 4,
  Pc: 4,
};

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="mx-auto max-w-3xl p-6">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Crea Lega</h1>
          <p class="text-sm opacity-80">Configura la lega e i settings iniziali.</p>
        </div>
        <button (click)="goBack()" class="rounded border px-3 py-2 text-sm">Indietro</button>
      </header>

      <form class="space-y-6" (ngSubmit)="onSubmit()">
        <section class="theme-surface rounded border p-4">
          <h2 class="mb-3 text-lg font-semibold">Dettagli base</h2>

          <div class="grid gap-4 md:grid-cols-2">
            <label class="block md:col-span-2">
              <span class="mb-1 block text-sm font-medium">Nome lega</span>
              <input
                name="name"
                [ngModel]="name()"
                (ngModelChange)="name.set($event)"
                class="theme-surface w-full rounded border px-3 py-2"
                required
              />
            </label>

            <label class="block">
              <span class="mb-1 block text-sm font-medium">Modalità</span>
              <select
                name="mode"
                [ngModel]="mode()"
                (ngModelChange)="onModeChange($event)"
                class="theme-surface w-full rounded border px-3 py-2"
              >
                <option value="CLASSIC">Classic</option>
                <option value="MANTRA">Mantra</option>
              </select>
            </label>

            <label class="block">
              <span class="mb-1 block text-sm font-medium">Tipo accesso</span>
              <select
                name="accessType"
                [ngModel]="accessType()"
                (ngModelChange)="accessType.set($event)"
                class="theme-surface w-full rounded border px-3 py-2"
              >
                <option value="OPEN">Open</option>
                <option value="PASSWORD">Password</option>
                <option value="APPROVAL">Approval</option>
              </select>
            </label>

            @if (accessType() === 'PASSWORD') {
              <label class="block md:col-span-2">
                <span class="mb-1 block text-sm font-medium">Password lega</span>
                <input
                  name="password"
                  type="password"
                  [ngModel]="password()"
                  (ngModelChange)="password.set($event)"
                  class="theme-surface w-full rounded border px-3 py-2"
                  required
                />
              </label>
            }
          </div>
        </section>

        <section class="theme-surface rounded border p-4">
          <h2 class="mb-3 text-lg font-semibold">Settings avanzati</h2>

          <div class="grid gap-4 md:grid-cols-3">
            <label class="block">
              <span class="mb-1 block text-sm font-medium">Budget base</span>
              <input
                name="budget"
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
                name="timer"
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
                name="minBid"
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
              name="rosterLimits"
              rows="8"
              [ngModel]="rosterLimitsJson()"
              (ngModelChange)="rosterLimitsJson.set($event)"
              class="theme-surface w-full rounded border px-3 py-2 font-mono text-sm"
            ></textarea>
          </label>
        </section>

        <button
          type="submit"
          [disabled]="loading()"
          class="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
        >
          {{ loading() ? 'Creazione...' : 'Crea Lega' }}
        </button>
      </form>

      @if (message()) {
        <p class="mt-4 text-sm">{{ message() }}</p>
      }
    </main>
  `,
})
export class LeagueCreatePageComponent {
  private readonly leagueApi = inject(LeagueApiService);
  private readonly router = inject(Router);

  readonly name = signal('');
  readonly mode = signal<LeagueMode>('CLASSIC');
  readonly accessType = signal<LeagueAccessType>('OPEN');
  readonly password = signal('');
  readonly baseBudget = signal(500);
  readonly timerSeconds = signal(15);
  readonly minStartBid = signal(1);
  readonly rosterLimitsJson = signal(JSON.stringify(CLASSIC_DEFAULT_LIMITS, null, 2));
  readonly loading = signal(false);
  readonly message = signal('');

  onModeChange(nextMode: LeagueMode) {
    this.mode.set(nextMode);

    if (nextMode === 'MANTRA') {
      this.rosterLimitsJson.set(JSON.stringify(MANTRA_DEFAULT_LIMITS, null, 2));
      return;
    }

    this.rosterLimitsJson.set(JSON.stringify(CLASSIC_DEFAULT_LIMITS, null, 2));
  }

  onSubmit() {
    const trimmedName = this.name().trim();
    if (!trimmedName) {
      this.message.set('Nome lega obbligatorio.');
      return;
    }

    const rosterLimits = this.parseRosterLimits();
    if (!rosterLimits) {
      this.message.set('Roster limits non valido: inserisci un JSON oggetto con valori numerici.');
      return;
    }

    const payload: CreateLeaguePayload = {
      name: trimmedName,
      mode: this.mode(),
      access_type: this.accessType(),
      settings: {
        base_budget: this.baseBudget(),
        timer_seconds: this.timerSeconds(),
        min_start_bid: this.minStartBid(),
        roster_limits: rosterLimits,
      },
    };

    if (this.accessType() === 'PASSWORD') {
      const password = this.password().trim();
      if (!password) {
        this.message.set('Password obbligatoria per leghe protette.');
        return;
      }

      payload.password = password;
    }

    this.loading.set(true);
    this.message.set('');

    this.leagueApi.createLeague(payload).subscribe({
      next: ({ league }) => {
        this.loading.set(false);
        this.router.navigateByUrl(`/league/${league.id}/lobby`);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.message.set(this.parseHttpError(error, 'Creazione lega fallita'));
      },
    });
  }

  goBack() {
    this.router.navigateByUrl('/dashboard');
  }

  toNumber(value: string, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
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
