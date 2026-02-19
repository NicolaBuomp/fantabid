import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { ThemeMode, ThemeService } from '../core/theme.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-10">
      <div class="mb-5 flex items-center justify-between gap-4">
        <h1 class="text-3xl font-bold">FantaBid Test Console</h1>
        <button (click)="toggleTheme()" class="theme-surface rounded border px-4 py-2">
          Tema: {{ themeModeLabel }}
          <span *ngIf="themeMode === 'auto'"> ({{ isDarkTheme ? 'Scuro' : 'Chiaro' }})</span>
        </button>
      </div>

      <div class="mb-5">
        Status:
        <span
          *ngIf="supabase.session$ | async as session; else notLogged"
          class="text-green-600 font-bold"
        >
          LOGGATO ({{ session?.user?.email }})
        </span>
        <ng-template #notLogged
          ><span class="text-red-600 font-bold">NON LOGGATO</span></ng-template
        >
      </div>

      <div class="flex gap-4 mb-5 flex-wrap">
        <button (click)="testSignUp()" class="bg-blue-500 text-white px-4 py-2 rounded">
          1. Test SignUp
        </button>
        <button (click)="testLogin()" class="bg-green-500 text-white px-4 py-2 rounded">
          2. Test Login
        </button>
        <button (click)="testProtectedApi()" class="bg-purple-600 text-white px-4 py-2 rounded">
          3. Chiama Node.js Protetto
        </button>
        <button (click)="logout()" class="bg-red-500 text-white px-4 py-2 rounded">
          4. Logout
        </button>
      </div>

      <div class="theme-surface p-4 rounded border">
        <h3 class="font-bold">Risposta Server:</h3>
        <pre class="whitespace-pre-wrap">{{ apiResponse | json }}</pre>
      </div>
    </div>
  `,
})
export class AppComponent implements OnInit {
  supabase = inject(SupabaseService);
  http = inject(HttpClient);
  theme = inject(ThemeService);

  apiResponse: any = 'Nessuna chiamata effettuata';
  isDarkTheme = false;
  themeMode: ThemeMode = 'auto';

  get themeModeLabel(): string {
    if (this.themeMode === 'light') return 'Chiaro';
    if (this.themeMode === 'dark') return 'Scuro';
    return 'Sistema';
  }

  ngOnInit(): void {
    this.theme.initializeTheme();
    this.syncThemeUi();
  }

  // Dati fake per il test
  testEmail = 'test@fantabid.com';
  testPass = 'passwordSegreta123';

  testSignUp() {
    this.supabase.signUp(this.testEmail, this.testPass, 'TestUser').subscribe({
      next: (res: any) => {
        // Aggiunto tipo : any
        console.log('SignUp:', res);
        this.apiResponse = res.error
          ? res.error.message
          : 'SignUp OK! Controlla auth.users su Supabase';
      },
      error: (err: any) => (this.apiResponse = err), // Aggiunto tipo : any
    });
  }

  testLogin() {
    this.supabase.signIn(this.testEmail, this.testPass).subscribe((res: any) => {
      this.apiResponse = res.error ? res.error.message : 'Login OK!';
    });
  }

  testProtectedApi() {
    this.http.get(`${environment.apiBaseUrl}/protected`).subscribe({
      next: (res: any) => (this.apiResponse = res),
      error: (err: any) => (this.apiResponse = err),
    });
  }

  logout() {
    this.supabase.signOut().subscribe(() => (this.apiResponse = 'Logged out'));
  }

  toggleTheme() {
    this.theme.toggleMode();
    this.syncThemeUi();
  }

  private syncThemeUi() {
    this.themeMode = this.theme.getMode();
    this.isDarkTheme = this.theme.getResolvedTheme() === 'dark';
  }
}
