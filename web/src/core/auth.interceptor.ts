import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { environment } from '../environments/environment';
import { SupabaseService } from './supabase.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const supabase = inject(SupabaseService);
  const apiBaseUrl = environment.apiBaseUrl;

  // Se la richiesta NON è verso il nostro backend Node.js, lasciala passare così com'è
  if (!req.url.startsWith(apiBaseUrl)) {
    return next(req);
  }

  // Altrimenti, prendi il token e attaccalo
  return from(supabase.getAccessToken()).pipe(
    switchMap((token) => {
      if (token) {
        // Clona la richiesta e aggiungi l'header
        const authReq = req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        });
        return next(authReq);
      }
      // Se non c'è token, manda la richiesta originale (che fallirà con 401, corretto)
      return next(req);
    }),
  );
};
