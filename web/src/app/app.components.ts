import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-10">
      <h1 class="text-3xl font-bold mb-5">FantaBid Test Console</h1>

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

      <div class="bg-gray-100 p-4 rounded border border-gray-300">
        <h3 class="font-bold">Risposta Server:</h3>
        <pre class="whitespace-pre-wrap">{{ apiResponse | json }}</pre>
      </div>
    </div>
  `,
})
export class AppComponent {
  supabase = inject(SupabaseService);
  http = inject(HttpClient);

  apiResponse: any = 'Nessuna chiamata effettuata';

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
}
