import { Injectable } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { environment } from '../environments/environment';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private socket: Socket | null = null;
  private leagueId: string | null = null;

  constructor(private readonly supabase: SupabaseService) {
    this.supabase.session$.subscribe((session) => {
      const token = session?.access_token;
      if (token && this.socket?.connected) {
        this.socket.emit('token_refresh', { token });
      }
    });
  }

  async connect(leagueId: string): Promise<Socket> {
    const token = await this.supabase.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    if (this.socket?.connected && this.leagueId === leagueId) {
      return this.socket;
    }

    if (this.socket) {
      this.disconnect();
    }

    this.leagueId = leagueId;

    this.socket = io(`${environment.wsBaseUrl}/auction`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    // Wait only for socket connect, then let AuctionStore register listeners
    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        reject(new Error('Socket connection timeout'));
      }, 10000);

      const onConnect = () => {
        clearTimeout(connectionTimeout);
        this.socket?.off('connect', onConnect);
        this.socket?.off('connect_error', onConnectError);
        console.log('[SocketService] Socket connected, emitting join_room');
        this.socket?.emit('join_room', { leagueId });
        resolve(this.socket!);
      };

      const onConnectError = (error: Error) => {
        clearTimeout(connectionTimeout);
        this.socket?.off('connect', onConnect);
        this.socket?.off('connect_error', onConnectError);
        console.error('[SocketService] Connection error:', error);
        reject(error);
      };

      // Register listeners before checking connection
      this.socket?.on('connect', onConnect);
      this.socket?.on('connect_error', onConnectError);

      // If already connected, trigger the connect handler manually
      if (this.socket?.connected) {
        onConnect();
      }
    });
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.leagueId = null;
  }
}
