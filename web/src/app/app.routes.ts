import { Routes } from '@angular/router';
import { authGuard } from '../core/auth.guard';
import { LoginPageComponent } from './features/auth/login.page';
import { ResetPasswordPageComponent } from './features/auth/reset-password.page';
import { SignupPageComponent } from './features/auth/signup.page';
import { DashboardPageComponent } from './features/dashboard/dashboard.page';

export const appRoutes: Routes = [
  { path: 'login', component: LoginPageComponent },
  { path: 'signup', component: SignupPageComponent },
  { path: 'reset-password', component: ResetPasswordPageComponent },
  {
    path: 'dashboard',
    component: DashboardPageComponent,
    canActivate: [authGuard],
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
