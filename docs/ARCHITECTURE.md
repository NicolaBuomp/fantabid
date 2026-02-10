# FANTABID — ARCHITECTURE v1.0

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Authentication Architecture](#3-authentication-architecture)
4. [Technology Stack](#4-technology-stack)
5. [Backend Specifications](#5-backend-specifications)
6. [Frontend Specifications](#6-frontend-specifications)
7. [WebSocket Protocol](#7-websocket-protocol)
8. [Security & Rate Limiting](#8-security--rate-limiting)
9. [Timer System](#9-timer-system)
10. [Reconnection Strategy](#10-reconnection-strategy)
11. [Race Condition Handling](#11-race-condition-handling)
12. [Admin "Playing Admin" Flow](#12-admin-playing-admin-flow)
13. [Deployment](#13-deployment)
14. [V2 Roadmap](#14-v2-roadmap)

---

## 1. Overview

App per aste del fantacalcio in tempo reale con supporto per:
- **Leghe private** (gruppo di amici, 5-12 persone)
- **Leghe pubbliche** (fino a 20+ partecipanti)
- **Modalità:** Classic e Mantra
- **Flusso semi-automatico:** l'Admin sceglie il giocatore da mettere all'asta, il timer e i rilanci sono gestiti automaticamente dal sistema.
- **Playing Admin:** l'Admin partecipa all'asta come giocatore normale, oltre a gestirla.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENTS                            │
│                                                         │
│   ┌─────────────┐              ┌─────────────────┐      │
│   │  Angular     │              │  Flutter         │      │
│   │  (Web App)   │              │  (iOS/Android)   │      │
│   │  Admin-first │              │  Player-first    │      │
│   └──────┬──────┘              └───────┬─────────┘      │
│          │                             │                │
└──────────┼─────────────────────────────┼────────────────┘
           │ HTTPS + WSS                 │ HTTPS + WSS
           ▼                             ▼
┌─────────────────────────────────────────────────────────┐
│              NODE.JS SERVER (Fly.io)                     │
│                                                         │
│   ┌─────────────────┐    ┌────────────────────────┐     │
│   │  Fastify         │    │  Socket.io              │     │
│   │  (REST API)      │    │  (Real-time Engine)     │     │
│   └────────┬────────┘    └───────────┬────────────┘     │
│            │                         │                  │
│   ┌────────┴─────────────────────────┴────────────┐     │
│   │          IN-MEMORY STATE (Room State)          │     │
│   │  currentPlayer, currentBid, timer, bidders     │     │
│   └────────────────────┬──────────────────────────┘     │
│                        │                                │
└────────────────────────┼────────────────────────────────┘
                         │ TCP
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    SUPABASE                              │
│                                                         │
│   ┌──────────┐  ┌──────────────┐  ┌───────────────┐    │
│   │  Auth     │  │  PostgreSQL   │  │  Storage       │    │
│   │  (JWT)    │  │  (Data)       │  │  (Avatars)     │    │
│   └──────────┘  └──────────────┘  └───────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Responsabilità

| Componente | Ruolo |
|---|---|
| **Supabase Auth** | Registrazione, login, JWT. Unico provider di identità. |
| **Supabase PostgreSQL** | Persistenza: leghe, giocatori, listone, log asta, rose. |
| **Supabase Storage** | Avatar utenti, loghi leghe. |
| **Node.js Server** | Logica di business real-time, validazione rilanci, timer, REST API. |
| **Angular Web** | Interfaccia admin-first (gestione asta, dashboard, setup lega). |
| **Flutter Mobile** | Interfaccia player-first (rilanci rapidi, notifiche, rosa). |

---

## 3. Authentication Architecture

### Flusso Auth — Opzione A: Frontend chiama Supabase direttamente

Il frontend comunica con **due backend** in base all'operazione:

```
┌─────────────────┐
│  Flutter/Angular │
└────┬────────┬───┘
     │        │
     │        │  Login, Signup, OAuth, Reset Password,
     │        │  Refresh Token, Upload Avatar
     │        ▼
     │   ┌──────────────────┐
     │   │  SUPABASE         │
     │   │  (Auth + Storage) │
     │   └──────────────────┘
     │
     │  CRUD Leghe, Import Excel, Reports
     │  + Socket.io (Asta real-time)
     │  [JWT nel header / handshake]
     ▼
┌──────────────────┐       ┌──────────────────┐
│  NODE.JS SERVER  │──────▶│  SUPABASE DB     │
│  (Fastify + WS)  │       │  (service_role)  │
└──────────────────┘       └──────────────────┘
```

**Chi chiama chi — Tabella completa:**

| Operazione | Chi chiama | Destinazione | Note |
|---|---|---|---|
| Signup (email + password) | Frontend | Supabase Auth | `supabase.auth.signUp()` |
| Login (email + password) | Frontend | Supabase Auth | `supabase.auth.signInWithPassword()` |
| OAuth (Google, Apple, ecc.) | Frontend | Supabase Auth | `supabase.auth.signInWithOAuth()` |
| Reset password | Frontend | Supabase Auth | `supabase.auth.resetPasswordForEmail()` |
| Refresh token | Frontend | Supabase Auth | Automatico via SDK (background refresh) |
| Logout | Frontend | Supabase Auth | `supabase.auth.signOut()` + chiude Socket.io |
| Verifica sessione attiva | Frontend | Supabase Auth | `supabase.auth.getSession()` all'avvio app |
| Upload avatar | Frontend | Supabase Storage | `supabase.storage.from('avatars').upload()` |
| Crea lega, join, CRUD | Frontend | **Node.js** | `Authorization: Bearer <jwt>` |
| Import Excel | Frontend | **Node.js** | `Authorization: Bearer <jwt>` + multipart |
| Asta real-time | Frontend | **Node.js** | Socket.io handshake con JWT |

### Ciclo di Vita del Token JWT

```
1. SIGNUP / LOGIN
   Frontend → Supabase Auth
   ← access_token (JWT, 1h TTL) + refresh_token (90 days)

2. TOKEN STORAGE
   Angular:  access_token in memoria, refresh_token in httpOnly cookie
             (oppure localStorage se SPA pura — meno sicuro ma accettabile)
   Flutter:  flutter_secure_storage (Keychain iOS / EncryptedSharedPrefs Android)

3. CHIAMATA API AL SERVER NODE.JS
   Frontend → Node.js:  Header "Authorization: Bearer <access_token>"
   Node.js:             Verifica firma JWT con SUPABASE_JWT_SECRET
                        Estrae user_id dal payload
                        Controlla expiry (exp claim)

4. REFRESH AUTOMATICO
   Supabase SDK gestisce il refresh in background:
   - Angular (@supabase/supabase-js): onAuthStateChange() listener
   - Flutter (supabase_flutter): auto-refresh integrato nel SDK
   Quando il SDK refresha, il nuovo access_token viene usato per le chiamate successive.

5. CONNESSIONE SOCKET.IO
   Frontend apre Socket.io con JWT corrente:
   io('/auction', { auth: { token: currentAccessToken } })
   
   Se il token scade durante una sessione Socket.io lunga (>1h):
   - Il SDK Supabase refresha il token in background
   - Il client emette un evento 'token_refresh' con il nuovo token
   - Il server aggiorna il token associato a quel socket
   - In alternativa: il server accetta token con margine di 5min post-expiry
     e aspetta il refresh, dato che la sessione è già autenticata

6. LOGOUT
   Frontend → supabase.auth.signOut()
   Frontend → socket.disconnect()
   Frontend → Pulisce token dallo storage
   Frontend → Redirect a /login
```

### Validazione JWT Server-Side (Node.js)

Il server Node.js **non usa mai il Supabase SDK per auth**. Valida il JWT in modo autonomo usando il secret condiviso.

```javascript
// middleware/auth.js
const jwt = require('jsonwebtoken');

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

// Middleware Fastify per REST API
async function authMiddleware(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'MISSING_TOKEN' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, SUPABASE_JWT_SECRET, {
      algorithms: ['HS256'],
      // Accetta token scaduti da max 30 secondi (clock skew tolerance)
      clockTolerance: 30,
    });
    request.userId = payload.sub;    // UUID dell'utente Supabase
    request.userRole = payload.role; // 'authenticated'
  } catch (err) {
    return reply.code(401).send({ error: 'INVALID_TOKEN', detail: err.message });
  }
}

// Middleware Socket.io per WebSocket
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('MISSING_TOKEN'));

  try {
    const payload = jwt.verify(token, SUPABASE_JWT_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 30,
    });
    socket.userId = payload.sub;
    next();
  } catch (err) {
    next(new Error('INVALID_TOKEN'));
  }
});
```

### Configurazione Supabase Client-Side

#### Angular

```typescript
// src/app/core/supabase.service.ts
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;
  private session$ = new BehaviorSubject<Session | null>(null);

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey  // ⚠️ Anon key, MAI service_role key!
    );

    // Listener per cambio stato auth (login, logout, token refresh)
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.session$.next(session);
      // event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED'
    });
  }

  // Auth methods — chiamano Supabase direttamente
  signUp(email: string, password: string, username: string) {
    return this.supabase.auth.signUp({
      email,
      password,
      options: { data: { username } }  // Salvato in raw_user_meta_data → usato dal trigger profiles
    });
  }

  signIn(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password });
  }

  signInWithGoogle() {
    return this.supabase.auth.signInWithOAuth({ provider: 'google' });
  }

  signOut() {
    return this.supabase.auth.signOut();
  }

  resetPassword(email: string) {
    return this.supabase.auth.resetPasswordForEmail(email);
  }

  // Token accessor — usato dagli interceptor HTTP e Socket.io
  async getAccessToken(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  getSession$() { return this.session$.asObservable(); }
}
```

```typescript
// src/app/core/auth.interceptor.ts — Inietta JWT in tutte le chiamate al server Node.js
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { from, switchMap } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const supabase = inject(SupabaseService);

  // Solo per chiamate al nostro server, NON per chiamate dirette a Supabase
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  return from(supabase.getAccessToken()).pipe(
    switchMap(token => {
      if (token) {
        req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
      }
      return next(req);
    })
  );
};
```

```typescript
// src/app/core/socket.service.ts — Socket.io con JWT
import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  constructor(private supabase: SupabaseService) {}

  async connect(leagueId: string): Promise<Socket> {
    const token = await this.supabase.getAccessToken();
    if (!token) throw new Error('Not authenticated');

    this.socket = io(`${environment.wsBaseUrl}/auction`, {
      auth: { token },
      transports: ['websocket'],  // Skip polling, vai diretto a WS
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    // Quando il token viene refreshato, aggiorna il socket
    this.supabase.getSession$().subscribe(async session => {
      if (session?.access_token && this.socket?.connected) {
        this.socket.emit('token_refresh', { token: session.access_token });
      }
    });

    // Join room dopo connessione
    this.socket.on('connect', () => {
      this.socket!.emit('join_room', { leagueId });
    });

    return this.socket;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}
```

#### Flutter

```dart
// lib/core/supabase_service.dart
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static SupabaseClient get client => Supabase.instance.client;

  // Inizializzazione — chiamata in main()
  static Future<void> init() async {
    await Supabase.initialize(
      url: const String.fromEnvironment('SUPABASE_URL'),
      anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'), // ⚠️ MAI service_role!
    );
  }

  // Auth
  static Future<AuthResponse> signUp(String email, String password, String username) {
    return client.auth.signUp(
      email: email,
      password: password,
      data: {'username': username},
    );
  }

  static Future<AuthResponse> signIn(String email, String password) {
    return client.auth.signInWithPassword(email: email, password: password);
  }

  static Future<bool> signInWithGoogle() {
    return client.auth.signInWithOAuth(OAuthProvider.google);
  }

  static Future<void> signOut() => client.auth.signOut();

  // Token accessor
  static String? get accessToken => client.auth.currentSession?.accessToken;

  // Sessione corrente
  static Session? get currentSession => client.auth.currentSession;

  // Stream auth state changes
  static Stream<AuthState> get authStateChanges => client.auth.onAuthStateChange;
}
```

```dart
// lib/core/api_client.dart — HTTP client con JWT auto-injection
import 'package:dio/dio.dart';
import 'supabase_service.dart';

class ApiClient {
  late final Dio _dio;

  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: const String.fromEnvironment('API_BASE_URL'),
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ));

    // Interceptor: inietta JWT in ogni richiesta
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = SupabaseService.accessToken;
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) {
        if (error.response?.statusCode == 401) {
          // Token scaduto e refresh fallito → force logout
          SupabaseService.signOut();
        }
        handler.next(error);
      },
    ));
  }

  Dio get dio => _dio;
}
```

```dart
// lib/core/socket_service.dart — Socket.io con JWT
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'supabase_service.dart';

class SocketService {
  io.Socket? _socket;

  void connect(String leagueId) {
    final token = SupabaseService.accessToken;
    if (token == null) throw Exception('Not authenticated');

    _socket = io.io(
      '${const String.fromEnvironment('WS_BASE_URL')}/auction',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .setReconnectionAttempts(10)
          .build(),
    );

    _socket!.onConnect((_) {
      _socket!.emit('join_room', {'leagueId': leagueId});
    });

    // Refresh token su riconnessione
    _socket!.onReconnect((_) {
      final newToken = SupabaseService.accessToken;
      if (newToken != null) {
        _socket!.io.options?['auth'] = {'token': newToken};
        _socket!.emit('join_room', {'leagueId': leagueId});
      }
    });
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }

  io.Socket? get socket => _socket;
}
```

### Gestione Token Refresh durante Sessione Socket.io

Una sessione d'asta può durare ore. Il JWT Supabase scade dopo 1 ora (default). Ecco come gestire il refresh senza interrompere l'asta:

```
Timeline:
0min ───── Login + Socket Connect (JWT valido 1h) ─────────────────────▶
55min ──── Supabase SDK auto-refresh ──────────────────────────────────▶
           ├─ Nuovo access_token ricevuto
           ├─ Client emette socket 'token_refresh' { newToken }
           └─ Server aggiorna token associato al socket
60min ──── Vecchio token scaduto (ma socket già aggiornato) ───────────▶
115min ─── Secondo refresh automatico ─────────────────────────────────▶
           └─ ...ciclo continua...
```

**Server-side handling:**

```javascript
// Evento token_refresh — aggiorna il token associato al socket
socket.on('token_refresh', ({ token }) => {
  try {
    const payload = jwt.verify(token, SUPABASE_JWT_SECRET, {
      algorithms: ['HS256'],
    });
    socket.userId = payload.sub;  // Dovrebbe essere lo stesso user
    socket.token = token;         // Salva nuovo token
  } catch (err) {
    socket.emit('error', { code: 'INVALID_REFRESH_TOKEN' });
  }
});
```

### Auth Guards (Protezione Route)

#### Angular

```typescript
// src/app/core/auth.guard.ts
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);
  const token = await supabase.getAccessToken();
  
  if (token) return true;
  
  router.navigate(['/login']);
  return false;
};

// Uso nelle routes:
// { path: 'league/:id/auction', component: AuctionComponent, canActivate: [authGuard] }
```

#### Flutter

```dart
// lib/core/auth_guard.dart — GoRouter redirect
import 'package:go_router/go_router.dart';
import 'supabase_service.dart';

String? authRedirect(BuildContext context, GoRouterState state) {
  final isLoggedIn = SupabaseService.currentSession != null;
  final isOnLoginPage = state.matchedLocation == '/login';

  if (!isLoggedIn && !isOnLoginPage) return '/login';
  if (isLoggedIn && isOnLoginPage) return '/';
  return null; // No redirect
}

// Uso nel router:
// GoRouter(redirect: authRedirect, routes: [...])
```

### Variabili d'Ambiente — Chiavi Supabase

```
⚠️ REGOLA FONDAMENTALE: il frontend usa SOLO la anon key. MAI la service_role key.

FRONTEND (Angular / Flutter):
  SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_ANON_KEY=eyJ...                  ← Chiave pubblica, sicura da esporre

BACKEND (Node.js Server):
  SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_SERVICE_KEY=eyJ...               ← Chiave admin, MAI esporre al client!
  SUPABASE_JWT_SECRET=xxx                   ← Per validare JWT senza chiamare Supabase
```

La `anon key` è sicura da includere nel bundle frontend perché le Row Level Security (RLS) policies limitano cosa l'utente può fare. La `service_role key` bypassa tutte le RLS ed è usata solo dal server Node.js per operazioni privilegiate (import giocatori, rollback, aggiornamento budget).

---

## 4. Technology Stack

### Backend
| Tecnologia | Versione | Scopo |
|---|---|---|
| Node.js | 20+ | Runtime |
| Fastify | 5+ | REST API framework (bassa latenza) |
| Socket.io | 4+ | WebSocket con fallback |
| Zod | 3+ | Validazione schema input |
| `xlsx` (SheetJS) | latest | Parsing listone Excel |
| Supabase JS | 2+ | Client DB e Auth |

### Frontend — Angular (Web)
| Tecnologia | Scopo |
|---|---|
| Angular | 18+ (standalone components, signals) |
| Tailwind CSS | Styling |
| PrimeNG o Angular Material | UI Components |
| NgRx Signals / Signal Store | State management |
| @supabase/supabase-js | Auth + Storage (chiamate dirette a Supabase) |
| socket.io-client | Real-time |
| TanStack Query (Angular) | Caching chiamate REST |

### Frontend — Flutter (Mobile)
| Tecnologia | Scopo |
|---|---|
| Flutter | 3.24+ |
| Riverpod | State management |
| supabase_flutter | Auth + Storage (chiamate dirette a Supabase) |
| socket_io_client | Real-time |
| Dio | HTTP client (chiamate al server Node.js) |
| go_router | Navigation |
| flutter_secure_storage | Token storage (JWT persistence) |

---

## 5. Backend Specifications

### 5.1 REST API Endpoints (Fastify)

#### Profiles (⚠️ Nessun endpoint auth — l'auth è gestita direttamente dal frontend via Supabase SDK)
| Method | Endpoint | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/api/profile/me` | JWT | Profilo utente corrente (legge da DB via service_role) |
| `PATCH` | `/api/profile/me` | JWT | Aggiorna username/avatar |

#### Leagues
| Method | Endpoint | Auth | Descrizione |
|---|---|---|---|
| `POST` | `/api/leagues` | JWT | Crea nuova lega |
| `GET` | `/api/leagues` | JWT | Lista leghe dell'utente |
| `GET` | `/api/leagues/:id` | JWT + Member | Dettaglio lega |
| `PATCH` | `/api/leagues/:id` | JWT + Admin | Aggiorna settings |
| `POST` | `/api/leagues/:id/join` | JWT | Richiesta accesso (password/approval) |
| `POST` | `/api/leagues/:id/members/:memberId/approve` | JWT + Admin | Approva membro |
| `POST` | `/api/leagues/:id/members/:memberId/reject` | JWT + Admin | Rifiuta membro |

#### Players (Listone)
| Method | Endpoint | Auth | Descrizione |
|---|---|---|---|
| `POST` | `/api/leagues/:id/players/import` | JWT + Admin | Upload Excel (multipart) → ritorna preview |
| `POST` | `/api/leagues/:id/players/import/confirm` | JWT + Admin | Conferma import con team mapping |
| `GET` | `/api/leagues/:id/players` | JWT + Member | Lista giocatori con filtri |
| `GET` | `/api/leagues/:id/players/unsold` | JWT + Member | Solo disponibili |
| `GET` | `/api/leagues/:id/players/skipped` | JWT + Admin | Giocatori skippati |

**Import Excel — Flusso a 2 step (vedi `IMPORT_SPEC.md` per dettagli):**
1. `POST .../import`: Upload → parsing → preview (giocatori, fantasquadre trovate, warnings)
2. `POST .../import/confirm`: Admin invia mapping fantasquadre→membri, server esegue import

**Funzionalità chiave:**
- Header detection flessibile con alias multipli
- Giocatori "Fuori lista" esclusi automaticamente
- Import asta in corso: giocatori già assegnati importati come SOLD con budget ricalcolato
- Ruoli Classic (`P/D/C/A`) e Mantra separati (multi-ruolo con `/` → array)
- Dedup su re-import tramite `external_id` (colonna `#` del file)

#### Reports
| Method | Endpoint | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/api/leagues/:id/report/teams` | JWT + Member | Rose di tutti i partecipanti |
| `GET` | `/api/leagues/:id/report/unsold` | JWT + Admin | Report invenduti |
| `GET` | `/api/leagues/:id/auction-logs` | JWT + Member | Storico asta (paginato) |

### 5.2 Server-Side State (In-Memory)

Lo stato "live" dell'asta vive nella RAM del server Node.js. Il DB è troppo lento per i tick del timer.

```javascript
// Struttura per stanza
const roomState = {
  [leagueId]: {
    // Stato asta corrente
    currentPlayer: null,         // Oggetto player dal DB, null se IDLE
    currentBid: 0,               // Offerta corrente
    highestBidderMemberId: null,  // league_members.id del miglior offerente
    timerEndsAt: null,            // Epoch ms — quando scade il timer
    bidCount: 0,                  // Contatore rilanci (per timer decay)

    // Stato stanza
    status: 'IDLE',              // 'IDLE' | 'ACTIVE' | 'PAUSED'
    isPaused: false,

    // Kill Switch
    lastAdminPulse: Date.now(),

    // Cache partecipanti (sincronizzata con DB)
    members: Map<memberId, {
      userId: string,
      username: string,
      budgetCurrent: number,
      slotsFilled: { P: 0, D: 0, C: 0, A: 0 },
      connected: boolean,
      socketId: string | null,
      lastBidAt: number           // Epoch ms — per rate limiting
    }>
  }
};
```

### 5.3 Timer Tick (Global Interval)

```javascript
// Intervallo globale — 100ms
setInterval(() => {
  for (const [leagueId, state] of Object.entries(roomState)) {
    if (state.status !== 'ACTIVE' || state.isPaused) continue;
    if (!state.timerEndsAt) continue;

    if (Date.now() >= state.timerEndsAt) {
      handlePlayerSold(leagueId, state);
    }
  }
}, 100);
```

**`handlePlayerSold(leagueId, state)`:**
1. Scrivi su DB in transazione:
   - `players`: status → SOLD, sold_to, sold_price
   - `league_members`: budget_current decrementato, slots_filled aggiornato
   - `auction_logs`: nuovo record con action = 'SOLD'
2. Aggiorna `roomState.members` cache
3. Pulisci stato: currentPlayer = null, status = 'IDLE'
4. Broadcast `player_sold` a tutta la stanza

---

## 6. Frontend Specifications

### 6.1 App Routing

#### Angular (Web)
```
/                           → Dashboard (le tue leghe, crea lega)
/league/:id/lobby           → Sala d'attesa (stato approvazione)
/league/:id/setup           → Pannello Admin (membri, listone, settings)
/league/:id/auction         → War Room (interfaccia unificata)
```

#### Flutter (Mobile)
```
/                           → Home (lista leghe)
/league/:id                 → Dettaglio lega (lobby/setup tabs)
/league/:id/auction         → War Room (interfaccia unificata)
```

### 6.2 The "War Room" — Interfaccia Unificata

L'interfaccia è **identica** per Admin e User, tranne per la Command Bar visibile solo all'Admin.

#### A. Admin Command Bar

| Piattaforma | Posizione | Layout |
|---|---|---|
| Angular (Web) | Sticky top bar, sfondo scuro | Bottoni inline con shortcut tastiera |
| Flutter (Mobile) | Bottom sheet espandibile / FAB menu | Icone grandi, swipe actions |

**Comandi:**
1. **Play/Pause** — Toggle (Shortcut web: Barra Spaziatrice)
2. **Next Player** — Apre modale ricerca giocatore (solo se IDLE). Include tab "Skippati"
3. **Skip** — Salta giocatore corrente senza venderlo (solo se ACTIVE)
4. **Rollback** — Annulla ultima azione (bottone rosso, richiede conferma)
5. **Status Dot** — Indicatore pulsante heartbeat (verde = connesso)

**Condizione rendering:** `isAdmin === true`

#### B. The Arena (Center View)

**Stato IDLE:**
- Messaggio: "In attesa del battitore..." oppure "Giocatore venduto a [nome]!"
- Animazione coriandoli se venduto

**Stato ACTIVE:**
- Card giocatore: Nome grande, Squadra, Ruolo (badge colorato per ruolo)
- Timer: barra progressiva (web) / cerchio animato (mobile)
  - Colori semaforo: Verde (>60%) → Giallo (30-60%) → Rosso (<30%)
- Prezzo attuale: cifra gigante al centro
- Nome miglior offerente evidenziato

**Stato PAUSED:**
- Overlay semi-trasparente "PAUSA" sopra l'Arena
- Timer congelato

#### C. Bidding Controls (Bottom Fixed)

**L'Admin usa questi stessi controlli per comprare per sé stesso.**

| Elemento | Descrizione |
|---|---|
| Budget personale | "I tuoi crediti: 450" — sempre visibile |
| Pulsanti rapidi | `+1`, `+5`, `+10` (disabilitati se budget insufficiente) |
| Input manuale | Campo numerico + tasto "Offri" |
| Feedback | Vibrazione haptic (mobile), suono ping/error |

**Logica disabilitazione:**
- Pulsanti disabilitati se `currentBid + increment > myBudget`
- Pulsanti disabilitati durante stato IDLE o PAUSED
- Pulsanti disabilitati per 500ms dopo un rilancio (anti-double-tap, allineato con rate limit server)

#### D. Sidebar / Drawer (Info & Stats)

| Tab | Contenuto |
|---|---|
| My Team | Lista compatta giocatori acquistati, raggruppati per ruolo |
| Opponents | Lista avversari con budget residuo real-time e slot occupati (pallini colorati per reparto) |

| Piattaforma | Implementazione |
|---|---|
| Angular (Web) | Sidebar sempre visibile (schermo largo), collassabile |
| Flutter (Mobile) | Drawer laterale con swipe, oppure bottom sheet tabs |

### 6.3 Client-Side State

#### Angular — Signal Store

```typescript
// auction.store.ts
interface AuctionState {
  // Static (set on join)
  isAdmin: boolean;
  myMemberId: string;
  myUserId: string;
  leagueSettings: LeagueSettings;

  // Dynamic (updated via socket events)
  status: 'IDLE' | 'ACTIVE' | 'PAUSED';
  currentPlayer: Player | null;
  currentBid: number;
  highestBidderMemberId: string | null;
  highestBidderName: string | null;
  timerEndsAt: number;         // Server epoch, compensato con offset
  bidCount: number;             // Per calcolo timer decay lato display
  myBudget: number;
  mySlotsFilled: Record<string, number>;
  myTeam: Player[];
  opponents: OpponentInfo[];

  // Computed
  timeRemainingMs: number;      // Calcolato ogni frame con requestAnimationFrame
  canBid: boolean;              // budget >= minBid && status === ACTIVE
  minNextBid: number;           // currentBid + 1
}
```

#### Flutter — Riverpod

```dart
// auction_provider.dart
@riverpod
class AuctionNotifier extends _$AuctionNotifier {
  // Stessa struttura di AuctionState sopra
  // Socket events → state updates via ref.read/watch
}
```

### 6.4 Key Client Behaviors

#### Latency Compensation

Al `connect`, il server emette `server_time` con il suo `Date.now()`. Il client calcola:
```
offset = serverTime - clientTime
```
Il timer visualizzato usa: `timerEndsAt - offset - Date.now()` per essere preciso.

#### Optimistic UI (Bidding)

1. Utente clicca "Rilancia"
2. UI disabilita bottoni immediatamente, mostra spinner
3. Socket emette `place_bid`
4. **Successo** (`bid_update` ricevuto): suono "ping", sblocca bottoni
5. **Errore** (`bid_error` ricevuto): suono "error", sblocca bottoni, mostra toast con motivo

#### Admin Heartbeat (Kill Switch)

Componente invisibile, renderizzato solo se Admin:
- `setInterval` ogni 2000ms → emette `admin_pulse`
- Server: se `Date.now() - lastAdminPulse > 10000ms` → forza PAUSA e broadcast `admin_disconnected`
- Quando Admin riconnette → pulse riprende → server toglie pausa automaticamente

---

## 7. WebSocket Protocol

### Namespace & Rooms
- Namespace: `/auction`
- Room: `league_{leagueId}`

### Events Reference

#### Client → Server

| Event | Emitter | Payload | Descrizione |
|---|---|---|---|
| `join_room` | All | `{ leagueId }` | Entra nella stanza |
| `place_bid` | All | `{ amount }` | Rilancio |
| `token_refresh` | All | `{ token }` | Nuovo JWT dopo auto-refresh Supabase |
| `admin_start_player` | Admin | `{ playerId }` | Metti giocatore all'asta |
| `admin_pause` | Admin | `{}` | Pausa asta |
| `admin_resume` | Admin | `{}` | Riprendi asta |
| `admin_skip` | Admin | `{}` | Salta giocatore corrente |
| `admin_rollback` | Admin | `{}` | Annulla ultima azione |
| `admin_pulse` | Admin | `{}` | Heartbeat (ogni 2s) |

#### Server → Client

| Event | Target | Payload | Descrizione |
|---|---|---|---|
| `auction_state` | Joiner | `{ fullState }` | Stato completo alla connessione |
| `new_player_on_auction` | Room | `{ player, timerEndsAt, minBid }` | Nuovo giocatore all'asta |
| `bid_update` | Room | `{ amount, bidderMemberId, bidderName, newTimerEndsAt, bidCount }` | Rilancio valido |
| `bid_error` | Sender | `{ code, message }` | Rilancio rifiutato |
| `player_sold` | Room | `{ player, winnerMemberId, winnerName, price }` | Timer scaduto, venduto |
| `player_skipped` | Room | `{ player }` | Giocatore skippato |
| `auction_paused` | Room | `{}` | Asta in pausa |
| `auction_resumed` | Room | `{ newTimerEndsAt }` | Asta ripresa con timer aggiornato |
| `rollback_executed` | Room | `{ restoredState }` | Rollback eseguito |
| `admin_disconnected` | Room | `{}` | Admin offline, pausa forzata |
| `admin_reconnected` | Room | `{}` | Admin tornato online |
| `member_connected` | Room | `{ memberId, username }` | Utente connesso |
| `member_disconnected` | Room | `{ memberId, username }` | Utente disconnesso |
| `server_time` | Joiner | `{ timestamp }` | Per latency compensation |

### Bid Validation Flow (Server-Side)

```
place_bid { amount } ricevuto
│
├─ Stato stanza === ACTIVE?          → No → bid_error { code: 'NOT_ACTIVE' }
├─ isPaused === false?               → No → bid_error { code: 'PAUSED' }
├─ Date.now() < timerEndsAt?         → No → bid_error { code: 'EXPIRED' }
├─ amount > currentBid?              → No → bid_error { code: 'TOO_LOW' }
├─ amount <= member.budgetCurrent?   → No → bid_error { code: 'INSUFFICIENT_BUDGET' }
├─ Date.now() - member.lastBidAt >= 500?  → No → bid_error { code: 'RATE_LIMITED' }
│
└─ VALID:
   ├─ Aggiorna roomState (sincrono, nessun await)
   ├─ member.lastBidAt = Date.now()
   ├─ Calcola nuovo timerEndsAt (con decay)
   └─ Broadcast bid_update
```

---

## 8. Security & Rate Limiting

### Rate Limiting (v1)

| Tipo | Limite | Implementazione |
|---|---|---|
| Rilanci per utente | Max 1 ogni 500ms | Check `lastBidAt` in-memory |
| Connessioni per IP | Max 3/minuto | Middleware Socket.io |
| API REST | 100 req/min per utente | Fastify rate-limit plugin |
| Import Excel | 1/minuto per lega | Custom middleware |

### Validazione

- **Tutta la validazione è server-side.** Il client non è mai trusted.
- JWT verificato all'handshake E ad ogni evento (vedi [Sezione 3 — Authentication Architecture](#3-authentication-architecture) per dettagli implementativi)
- Token refresh gestito durante sessioni lunghe via evento `token_refresh`
- Input sanitizzato con Zod su tutti gli endpoint REST
- Socket events validati con schema prima del processing
- Admin actions verificano `member.role === 'ADMIN'` ad ogni chiamata

### Anti-Cheat

- Il server è l'unica fonte di verità per bid, timer e stato
- Il client non può modificare il timer o il prezzo corrente
- Rilanci con importo impossibile (es. > budget) sono rigettati silenziosamente
- Nessun dato sensibile (password hash, email altri utenti) transita nei socket events

---

## 9. Timer System

### Timer Decrescente Progressivo

Per evitare aste infinite con molti partecipanti, il timer si accorcia progressivamente.

```
Configurazione di default (modificabile dall'Admin):

timer_seconds: 15          // Durata base
timer_decay_enabled: true  // Attivabile/disattivabile
timer_decay_rules: [
  { from_bid: 1,  to_bid: 3,  seconds: 15 },  // Primi 3 rilanci: 15s
  { from_bid: 4,  to_bid: 8,  seconds: 10 },  // Rilanci 4-8: 10s
  { from_bid: 9,  to_bid: 15, seconds: 7  },  // Rilanci 9-15: 7s
  { from_bid: 16, to_bid: 999, seconds: 5 }   // Oltre 15: 5s (minimo)
]
```

**Calcolo:**
```javascript
function getTimerDuration(bidCount, settings) {
  if (!settings.timer_decay_enabled) {
    return settings.timer_seconds * 1000;
  }
  const rule = settings.timer_decay_rules
    .find(r => bidCount >= r.from_bid && bidCount <= r.to_bid);
  return (rule?.seconds ?? settings.timer_seconds) * 1000;
}
```

Ad ogni rilancio valido:
```javascript
state.bidCount++;
const duration = getTimerDuration(state.bidCount, leagueSettings);
state.timerEndsAt = Date.now() + duration;
```

### Timer durante Pausa

Quando l'admin mette in pausa:
1. Calcola `remainingMs = timerEndsAt - Date.now()`
2. Salva `remainingMs` nello stato
3. Al resume: `timerEndsAt = Date.now() + remainingMs`

---

## 10. Reconnection Strategy

### Principio: Rejoin trasparente, nessun grace period

**Utente si disconnette e riconnette:**
1. Il client ri-emette `join_room`
2. Il server risponde con `auction_state` completo:
   - Giocatore corrente, bid attuale, timer rimanente
   - La sua rosa, il suo budget
   - Budget e slot di tutti gli avversari
3. L'utente torna esattamente dove era

**Rilancio durante disconnessione:**
- Se il server aveva già processato il rilancio → il rilancio è salvo
- Se la disconnessione è avvenuta prima del processing → il rilancio è perso
- Accettabile: il timer si resetta ad ogni rilancio, l'utente avrà tempo di rilanciare

**Admin si disconnette:**
- Kill switch attiva pausa automatica dopo 10s senza pulse
- Tutti gli utenti vedono "Admin disconnesso — Asta in pausa"
- Admin riconnette → pulse riprende → pausa rimossa automaticamente

**Nessun grace period** — aggiunge complessità senza beneficio reale dato il reset del timer.

---

## 11. Race Condition Handling

### Problema
Due utenti rilanciano "simultaneamente". Es: bid corrente = 12, entrambi offrono 15.

### Soluzione: Processing sincrono in-memory

Node.js è single-threaded. La validazione del rilancio avviene **interamente sullo stato in-memory senza await**:

```javascript
// NESSUN await tra lettura e scrittura — atomico nel event loop
function processBid(leagueId, memberId, amount) {
  const state = roomState[leagueId];

  // Lettura
  if (amount <= state.currentBid) return { error: 'TOO_LOW' };
  if (amount > state.members.get(memberId).budgetCurrent) return { error: 'INSUFFICIENT_BUDGET' };

  // Scrittura — eseguita nello stesso tick
  state.currentBid = amount;
  state.highestBidderMemberId = memberId;
  state.bidCount++;
  state.timerEndsAt = Date.now() + getTimerDuration(state.bidCount, settings);

  return { success: true };
}
```

**Risultato:**
```
Rilancio A (15€) → entra nel tick → currentBid = 12 → valido → currentBid = 15
Rilancio B (15€) → tick successivo → currentBid = 15 → 15 > 15? NO → rejected
```

**Regola critica:** Le scritture su DB (auction_logs, player update) avvengono **dopo** l'aggiornamento in-memory, in modo asincrono. Non bloccano mai il flusso dei rilanci.

---

## 12. Admin "Playing Admin" Flow

### Principio
L'Admin ha **due ruoli simultanei** sulla stessa interfaccia:
1. **Gestore** — Sceglie giocatori, pausa, skip, rollback (Command Bar)
2. **Giocatore** — Rilancia, compra giocatori (Bidding Controls)

### Implementazione

- L'Admin è un record in `league_members` con `role = 'ADMIN'`
- Ha budget, slot e rosa come tutti gli altri
- I suoi rilanci passano per la stessa validazione server-side
- Non ha vantaggi: stesso rate limiting, stessa finestra temporale

### UX Separation

La Command Bar (azioni admin) è visivamente separata dai Bidding Controls (azioni giocatore):
- **Command Bar:** sfondo scuro, in alto (web) o bottom sheet (mobile)
- **Bidding Controls:** area chiara in basso, identica per tutti

Questo previene click accidentali tra azioni admin e rilanci.

---

## 13. Deployment

### Infrastruttura v1

| Servizio | Provider | Piano |
|---|---|---|
| Database + Auth + Storage | Supabase | Free / Pro |
| Node.js Server | Fly.io | 1x shared-cpu, 256MB (scale to 2x se necessario) |
| Frontend Web (Angular) | Vercel o Netlify | Free tier |
| Frontend Mobile (Flutter) | App Store / Play Store | — |

### Environment Variables

**Server Node.js (Fly.io) — PRIVATE, mai esporre:**
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...       # Bypassa RLS — solo per operazioni server privilegiate
SUPABASE_JWT_SECRET=xxx           # Per validare JWT senza chiamare Supabase
PORT=3000
NODE_ENV=production
CORS_ORIGINS=https://app.fantabid.com,http://localhost:4200
```

**Angular Web (Vercel) — PUBLIC, sicure da esporre nel bundle:**
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...          # Chiave pubblica, limitata da RLS
API_BASE_URL=https://api.fantabid.com
WS_BASE_URL=https://api.fantabid.com
```

**Flutter Mobile — PUBLIC, compilate nel binary:**
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...          # Chiave pubblica, limitata da RLS
API_BASE_URL=https://api.fantabid.com
WS_BASE_URL=https://api.fantabid.com
```

> ⚠️ La `anon key` è sicura nel frontend perché le RLS policies proteggono i dati.
> La `service_role key` bypassa TUTTE le RLS e va usata SOLO nel server Node.js.

### Deploy Flow

```
GitHub Push → CI/CD
├─ Server: fly deploy (Dockerfile)
├─ Web: Vercel auto-deploy (Angular SSR/SSG)
└─ Mobile: Codemagic / manual build
```

---

## 14. V2 Roadmap

Features escluse dalla v1, da implementare successivamente:

| Feature | Priorità | Note |
|---|---|---|
| **Redis crash recovery** | Alta | Upstash. Snapshot stato ogni 5s. Recovery automatico al riavvio. |
| **Push notifications (FCM)** | Alta | Notifiche quando app in background: "Giocatore X in asta!", "Sei stato superato!" |
| **Wakelock mobile** | Media | Mantieni schermo acceso durante asta attiva |
| **Chat in-game** | Media | Messaggi real-time nella War Room (reazioni rapide, sticker) |
| **Draft mode** | Bassa | Modalità draft a turni alternativa all'asta |
| **Statistiche avanzate** | Bassa | Grafici spesa per ruolo, analisi andamento asta |
| **Multi-admin** | Bassa | Più admin per lega, con permessi granulari |
| **Horizontal scaling** | Bassa | Redis adapter per Socket.io, multi-instance |
