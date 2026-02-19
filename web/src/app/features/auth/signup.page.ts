import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/supabase.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="mx-auto max-w-md p-6">
      <h1 class="mb-2 text-2xl font-bold">Signup</h1>
      <p class="mb-6 text-sm opacity-80">Crea il tuo account FantaBid.</p>

      <form class="space-y-4" (ngSubmit)="onSubmit()">
        <label class="block">
          <span class="mb-1 block text-sm font-medium">Username</span>
          <input
            [ngModel]="username()"
            (ngModelChange)="username.set($event)"
            name="username"
            required
            class="theme-surface w-full rounded border px-3 py-2"
          />
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-medium">Email</span>
          <input
            [ngModel]="email()"
            (ngModelChange)="email.set($event)"
            name="email"
            type="email"
            required
            class="theme-surface w-full rounded border px-3 py-2"
          />
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-medium">Password</span>
          <input
            [ngModel]="password()"
            (ngModelChange)="password.set($event)"
            name="password"
            type="password"
            required
            class="theme-surface w-full rounded border px-3 py-2"
          />
        </label>

        <button
          type="submit"
          [disabled]="loading()"
          class="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
        >
          {{ loading() ? 'Creazione...' : 'Crea account' }}
        </button>
      </form>

      @if (message()) {
        <p class="mt-4 text-sm">{{ message() }}</p>
      }

      <div class="mt-6 text-sm">
        <a routerLink="/login" class="underline">Hai già un account? Login</a>
      </div>
    </main>
  `,
})
export class SignupPageComponent {
  private readonly supabaseService = inject(SupabaseService);
  private readonly router = inject(Router);

  username = signal('');
  email = signal('');
  password = signal('');
  loading = signal(false);
  message = signal('');

  onSubmit() {
    this.loading.set(true);
    this.message.set('');

    this.supabaseService.signUp(this.email(), this.password(), this.username()).subscribe({
      next: ({ data, error }) => {
        this.loading.set(false);
        if (error) {
          this.message.set(error.message);
          return;
        }

        if (data.session) {
          this.router.navigateByUrl('/dashboard');
          return;
        }

        this.message.set("Account creato. Controlla la mail per confermare l'accesso.");
        this.router.navigateByUrl('/login');
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.message.set(String(error));
      },
    });
  }
}
