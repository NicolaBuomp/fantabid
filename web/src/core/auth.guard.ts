import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { SupabaseService } from './supabase.service';

export const authGuard: CanActivateFn = () => {
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);

  return supabaseService.getCurrentSession$().pipe(
    map((session) => {
      if (session) {
        return true;
      }

      return router.createUrlTree(['/login']);
    }),
  );
};
