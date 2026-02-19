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
      <h1 class="mb-2 text-2xl font-bold">Login</h1>
      <p class="mb-6 text-sm opacity-80">Accedi al tuo account FantaBid.</p>

      <form class="space-y-4" (ngSubmit)="onSubmit()">
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
          {{ loading() ? 'Accesso...' : 'Accedi' }}
        </button>
      </form>

      @if (message()) {
        <p class="mt-4 text-sm">{{ message() }}</p>
      }

      <div class="mt-6 flex gap-4 text-sm">
        <a routerLink="/signup" class="underline">Crea account</a>
        <a routerLink="/reset-password" class="underline">Reset password</a>
      </div>
    </main>
  `,
})
export class LoginPageComponent {
  private readonly supabaseService = inject(SupabaseService);
  private readonly router = inject(Router);

  email = signal('');
  password = signal('');
  loading = signal(false);
  message = signal('');

  onSubmit() {
    this.loading.set(true);
    this.message.set('');

    this.supabaseService.signIn(this.email(), this.password()).subscribe({
      next: ({ error }) => {
        this.loading.set(false);
        if (error) {
          this.message.set(error.message);
          return;
        }

        this.router.navigateByUrl('/dashboard');
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.message.set(String(error));
      },
    });
  }
}
