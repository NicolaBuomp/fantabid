import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/supabase.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="mx-auto max-w-3xl p-6">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Dashboard</h1>
          <p class="text-sm opacity-80">Area riservata autenticata.</p>
        </div>
        <button
          (click)="logout()"
          [disabled]="loading()"
          class="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-60"
        >
          {{ loading() ? 'Uscita...' : 'Logout' }}
        </button>
      </header>

      <section class="theme-surface rounded border p-4">
        <p class="text-sm font-medium">Utente autenticato</p>
        <p class="mt-2">{{ user()?.email || 'N/D' }}</p>
      </section>
    </main>
  `,
})
export class DashboardPageComponent {
  private readonly supabaseService = inject(SupabaseService);
  private readonly router = inject(Router);

  // Convert observable to signal
  readonly user = toSignal(this.supabaseService.user$);

  // Local state signals
  readonly loading = signal(false);

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
}
