# DEVELOPMENT TODO — FantaBid v1.0

> Step-by-step checklist per lo sviluppo. Ogni fase dipende dalla precedente.
> Riferimenti: `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `IMPORT_SPEC.md`

---

## Fase 0 — Setup Iniziale & Infrastruttura
> Obiettivo: avere tutti i progetti creati, i repo inizializzati, e gli ambienti pronti.

### 0.1 Repository & Monorepo Structure
- [ ] Creare repo GitHub (mono o multi-repo)
- [ ] Definire struttura cartelle:
  ```
  fantabid/
  ├── server/          # Node.js (Fastify + Socket.io)
  ├── web/             # Angular
  ├── mobile/          # Flutter
  ├── docs/            # ARCHITECTURE.md, DATABASE_SCHEMA.md, IMPORT_SPEC.md
  └── shared/          # Tipi condivisi (opzionale)
  ```
- [ ] Configurare `.gitignore` per Node, Angular, Flutter
- [ ] Creare `README.md` principale con istruzioni setup

### 0.2 Supabase Project
- [ ] Creare progetto su Supabase (dashboard.supabase.com)
- [ ] Annotare chiavi: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`
- [ ] Abilitare estensione `pg_trgm` (da SQL Editor: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`)
- [ ] Abilitare Auth providers: Email/Password (minimo v1)
- [ ] Configurare Supabase Storage: creare bucket `avatars` (public)

### 0.3 Backend Project Init
- [ ] `mkdir server && cd server && npm init -y`
- [ ] Installare dipendenze:
  ```
  npm i fastify @fastify/cors @fastify/multipart @fastify/rate-limit
  npm i socket.io jsonwebtoken zod xlsx
  npm i @supabase/supabase-js
  npm i -D typescript @types/node @types/jsonwebtoken tsx nodemon
  ```
- [ ] Configurare `tsconfig.json`
- [ ] Creare struttura cartelle:
  ```
  server/src/
  ├── index.ts              # Entry point
  ├── config/               # Env vars, Supabase client
  ├── middleware/            # Auth JWT, rate limiting
  ├── routes/               # Fastify REST routes
  ├── socket/               # Socket.io handlers
  ├── services/             # Business logic
  ├── lib/                  # Parser Excel, utilities
  └── types/                # Zod schemas, TypeScript types
  ```
- [ ] Creare `.env` con variabili (vedi ARCHITECTURE.md §13)
- [ ] Verificare che `npm run dev` avvia il server senza errori

### 0.4 Angular Project Init
- [ ] `ng new web --standalone --style=scss --routing`
- [ ] Installare dipendenze:
  ```
  npm i @supabase/supabase-js socket.io-client
  npm i tailwindcss @tailwindcss/postcss postcss
  ```
- [ ] Scegliere e installare UI library (PrimeNG o Angular Material)
- [ ] Configurare Tailwind CSS
- [ ] Configurare `environment.ts` / `environment.prod.ts` con `supabaseUrl`, `supabaseAnonKey`, `apiBaseUrl`, `wsBaseUrl`
- [ ] Creare struttura cartelle:
  ```
  web/src/app/
  ├── core/               # SupabaseService, AuthInterceptor, SocketService, Guards
  ├── features/
  │   ├── auth/           # Login, Signup, Reset Password
  │   ├── dashboard/      # Lista leghe, crea lega
  │   ├── league/         # Lobby, Setup, Members
  │   └── auction/        # War Room
  └── shared/             # Componenti riutilizzabili, pipes, directives
  ```
- [ ] Verificare che `ng serve` funziona

### 0.5 Flutter Project Init
- [ ] `flutter create mobile`
- [ ] Aggiungere dipendenze in `pubspec.yaml`:
  ```yaml
  dependencies:
    supabase_flutter: ^2.0.0
    flutter_riverpod: ^2.0.0
    riverpod_annotation: ^2.0.0
    socket_io_client: ^3.0.0
    dio: ^5.0.0
    go_router: ^14.0.0
    flutter_secure_storage: ^9.0.0
  dev_dependencies:
    riverpod_generator: ^2.0.0
    build_runner: ^2.0.0
  ```
- [ ] Configurare Supabase init in `main.dart`
- [ ] Creare struttura cartelle:
  ```
  mobile/lib/
  ├── core/               # SupabaseService, ApiClient, SocketService
  ├── features/
  │   ├── auth/
  │   ├── dashboard/
  │   ├── league/
  │   └── auction/
  ├── models/             # Data classes
  ├── providers/          # Riverpod providers
  └── widgets/            # Componenti riutilizzabili
  ```
- [ ] Verificare che `flutter run` funziona su emulatore

---

## Fase 1 — Database & Auth
> Obiettivo: DB creato, auth funzionante end-to-end su tutti e 3 i progetti.

### 1.1 Database Migration
- [ ] Eseguire SQL in ordine (vedi `DATABASE_SCHEMA.md` §7 Migration Order):
  1. Extensions (`pg_trgm`)
  2. Enums (tutti i `CREATE TYPE`)
  3. Tabella `profiles`
  4. Tabella `leagues`
  5. Tabella `league_members`
  6. Tabella `players`
  7. Tabella `auction_logs`
- [ ] Creare tutti gli indici
- [ ] Abilitare RLS su tutte le tabelle
- [ ] Creare tutte le RLS policies (vedi `DATABASE_SCHEMA.md` §3)
- [ ] Creare funzione + trigger `handle_new_user` (auto-creazione profilo)
- [ ] Creare funzione `sell_player` (transazione vendita)
- [ ] Creare funzione `rollback_last_sale` (transazione rollback)
- [ ] **Test:** creare utente da dashboard Supabase → verificare che `profiles` si popola

### 1.2 Backend — JWT Middleware
- [ ] Implementare `authMiddleware` Fastify (vedi ARCHITECTURE.md §3)
- [ ] Implementare middleware Socket.io per JWT validation
- [ ] Implementare handler `token_refresh` per Socket.io
- [ ] Configurare Supabase client con `service_role` key
- [ ] Creare helper `getUserFromToken(token): { userId, role }`
- [ ] **Test:** chiamata REST senza token → 401, con token valido → 200

### 1.3 Angular — Auth Flow
- [ ] Implementare `SupabaseService` (vedi ARCHITECTURE.md §3 — codice completo)
- [ ] Implementare `AuthInterceptor` (inietta JWT nelle chiamate al server)
- [ ] Implementare `authGuard` (protezione route)
- [ ] Creare pagine:
  - [ ] `/login` — form email + password, bottone Google OAuth
  - [ ] `/signup` — form email + password + username
  - [ ] `/reset-password` — form email
- [ ] Configurare routing con guard sulle rotte protette
- [ ] Gestire redirect post-login (→ `/dashboard`)
- [ ] Gestire redirect post-logout (→ `/login`)
- [ ] **Test E2E:** signup → login → vedo dashboard → logout → redirect a login

### 1.4 Flutter — Auth Flow
- [ ] Implementare `SupabaseService` (vedi ARCHITECTURE.md §3 — codice completo)
- [ ] Implementare `ApiClient` con Dio interceptor (JWT auto-injection)
- [ ] Implementare `authRedirect` per GoRouter
- [ ] Creare screens:
  - [ ] Login screen
  - [ ] Signup screen
  - [ ] Reset password screen
- [ ] Configurare GoRouter con redirect guard
- [ ] Gestire persistenza sessione (app restart → auto-login se token valido)
- [ ] **Test:** signup da Flutter → login → vedo home → kill app → riapro → ancora loggato

### 1.5 Verifica Cross-Platform
- [ ] Signup da Angular → login da Flutter con stesse credenziali → funziona
- [ ] Token generato da Supabase → validato correttamente dal server Node.js
- [ ] `profiles` popolata correttamente con username da signup

---

## Fase 2 — Leghe (CRUD)
> Obiettivo: creare, unirsi, gestire leghe da web e mobile.

### 2.1 Backend — API Leghe
- [ ] `POST /api/leagues` — Crea lega (con settings di default)
  - [ ] Crea anche il record `league_members` per l'admin (role=ADMIN, status=APPROVED)
  - [ ] Validazione Zod su body (name, mode, access_type, settings)
- [ ] `GET /api/leagues` — Lista leghe dell'utente (join su league_members)
- [ ] `GET /api/leagues/:id` — Dettaglio lega (con lista membri)
  - [ ] Middleware: verificare che utente è membro (o lega è OPEN)
- [ ] `PATCH /api/leagues/:id` — Aggiorna settings
  - [ ] Middleware: solo admin
  - [ ] Validazione Zod su settings JSONB
- [ ] `POST /api/leagues/:id/join` — Richiesta accesso
  - [ ] Se OPEN → auto-approve
  - [ ] Se PASSWORD → verifica bcrypt hash
  - [ ] Se APPROVAL → status = PENDING
- [ ] `POST /api/leagues/:id/members/:memberId/approve` — Approva membro
- [ ] `POST /api/leagues/:id/members/:memberId/reject` — Rifiuta membro
- [ ] **Test:** creare lega → join con altro utente → approve → lista membri = 2

### 2.2 Angular — Dashboard & League Setup
- [ ] Dashboard (`/`)
  - [ ] Lista "Le tue leghe" (card con nome, mode, status, num membri)
  - [ ] Bottone "Crea Lega" → modale/pagina di creazione
  - [ ] Bottone "Unisciti a Lega" → input codice/ricerca
- [ ] Creazione lega
  - [ ] Form: nome, modalità (Classic/Mantra), tipo accesso, password (opzionale)
  - [ ] Settings avanzati: budget, timer, roster limits
- [ ] Lobby (`/league/:id/lobby`)
  - [ ] Lista membri con stato (PENDING/APPROVED)
  - [ ] Se admin: bottoni Approva/Rifiuta
  - [ ] Se user pending: messaggio "In attesa di approvazione"
- [ ] Setup (`/league/:id/setup`) — Solo Admin
  - [ ] Gestione membri (lista, approva, rifiuta, rimuovi)
  - [ ] Modifica settings lega
  - [ ] Upload listone (→ Fase 3)

### 2.3 Flutter — Dashboard & League Join
- [ ] Home screen
  - [ ] Lista leghe (pull to refresh)
  - [ ] FAB "Crea Lega" / "Unisciti"
- [ ] Creazione lega (form semplificato, mobile-friendly)
- [ ] Dettaglio lega / Lobby
  - [ ] Tab membri con stato
  - [ ] Se admin: azioni gestione membri
- [ ] **Test:** creare lega da Angular → unirsi da Flutter → admin approva da Angular → Flutter vede APPROVED

---

## Fase 3 — Import Listone
> Obiettivo: upload Excel funzionante con preview e mapping fantasquadre.

### 3.1 Backend — Parser Excel
- [ ] Implementare `parseListone(buffer)` (vedi IMPORT_SPEC.md §8)
  - [ ] Header detection flessibile con alias
  - [ ] Skip righe "Fuori lista"
  - [ ] Skip righe con nome vuoto
  - [ ] Parsing ruoli Classic (uppercase, trim)
  - [ ] Parsing ruoli Mantra (split su `/`)
  - [ ] Parsing costo come stringa → parseInt
  - [ ] Determinazione status (SOLD se ha fantateam + costo)
- [ ] Validazione con Zod (`ImportedPlayerSchema`)
- [ ] Raccolta errori per riga (non bloccare su singolo errore)
- [ ] **Test unitario:** parsare il file Excel di esempio → 525 giocatori, 130 esclusi, 0 errori

### 3.2 Backend — API Import (2 step)
- [ ] `POST /api/leagues/:id/players/import` (Step 1 — Preview)
  - [ ] Accetta multipart file upload
  - [ ] Chiama `parseListone`
  - [ ] Salva risultato in cache temporanea (memory o Redis) con TTL 10min
  - [ ] Ritorna preview JSON (totali, fantasquadre, warnings)
- [ ] `POST /api/leagues/:id/players/import/confirm` (Step 2 — Conferma)
  - [ ] Riceve `teamMapping` + `overwriteExisting`
  - [ ] Se `overwriteExisting`: DELETE tutti i players della lega
  - [ ] INSERT giocatori (batch insert per performance)
  - [ ] Per ogni mapping: UPDATE players (sold_to, price), UPDATE league_members (budget, slots)
  - [ ] INSERT auction_logs per ogni vendita importata
  - [ ] Tutto in transazione DB
- [ ] Validazione Zod su `ImportConfirmSchema`
- [ ] **Test:** upload file → preview corretto → conferma con mapping → DB popolato correttamente

### 3.3 Angular — UI Import
- [ ] Screen Upload: drag & drop zona + file picker (solo .xlsx)
- [ ] Screen Preview: mostra statistiche (importabili, esclusi, venduti, disponibili, warnings)
- [ ] Screen Mapping: tabella fantasquadra → dropdown membro lega
  - [ ] Mostra num giocatori e spesa totale per fantasquadra
  - [ ] Opzione "Nessuno" per non mappare
- [ ] Screen Result: riepilogo import con conteggi
- [ ] Gestione errori: mostra errori di parsing per riga

### 3.4 Flutter — UI Import (Semplificata)
- [ ] File picker per selezionare .xlsx
- [ ] Preview screen (stesse info del web)
- [ ] Mapping screen (lista con dropdown)
- [ ] Result screen
- [ ] **Test E2E:** upload da Angular con file reale → 525 giocatori importati → visibili anche da Flutter

---

## Fase 4 — Real-Time Engine (Core Asta)
> Obiettivo: Socket.io funzionante con tutto il flusso asta base.
> Questa è la fase più critica dell'app.

### 4.1 Backend — Socket.io Setup
- [ ] Configurare Socket.io con namespace `/auction`
- [ ] Implementare middleware auth JWT sul namespace
- [ ] Implementare handler `join_room`:
  - [ ] Verifica utente è membro APPROVED della lega
  - [ ] Aggiunge socket alla room `league_{leagueId}`
  - [ ] Carica membri dal DB nella cache in-memory (se non già caricati)
  - [ ] Emette `auction_state` con stato corrente completo
  - [ ] Emette `server_time` per latency compensation
  - [ ] Broadcast `member_connected` alla room
- [ ] Implementare handler `disconnect`:
  - [ ] Aggiorna `connected: false` nella cache
  - [ ] Broadcast `member_disconnected`

### 4.2 Backend — Room State Management
- [ ] Implementare struttura `roomState` in-memory (vedi ARCHITECTURE.md §5.2)
- [ ] Funzione `initRoom(leagueId)`: carica membri e settings dal DB
- [ ] Funzione `destroyRoom(leagueId)`: pulizia quando tutti disconnessi
- [ ] Funzione `getRoomState(leagueId)`: serializza stato per il client

### 4.3 Backend — Admin Controls
- [ ] `admin_start_player`:
  - [ ] Verifica role === ADMIN
  - [ ] Verifica stato === IDLE
  - [ ] Carica player dal DB, verifica status === AVAILABLE o SKIPPED
  - [ ] Imposta roomState: currentPlayer, currentBid = minStartBid, bidCount = 0
  - [ ] Calcola timerEndsAt
  - [ ] Inserisce log `START_PLAYER`
  - [ ] Broadcast `new_player_on_auction`
- [ ] `admin_pause`:
  - [ ] Salva `remainingMs = timerEndsAt - Date.now()`
  - [ ] isPaused = true
  - [ ] Inserisce log `PAUSE`
  - [ ] Broadcast `auction_paused`
- [ ] `admin_resume`:
  - [ ] `timerEndsAt = Date.now() + remainingMs`
  - [ ] isPaused = false
  - [ ] Inserisce log `RESUME`
  - [ ] Broadcast `auction_resumed` con nuovo timerEndsAt
- [ ] `admin_skip`:
  - [ ] UPDATE player status = SKIPPED su DB
  - [ ] Pulisci roomState
  - [ ] Inserisce log `SKIP`
  - [ ] Broadcast `player_skipped`
- [ ] `admin_rollback`:
  - [ ] Chiama funzione DB `rollback_last_sale`
  - [ ] Aggiorna cache in-memory (ripristina budget/slot del membro)
  - [ ] Broadcast `rollback_executed`

### 4.4 Backend — Bidding Logic
- [ ] Implementare `processBid(leagueId, memberId, amount)` — SINCRONO, nessun await
  - [ ] Validazione completa (vedi ARCHITECTURE.md §7 — Bid Validation Flow)
  - [ ] Rate limiting check (500ms)
  - [ ] Aggiornamento roomState
  - [ ] Calcolo timer con decay (vedi ARCHITECTURE.md §9)
- [ ] Handler Socket `place_bid`:
  - [ ] Chiama processBid
  - [ ] Se successo → broadcast `bid_update`
  - [ ] Se errore → emit `bid_error` solo al sender

### 4.5 Backend — Timer Tick
- [ ] Implementare global `setInterval(100ms)` (vedi ARCHITECTURE.md §5.3)
- [ ] Implementare `handlePlayerSold`:
  - [ ] Chiama funzione DB `sell_player` in transazione
  - [ ] Aggiorna cache in-memory
  - [ ] Pulisci stato stanza → IDLE
  - [ ] Broadcast `player_sold`

### 4.6 Backend — Kill Switch
- [ ] Handler `admin_pulse`: aggiorna `lastAdminPulse`
- [ ] Check periodico (ogni 5s): se `now - lastAdminPulse > 10s` → forza pausa
- [ ] Broadcast `admin_disconnected`
- [ ] Auto-rimozione pausa quando pulse riprende → broadcast `admin_reconnected`

### 4.7 **Test Backend Real-Time (Critico)**
- [ ] Test con 2 client simulati: admin + user
- [ ] Test: admin mette giocatore all'asta → user vede `new_player_on_auction`
- [ ] Test: user rilancia → admin vede `bid_update` → timer si resetta
- [ ] Test: timer scade → `player_sold` emesso → budget aggiornato → stato IDLE
- [ ] Test: 2 rilanci "simultanei" → solo il primo passa, il secondo riceve errore
- [ ] Test: rilancio > budget → `bid_error INSUFFICIENT_BUDGET`
- [ ] Test: rilancio durante pausa → `bid_error PAUSED`
- [ ] Test: admin pause → resume → timer riparte dal punto giusto
- [ ] Test: admin skip → player SKIPPED → admin può rimetterlo all'asta
- [ ] Test: admin rollback → budget ripristinato, giocatore torna AVAILABLE
- [ ] Test: admin disconnect → pausa automatica dopo 10s → reconnect → riprende

---

## Fase 5 — Frontend War Room
> Obiettivo: interfaccia d'asta completa e funzionante su Angular e Flutter.

### 5.1 Angular — Socket Service & Auction Store
- [ ] Implementare `SocketService` con gestione connessione/riconnessione (vedi ARCHITECTURE.md §3)
- [ ] Implementare `AuctionStore` con Signal Store:
  - [ ] Stato: status, currentPlayer, currentBid, highestBidder, timerEndsAt, myBudget, myTeam, opponents
  - [ ] Actions: addBid, adminAction
  - [ ] Computed: timeRemainingMs, canBid, minNextBid
- [ ] Implementare latency compensation (offset calcolo)
- [ ] Implementare timer display con `requestAnimationFrame`

### 5.2 Angular — War Room Components
- [ ] Arena Component (center):
  - [ ] Stato IDLE: messaggio "In attesa..." / "Venduto a X!" con animazione
  - [ ] Stato ACTIVE: card giocatore, timer (barra progressiva con colori semaforo), prezzo, nome vincitore
  - [ ] Stato PAUSED: overlay "PAUSA"
- [ ] Admin Command Bar (sticky top):
  - [ ] Renderizzato solo se `isAdmin`
  - [ ] Bottoni: Play/Pause, Next Player (modale ricerca), Skip, Rollback (con conferma)
  - [ ] Status dot heartbeat
  - [ ] Shortcut tastiera: Spazio = Play/Pause
- [ ] Bidding Controls (bottom fixed):
  - [ ] Display budget personale
  - [ ] Pulsanti rapidi +1, +5, +10 (con logica disabilitazione)
  - [ ] Input manuale + tasto "Offri"
  - [ ] Feedback visivo/sonoro (suono ping/error)
  - [ ] Optimistic UI: disabilita → attendi risposta → riabilita
- [ ] Sidebar (right):
  - [ ] Tab "My Team": lista giocatori presi raggruppati per ruolo
  - [ ] Tab "Opponents": lista avversari con budget e slot real-time
- [ ] Modale "Next Player" (admin):
  - [ ] Ricerca giocatore per nome (fuzzy search)
  - [ ] Filtro per ruolo, squadra
  - [ ] Tab "Skippati" per rimettere all'asta

### 5.3 Flutter — Socket Service & Auction Provider
- [ ] Implementare `SocketService` (vedi ARCHITECTURE.md §3)
- [ ] Implementare `AuctionNotifier` con Riverpod (stessa struttura Angular)
- [ ] Latency compensation
- [ ] Timer display con `Ticker` / `AnimationController`

### 5.4 Flutter — War Room Screens
- [ ] Arena widget (center): card giocatore, timer cerchio animato, prezzo, vincitore
- [ ] Bidding controls (bottom fixed): pulsanti grandi zona pollice, haptic feedback
- [ ] Admin controls: bottom sheet espandibile / FAB menu
- [ ] Drawer laterale: My Team + Opponents tabs
- [ ] Modale ricerca giocatore (admin)
- [ ] Suoni e vibrazioni su bid_update / bid_error / player_sold

### 5.5 **Test E2E War Room (Critico)**
- [ ] Admin da Angular + 2 player da Flutter → asta completa
- [ ] Admin mette giocatore → tutti vedono card + timer
- [ ] Player 1 rilancia → tutti vedono prezzo aggiornato + timer reset
- [ ] Player 2 rilancia sopra → Player 1 vede superamento
- [ ] Timer scade → "Venduto!" su tutti i client → budget aggiornato ovunque
- [ ] Admin pausa durante rilancio → timer congelato su tutti
- [ ] Admin skip → giocatore sparisce → stato IDLE
- [ ] Admin rollback → budget ripristinato su tutti i client
- [ ] Player disconnette → riconnette → vede stato aggiornato
- [ ] Admin disconnette → pausa automatica → tutti vedono "Admin disconnesso"
- [ ] Timer decrescente: dopo 8+ rilanci il timer è visibilmente più corto
- [ ] Admin rilancia per sé stesso tramite Bidding Controls → funziona

---

## Fase 6 — Report & Polish
> Obiettivo: funzionalità secondarie e polish prima del rilascio.

### 6.1 Backend — Report API
- [ ] `GET /api/leagues/:id/report/teams` — Rose complete di tutti i membri
- [ ] `GET /api/leagues/:id/report/unsold` — Giocatori ancora disponibili
- [ ] `GET /api/leagues/:id/auction-logs` — Storico paginato (cursor pagination)

### 6.2 Angular — Report Pages
- [ ] Pagina report rose: tabella per membro con giocatori raggruppati per ruolo
- [ ] Pagina invenduti: lista filtrabile per ruolo/squadra
- [ ] Storico asta: timeline scrollabile con tutti gli eventi

### 6.3 Flutter — Report Screens
- [ ] Stessi report del web, ottimizzati per mobile
- [ ] Pull-to-refresh sulle liste

### 6.4 UI/UX Polish
- [ ] Loading states su tutte le chiamate API
- [ ] Empty states (nessuna lega, nessun giocatore, ecc.)
- [ ] Error handling globale (toast/snackbar)
- [ ] Animazioni: coriandoli su vendita, transizioni card giocatore
- [ ] Responsive design Angular (mobile view della War Room)
- [ ] Dark mode (opzionale ma consigliato)
- [ ] Suoni: pack audio per bid, sold, error, countdown finale
- [ ] Accessibilità base: contrasto colori, font sizes

### 6.5 Profile
- [ ] Pagina profilo utente (username, avatar)
- [ ] Upload avatar → Supabase Storage
- [ ] Visualizzazione avatar nelle liste membri e durante l'asta

---

## Fase 7 — Testing & Deploy
> Obiettivo: test completi, deploy in produzione, beta test.

### 7.1 Testing
- [ ] Unit test backend: parser Excel, processBid, timer logic, rollback
- [ ] Unit test frontend: auction store/provider, timer display, bid validation client-side
- [ ] Integration test: flusso completo auth → crea lega → import → asta → report
- [ ] Load test: simulare 20 client contemporanei su una stanza Socket.io
- [ ] Test di resilienza: kill server durante asta → riavvio → stato perso (documentare per v2 Redis)

### 7.2 Deploy Backend
- [ ] Creare `Dockerfile` per server Node.js
- [ ] Configurare Fly.io app (`fly launch`)
- [ ] Settare env vars su Fly.io (`fly secrets set`)
- [ ] Testare deploy: `fly deploy`
- [ ] Verificare WebSocket funzionante su Fly.io (potrebbe servire config specifica per WS)
- [ ] Configurare custom domain (opzionale): `api.fantabid.com`
- [ ] Configurare health check endpoint (`GET /health`)

### 7.3 Deploy Angular (Web)
- [ ] Configurare progetto su Vercel (o Netlify)
- [ ] Settare env vars di produzione
- [ ] Build produzione: `ng build --configuration production`
- [ ] Verificare deploy automatico su push a `main`
- [ ] Configurare custom domain (opzionale): `app.fantabid.com`

### 7.4 Deploy Flutter (Mobile)
- [ ] Configurare signing Android (keystore)
- [ ] Configurare signing iOS (certificates, provisioning profiles)
- [ ] Build release Android: `flutter build apk --release`
- [ ] Build release iOS: `flutter build ipa --release`
- [ ] Upload su TestFlight (iOS) per beta test
- [ ] Upload su Google Play Console (Android) per beta test / internal track
- [ ] Configurare deep linking (opzionale: link invito lega)

### 7.5 Beta Test
- [ ] Invitare 5-10 amici per test asta reale
- [ ] Monitorare logs server (errori, latenza)
- [ ] Raccogliere feedback UX
- [ ] Fix bug critici
- [ ] Test con connessioni instabili (3G simulato)

---

## Riepilogo Dipendenze tra Fasi

```
Fase 0 (Setup)
  │
  ▼
Fase 1 (DB + Auth)
  │
  ├───────────────┐
  ▼               ▼
Fase 2 (Leghe)  Fase 3 (Import) ← può iniziare in parallelo con Fase 2
  │               │
  └───────┬───────┘
          ▼
        Fase 4 (Real-Time Engine) ← dipende da Fase 2 + 3
          │
          ▼
        Fase 5 (Frontend War Room) ← dipende da Fase 4
          │
          ▼
        Fase 6 (Report & Polish)
          │
          ▼
        Fase 7 (Testing & Deploy)
```

## Stima Tempi (sviluppatore singolo, part-time)

| Fase | Stima | Note |
|---|---|---|
| Fase 0 — Setup | 1-2 giorni | One-time, veloce |
| Fase 1 — DB + Auth | 3-5 giorni | Migration + auth su 3 piattaforme |
| Fase 2 — Leghe CRUD | 5-7 giorni | Backend + Angular + Flutter |
| Fase 3 — Import | 4-6 giorni | Parser + UI 2-step flow |
| Fase 4 — Real-Time | 7-10 giorni | **La più complessa.** Socket.io + timer + race conditions |
| Fase 5 — War Room FE | 7-10 giorni | UI complessa su 2 piattaforme |
| Fase 6 — Report & Polish | 3-5 giorni | Più estetica che logica |
| Fase 7 — Test & Deploy | 3-5 giorni | Infrastruttura + beta |
| **Totale** | **~5-8 settimane** | Part-time, sviluppatore singolo |
