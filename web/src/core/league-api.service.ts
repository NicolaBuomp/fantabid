import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export type LeagueMode = 'CLASSIC' | 'MANTRA';
export type LeagueAccessType = 'OPEN' | 'PASSWORD' | 'APPROVAL';
export type LeagueStatus = 'DRAFT' | 'ACTIVE' | 'ENDED';
export type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type MembershipRole = 'ADMIN' | 'USER';

export type LeagueSettings = {
  budget_type?: 'FIXED' | 'CUSTOM';
  base_budget?: number;
  timer_seconds?: number;
  timer_decay_enabled?: boolean;
  timer_decay_rules?: Array<{
    from_bid: number;
    to_bid: number;
    seconds: number;
  }>;
  roster_limits?: Record<string, number>;
  min_start_bid?: number;
};

export type League = {
  id: string;
  admin_id: string;
  name: string;
  mode: LeagueMode;
  access_type: LeagueAccessType;
  status: LeagueStatus;
  max_members: number;
  settings?: LeagueSettings | null;
  created_at: string;
  updated_at: string;
};

export type LeagueMembership = {
  id: string;
  league_id: string;
  user_id?: string;
  role: MembershipRole;
  status: MembershipStatus;
  team_name?: string | null;
  budget_initial?: number | null;
  budget_current?: number | null;
  slots_filled?: number | null;
  joined_at: string;
};

export type LeagueMemberProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
};

export type LeagueMember = LeagueMembership & {
  profiles: LeagueMemberProfile | null;
};

export type UserLeagueItem = {
  league: League;
  membership: Omit<LeagueMembership, 'user_id'>;
};

export type CreateLeaguePayload = {
  name: string;
  mode: LeagueMode;
  access_type: LeagueAccessType;
  password?: string;
  max_members?: number;
  settings?: LeagueSettings;
};

@Injectable({
  providedIn: 'root',
})
export class LeagueApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/api/leagues`;

  getUserLeagues(): Observable<{ leagues: UserLeagueItem[] }> {
    return this.http.get<{ leagues: UserLeagueItem[] }>(this.baseUrl);
  }

  createLeague(payload: CreateLeaguePayload): Observable<{ league: League }> {
    return this.http.post<{ league: League }>(this.baseUrl, payload);
  }

  getLeagueDetail(leagueId: string): Observable<{
    league: League;
    viewerMembership: LeagueMembership | null;
    members: LeagueMember[];
  }> {
    return this.http.get<{
      league: League;
      viewerMembership: LeagueMembership | null;
      members: LeagueMember[];
    }>(`${this.baseUrl}/${leagueId}`);
  }

  joinLeague(leagueId: string, password?: string): Observable<{ membership: LeagueMembership }> {
    return this.http.post<{ membership: LeagueMembership }>(`${this.baseUrl}/${leagueId}/join`, {
      password,
    });
  }

  approveMember(leagueId: string, memberId: string): Observable<{ membership: LeagueMembership }> {
    return this.http.post<{ membership: LeagueMembership }>(
      `${this.baseUrl}/${leagueId}/members/${memberId}/approve`,
      {},
    );
  }

  rejectMember(leagueId: string, memberId: string): Observable<{ membership: LeagueMembership }> {
    return this.http.post<{ membership: LeagueMembership }>(
      `${this.baseUrl}/${leagueId}/members/${memberId}/reject`,
      {},
    );
  }

  removeMember(
    leagueId: string,
    memberId: string,
  ): Observable<{ removed: boolean; memberId: string }> {
    return this.http.delete<{ removed: boolean; memberId: string }>(
      `${this.baseUrl}/${leagueId}/members/${memberId}`,
    );
  }

  updateLeagueSettings(leagueId: string, settings: LeagueSettings): Observable<{ league: League }> {
    return this.http.patch<{ league: League }>(`${this.baseUrl}/${leagueId}`, {
      settings,
    });
  }
}
