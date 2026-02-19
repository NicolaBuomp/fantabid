import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/supabase.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="mx-auto max-w-md p-6">
      <h1 class="mb-2 text-2xl font-bold">Reset password</h1>
      <p class="mb-6 text-sm opacity-80">Inserisci la tua email per ricevere il link di reset.</p>

      <form class="space-y-4" (ngSubmit)="onSubmit()">
        <label class="block">
          <span class="mb-1 block text-sm font-medium">Email</span>
          <input
            [(ngModel)]="email"
            name="email"
            type="email"
            required
            class="theme-surface w-full rounded border px-3 py-2"
          />
        </label>

        <button
          type="submit"
          [disabled]="loading"
          class="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
        >
          {{ loading ? 'Invio...' : 'Invia link reset' }}
        </button>
      </form>

      <p *ngIf="message" class="mt-4 text-sm">{{ message }}</p>

      <div class="mt-6 text-sm">
        <a routerLink="/login" class="underline">Torna al login</a>
      </div>
    </main>
  `,
})
export class ResetPasswordPageComponent {
  private readonly supabaseService = inject(SupabaseService);

  email = '';
  loading = false;
  message = '';

  onSubmit() {
    this.loading = true;
    this.message = '';

    this.supabaseService.resetPassword(this.email).subscribe({
      next: ({ error }) => {
        this.loading = false;
        this.message = error ? error.message : 'Email inviata. Controlla la tua casella di posta.';
      },
      error: (error: unknown) => {
        this.loading = false;
        this.message = String(error);
      },
    });
  }
}
