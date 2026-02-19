# ⚽ FantaBid

App per aste del fantacalcio in tempo reale.

## Panoramica

FantaBid gestisce aste di fantacalcio con rilanci in tempo reale, timer intelligente con decay progressivo e supporto per leghe private e pubbliche.

**Funzionalità principali:**

- **Leghe private e pubbliche** — da 5 a 20+ partecipanti
- **Modalità Classic e Mantra** — con ruoli e roster limits configurabili
- **Asta semi-automatica** — l'Admin sceglie il giocatore, il sistema gestisce timer e rilanci
- **Playing Admin** — l'Admin partecipa all'asta come giocatore normale
- **Import listone** — da file Excel (.xlsx) con supporto asta in corso
- **Rollback** — annulla l'ultima vendita con ripristino completo

## Architettura

```
┌──────────────┐
│  Angular     │
│  (Web)       │
└──────┬───────┘
  │  HTTPS + WSS
  ▼
┌─────────────────────────────────────────┐
│  Node.js Server (Fly.io)               │
│  Fastify (REST) + Socket.io (Real-time)│
└────────────────┬────────────────────────┘
                 │  TCP
                 ▼
┌─────────────────────────────────────────┐
│  Supabase (Auth + PostgreSQL + Storage) │
└─────────────────────────────────────────┘
```

## Struttura Progetto

```
fantabid/
├── server/          # Node.js — Fastify + Socket.io
├── web/             # Angular 18+ — interfaccia admin-first
├── docs/            # Documentazione architetturale
│   ├── ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── IMPORT_SPEC.md
│   └── DEVELOPMENT_TODO.md
└── shared/          # Tipi condivisi (opzionale)
```

## Tech Stack

| Componente   | Tecnologie                                              |
| ------------ | ------------------------------------------------------- |
| **Backend**  | Node.js 20+, Fastify 5+, Socket.io 4+, Zod, SheetJS     |
| **Web**      | Angular 18+, Tailwind CSS, NgRx Signals, TanStack Query |
| **Database** | Supabase (PostgreSQL 15+, Auth, Storage)                |
| **Deploy**   | Fly.io (server), Vercel (web)                           |

> Nota roadmap: la versione iniziale è **solo web**. La app mobile verrà implementata in una fase successiva.

## Setup Locale

### Prerequisiti

- Node.js 20+
- Angular CLI 18+
- Account Supabase con progetto creato

### Variabili d'Ambiente

**Server (`server/.env`):**

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_JWT_SECRET=xxx
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:4200
```

**Web (`web/src/environments/environment.ts`):**

```typescript
export const environment = {
  production: false,
  supabaseUrl: "https://xxx.supabase.co",
  supabaseAnonKey: "eyJ...",
  apiBaseUrl: "http://localhost:3000",
  wsBaseUrl: "http://localhost:3000",
};
```

### Avvio

```bash
# Backend
cd server
npm install
npm run dev

# Web
cd web
npm install
ng serve
```

## Documentazione

| Documento                                       | Contenuto                                                     |
| ----------------------------------------------- | ------------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)         | Architettura completa, auth, WebSocket protocol, timer system |
| [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)   | Schema PostgreSQL, RLS policies, funzioni DB                  |
| [IMPORT_SPEC.md](docs/IMPORT_SPEC.md)           | Parsing Excel, flusso import a 2 step                         |
| [DEVELOPMENT_TODO.md](docs/DEVELOPMENT_TODO.md) | Checklist di sviluppo fase per fase                           |

## Fasi di Sviluppo

| Fase | Descrizione                  | Stima       |
| ---- | ---------------------------- | ----------- |
| 0    | Setup & infrastruttura       | 1-2 giorni  |
| 1    | Database & Auth              | 3-5 giorni  |
| 2    | Leghe CRUD                   | 5-7 giorni  |
| 3    | Import listone Excel         | 4-6 giorni  |
| 4    | Real-time engine (core asta) | 7-10 giorni |
| 5    | Frontend War Room            | 7-10 giorni |
| 6    | Report & polish              | 3-5 giorni  |
| 7    | Testing & deploy             | 3-5 giorni  |

## Licenza

Progetto privato — tutti i diritti riservati.
