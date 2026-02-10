import { Injectable } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { BehaviorSubject, from, map } from 'rxjs';
import { environment } from '../environments/environment.development';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;

  // Stato reattivo della sessione
  private sessionSubject = new BehaviorSubject<Session | null>(null);
  session$ = this.sessionSubject.asObservable();

  // Stato reattivo dell'utente
  user$ = this.session$.pipe(map((session) => session?.user ?? null));

  constructor() {
    // Inizializza il client con le chiavi pubbliche
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);

    // 1. Recupera sessione iniziale (se c'è un cookie/localStorage)
    this.supabase.auth.getSession().then(({ data }) => {
      this.sessionSubject.next(data.session);
    });

    // 2. Ascolta i cambiamenti (Login, Logout, Token Refresh automatico)
    this.supabase.auth.onAuthStateChange((event, session) => {
      console.log('Supabase Auth Event:', event);
      this.sessionSubject.next(session);
    });
  }

  // --- AZIONI AUTH ---

  signIn(email: string, password: string) {
    // <--- Aggiungi parametro password
    return from(this.supabase.auth.signInWithPassword({ email, password }));
  }

  signUp(email: string, password: string, username: string) {
    // AGGIUNGI QUESTA RIGA PER IL DEBUG:
    console.log('Tentativo SignUp con dati:', { email, password, username });

    return from(
      this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
        },
      }),
    );
  }

  signOut() {
    return from(this.supabase.auth.signOut());
  }

  // Metodo utile per l'Interceptor: ottieni il token corrente (o nullo)
  async getAccessToken(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }
}
