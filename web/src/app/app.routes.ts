import { Routes } from '@angular/router';
import { authGuard } from '../core/auth.guard';
import { LoginPageComponent } from './features/auth/login.page';
import { ResetPasswordPageComponent } from './features/auth/reset-password.page';
import { SignupPageComponent } from './features/auth/signup.page';
import { DashboardPageComponent } from './features/dashboard/dashboard.page';
import { LeagueAuctionPageComponent } from './features/league/league-auction.page';
import { LeagueCreatePageComponent } from './features/league/league-create.page';
import { LeagueImportPageComponent } from './features/league/league-import.page';
import { LeagueLobbyPageComponent } from './features/league/league-lobby.page';
import { LeagueSetupPageComponent } from './features/league/league-setup.page';

export const appRoutes: Routes = [
  { path: 'login', component: LoginPageComponent },
  { path: 'signup', component: SignupPageComponent },
  { path: 'reset-password', component: ResetPasswordPageComponent },
  {
    path: 'dashboard',
    component: DashboardPageComponent,
    canActivate: [authGuard],
  },
  {
    path: 'leagues/new',
    component: LeagueCreatePageComponent,
    canActivate: [authGuard],
  },
  {
    path: 'league/:id/lobby',
    component: LeagueLobbyPageComponent,
    canActivate: [authGuard],
  },
  {
    path: 'league/:id/setup',
    component: LeagueSetupPageComponent,
    canActivate: [authGuard],
  },
  {
    path: 'league/:id/import',
    component: LeagueImportPageComponent,
    canActivate: [authGuard],
  },
  {
    path: 'league/:id/auction',
    component: LeagueAuctionPageComponent,
    canActivate: [authGuard],
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
