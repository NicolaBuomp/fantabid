# DATABASE SCHEMA — FANTABID v1.0

## Provider: Supabase (PostgreSQL 15+)

---

## 1. Enums

```sql
-- Modalità di gioco
CREATE TYPE league_mode AS ENUM ('CLASSIC', 'MANTRA');

-- Tipo di accesso alla lega
CREATE TYPE access_type AS ENUM ('OPEN', 'PASSWORD', 'APPROVAL');

-- Stato della lega nel suo ciclo di vita
CREATE TYPE league_status AS ENUM ('SETUP', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- Stato del membro nella lega
CREATE TYPE member_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Ruolo del membro (Admin partecipa all'asta)
CREATE TYPE member_role AS ENUM ('ADMIN', 'USER');

-- Stato del giocatore nel listone
CREATE TYPE player_status AS ENUM ('AVAILABLE', 'SOLD', 'SKIPPED');

-- Tipo di azione nel log dell'asta
CREATE TYPE auction_action AS ENUM ('BID', 'SOLD', 'SKIP', 'ROLLBACK', 'PAUSE', 'RESUME', 'START_PLAYER');
```

---

## 2. Tables

### `profiles`

Estensione della tabella `auth.users` di Supabase. Creata automaticamente via trigger on signup.

```sql
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique username
CREATE UNIQUE INDEX idx_profiles_username ON profiles(username);
```

**Trigger auto-creazione profilo:**

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::text, 8)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### `leagues`

```sql
CREATE TABLE leagues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  mode            league_mode NOT NULL DEFAULT 'CLASSIC',
  access_type     access_type NOT NULL DEFAULT 'OPEN',
  password_hash   TEXT,                    -- bcrypt hash, solo se access_type = 'PASSWORD'
  status          league_status NOT NULL DEFAULT 'SETUP',
  max_members     INT NOT NULL DEFAULT 12,
  settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leagues_admin ON leagues(admin_id);
CREATE INDEX idx_leagues_status ON leagues(status);
```

**`settings` JSONB structure:**

```jsonc
{
  // Budget
  "budget_type": "FIXED",       // "FIXED" | "CUSTOM" (custom = budget diverso per membro)
  "base_budget": 500,           // Budget iniziale di default

  // Timer
  "timer_seconds": 15,          // Durata base del timer
  "timer_decay_enabled": true,  // Attiva timer decrescente
  "timer_decay_rules": [
    { "from_bid": 1,  "to_bid": 3,   "seconds": 15 },
    { "from_bid": 4,  "to_bid": 8,   "seconds": 10 },
    { "from_bid": 9,  "to_bid": 15,  "seconds": 7  },
    { "from_bid": 16, "to_bid": 999, "seconds": 5  }
  ],

  // Rosa — limiti per ruolo
  // CLASSIC mode:
  "roster_limits": {
    "P": 3,
    "D": 8,
    "C": 8,
    "A": 6
  },
  // MANTRA mode:
  // "roster_limits": { "Por": 3, "Ds": 4, "Dd": 4, "Dc": 4, "E": 4, "M": 4, "C": 4, "W": 4, "T": 4, "A": 4, "Pc": 4 }

  // Asta
  "min_start_bid": 1            // Offerta minima di partenza
}
```

---

### `league_members`

```sql
CREATE TABLE league_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status          member_status NOT NULL DEFAULT 'PENDING',
  role            member_role NOT NULL DEFAULT 'USER',
  team_name       TEXT,                    -- Nome fantateam (opzionale)
  budget_initial  INT NOT NULL DEFAULT 0,  -- Impostato dall'admin all'avvio
  budget_current  INT NOT NULL DEFAULT 0,
  slots_filled    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Es: {"P": 2, "D": 5, "C": 3, "A": 1}
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un utente può essere in una lega una sola volta
CREATE UNIQUE INDEX idx_league_members_unique ON league_members(league_id, user_id);
CREATE INDEX idx_league_members_league ON league_members(league_id);
CREATE INDEX idx_league_members_user ON league_members(user_id);
CREATE INDEX idx_league_members_status ON league_members(league_id, status);
```

---

### `players`

Il "listone" dei giocatori importato da Excel. Vedi `IMPORT_SPEC.md` per il flusso completo di importazione.

```sql
CREATE TABLE players (
  id              SERIAL PRIMARY KEY,
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  external_id     INT,                          -- Colonna # dal file Excel (ID provider, per dedup)
  name            TEXT NOT NULL,
  team_real       TEXT NOT NULL,                 -- Squadra reale Serie A (es. "Inter")
  roles           TEXT[] NOT NULL DEFAULT '{}',  -- Ruoli Classic: ["P"], ["D"], ["C"], ["A"]
  roles_mantra    TEXT[] NOT NULL DEFAULT '{}',  -- Ruoli Mantra: ["T", "A"], ["M", "C"], ["W", "T", "A"]
  fvm             INT NOT NULL DEFAULT 1,        -- Fantavalutazione media (/1000)
  age             INT,                           -- Età giocatore
  games_played    INT,                           -- Partite giocate con voto (PGv)
  avg_rating      NUMERIC(4,2),                  -- Media voto (MV)
  avg_fanta       NUMERIC(4,2),                  -- Fantamedia (FM)
  quotation       INT,                           -- Quotazione iniziale
  status          player_status NOT NULL DEFAULT 'AVAILABLE',
  sold_to         UUID REFERENCES league_members(id) ON DELETE SET NULL,
  sold_price      INT,
  sold_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_league ON players(league_id);
CREATE INDEX idx_players_league_status ON players(league_id, status);
CREATE INDEX idx_players_sold_to ON players(sold_to);
-- Per ricerca giocatori per nome (case-insensitive, fuzzy search)
CREATE INDEX idx_players_name_trgm ON players USING gin(name gin_trgm_ops);
-- Dedup su re-import: un solo giocatore per external_id per lega
CREATE UNIQUE INDEX idx_players_external_league ON players(league_id, external_id)
  WHERE external_id IS NOT NULL;
```

> **Nota:** L'indice trigram richiede l'estensione `pg_trgm`:
> ```sql
> CREATE EXTENSION IF NOT EXISTS pg_trgm;
> ```

---

### `auction_logs`

Log completo di ogni azione durante l'asta. Usato per rollback, storico e analytics.

```sql
CREATE TABLE auction_logs (
  id          SERIAL PRIMARY KEY,
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  action      auction_action NOT NULL,
  player_id   INT REFERENCES players(id) ON DELETE SET NULL,
  actor_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auction_logs_league ON auction_logs(league_id);
CREATE INDEX idx_auction_logs_league_created ON auction_logs(league_id, created_at DESC);
CREATE INDEX idx_auction_logs_action ON auction_logs(league_id, action);
```

**`payload` examples per action type:**

```jsonc
// action = 'BID'
{
  "amount": 15,
  "bidder_member_id": "uuid",
  "previous_bid": 12,
  "previous_bidder_member_id": "uuid"
}

// action = 'SOLD'
{
  "price": 25,
  "winner_member_id": "uuid",
  "winner_username": "Mario",
  "player_name": "Vlahovic",
  "bid_count": 7
}

// action = 'SKIP'
{
  "player_name": "Vlahovic",
  "reason": "admin_skip"    // o "no_bids"
}

// action = 'ROLLBACK'
// Snapshot dello stato PRE-rollback per audit trail
{
  "rolled_back_action": "SOLD",
  "restored_player_id": 42,
  "restored_player_name": "Vlahovic",
  "restored_budget_to": { "member_id": "uuid", "old_budget": 475, "new_budget": 500 },
  "restored_slots": { "member_id": "uuid", "old_slots": {"A": 3}, "new_slots": {"A": 2} }
}

// action = 'START_PLAYER'
{
  "player_name": "Vlahovic",
  "player_id": 42,
  "min_bid": 1
}

// action = 'PAUSE' / 'RESUME'
{
  "reason": "admin_manual"  // o "admin_disconnected"
}
```

---

## 3. Row Level Security (RLS)

```sql
-- Abilita RLS su tutte le tabelle
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_logs ENABLE ROW LEVEL SECURITY;

-- ===== PROFILES =====

-- Tutti possono vedere i profili (username, avatar)
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Solo il proprietario può modificare il suo profilo
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ===== LEAGUES =====

-- Leghe visibili ai propri membri (o a tutti se OPEN per la lista pubblica)
CREATE POLICY "Leagues viewable by members"
  ON leagues FOR SELECT
  USING (
    access_type = 'OPEN'
    OR admin_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM league_members
      WHERE league_members.league_id = leagues.id
      AND league_members.user_id = auth.uid()
      AND league_members.status = 'APPROVED'
    )
  );

-- Solo utenti autenticati possono creare leghe
CREATE POLICY "Authenticated users can create leagues"
  ON leagues FOR INSERT
  WITH CHECK (auth.uid() = admin_id);

-- Solo admin può modificare la propria lega
CREATE POLICY "Admin can update own league"
  ON leagues FOR UPDATE
  USING (auth.uid() = admin_id);

-- ===== LEAGUE_MEMBERS =====

-- Membri visibili agli altri membri della stessa lega
CREATE POLICY "Members viewable by league members"
  ON league_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM league_members AS lm
      WHERE lm.league_id = league_members.league_id
      AND lm.user_id = auth.uid()
      AND lm.status = 'APPROVED'
    )
  );

-- Chiunque autenticato può richiedere accesso (INSERT con status PENDING)
CREATE POLICY "Users can request to join"
  ON league_members FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'PENDING');

-- Admin può aggiornare status dei membri; utenti possono aggiornare il proprio team_name
CREATE POLICY "Admin or self can update members"
  ON league_members FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM leagues
      WHERE leagues.id = league_members.league_id
      AND leagues.admin_id = auth.uid()
    )
  );

-- ===== PLAYERS =====

-- Giocatori visibili ai membri della lega
CREATE POLICY "Players viewable by league members"
  ON players FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_members.league_id = players.league_id
      AND league_members.user_id = auth.uid()
      AND league_members.status = 'APPROVED'
    )
  );

-- Solo admin (via service key dal server) inserisce/modifica giocatori
-- Le INSERT/UPDATE avvengono dal server Node.js con service_role key, bypassando RLS

-- ===== AUCTION_LOGS =====

-- Log visibili ai membri della lega
CREATE POLICY "Logs viewable by league members"
  ON auction_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_members.league_id = auction_logs.league_id
      AND league_members.user_id = auth.uid()
      AND league_members.status = 'APPROVED'
    )
  );

-- Solo il server (service_role) inserisce log
```

---

## 4. Database Functions

### Transazione "Player Sold"

Usata dal server Node.js quando il timer scade. Eseguita come transazione atomica.

```sql
CREATE OR REPLACE FUNCTION sell_player(
  p_player_id INT,
  p_winner_member_id UUID,
  p_price INT,
  p_league_id UUID,
  p_actor_id UUID,
  p_player_role TEXT  -- Ruolo primario per cui viene acquistato
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_old_budget INT;
  v_old_slots JSONB;
BEGIN
  -- Leggi stato corrente del membro per il payload del log
  SELECT budget_current, slots_filled
  INTO v_old_budget, v_old_slots
  FROM league_members
  WHERE id = p_winner_member_id
  FOR UPDATE;  -- Lock row

  -- Aggiorna giocatore
  UPDATE players
  SET status = 'SOLD',
      sold_to = p_winner_member_id,
      sold_price = p_price,
      sold_at = now()
  WHERE id = p_player_id AND league_id = p_league_id;

  -- Decurta budget
  UPDATE league_members
  SET budget_current = budget_current - p_price,
      slots_filled = jsonb_set(
        slots_filled,
        ARRAY[p_player_role],
        to_jsonb(COALESCE((slots_filled->>p_player_role)::int, 0) + 1)
      ),
      updated_at = now()
  WHERE id = p_winner_member_id;

  -- Scrivi log
  INSERT INTO auction_logs (league_id, action, player_id, actor_id, payload)
  VALUES (
    p_league_id, 'SOLD', p_player_id, p_actor_id,
    jsonb_build_object(
      'price', p_price,
      'winner_member_id', p_winner_member_id,
      'previous_budget', v_old_budget,
      'previous_slots', v_old_slots
    )
  );

  v_result := jsonb_build_object('success', true, 'new_budget', v_old_budget - p_price);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
```

### Transazione "Rollback Last Action"

```sql
CREATE OR REPLACE FUNCTION rollback_last_sale(
  p_league_id UUID,
  p_actor_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_last_log auction_logs%ROWTYPE;
  v_player_id INT;
  v_member_id UUID;
  v_price INT;
  v_prev_budget INT;
  v_prev_slots JSONB;
BEGIN
  -- Trova l'ultima vendita
  SELECT * INTO v_last_log
  FROM auction_logs
  WHERE league_id = p_league_id AND action = 'SOLD'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_last_log IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_SALE_TO_ROLLBACK');
  END IF;

  v_player_id := v_last_log.player_id;
  v_member_id := (v_last_log.payload->>'winner_member_id')::uuid;
  v_price := (v_last_log.payload->>'price')::int;
  v_prev_budget := (v_last_log.payload->>'previous_budget')::int;
  v_prev_slots := v_last_log.payload->'previous_slots';

  -- Ripristina giocatore
  UPDATE players
  SET status = 'AVAILABLE', sold_to = NULL, sold_price = NULL, sold_at = NULL
  WHERE id = v_player_id;

  -- Ripristina budget e slot
  UPDATE league_members
  SET budget_current = v_prev_budget,
      slots_filled = v_prev_slots,
      updated_at = now()
  WHERE id = v_member_id;

  -- Log del rollback
  INSERT INTO auction_logs (league_id, action, player_id, actor_id, payload)
  VALUES (
    p_league_id, 'ROLLBACK', v_player_id, p_actor_id,
    jsonb_build_object(
      'rolled_back_action', 'SOLD',
      'restored_player_id', v_player_id,
      'restored_budget_to', jsonb_build_object('member_id', v_member_id, 'restored_budget', v_prev_budget),
      'restored_slots', v_prev_slots
    )
  );

  RETURN jsonb_build_object('success', true, 'restored_player_id', v_player_id);
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Entity Relationship Diagram

```
┌──────────────┐
│  auth.users  │
│  (Supabase)  │
└──────┬───────┘
       │ 1:1
       ▼
┌──────────────┐       1:N       ┌──────────────┐
│   profiles   │────────────────▶│   leagues     │
│              │  (admin_id)     │              │
└──────┬───────┘                 └──────┬───────┘
       │                                │
       │ 1:N                            │ 1:N
       ▼                                ▼
┌──────────────────┐             ┌──────────────┐
│  league_members  │◀────────────│              │
│                  │  (league_id)│   players    │
│  user_id ──▶ profiles         │  (listone)   │
│  league_id ──▶ leagues        │              │
│                  │◀────────────│  sold_to ──▶ │
└──────┬───────────┘  (sold_to) └──────┬───────┘
       │                                │
       │                                │
       │         ┌──────────────┐       │
       │         │ auction_logs │       │
       └────────▶│              │◀──────┘
    (actor via   │ player_id    │  (player_id)
     profiles)   │ actor_id     │
                 │ league_id    │
                 └──────────────┘
```

---

## 6. Indexes Summary

| Table | Index | Type | Purpose |
|---|---|---|---|
| profiles | `idx_profiles_username` | UNIQUE | Username lookup |
| leagues | `idx_leagues_admin` | B-tree | Admin's leagues |
| leagues | `idx_leagues_status` | B-tree | Filter by status |
| league_members | `idx_league_members_unique` | UNIQUE | One membership per user per league |
| league_members | `idx_league_members_league` | B-tree | All members of a league |
| league_members | `idx_league_members_user` | B-tree | All leagues of a user |
| league_members | `idx_league_members_status` | B-tree | Filter pending/approved |
| players | `idx_players_league` | B-tree | All players of a league |
| players | `idx_players_league_status` | B-tree | Filter available/sold |
| players | `idx_players_sold_to` | B-tree | Player's owner |
| players | `idx_players_name_trgm` | GIN (trigram) | Fuzzy name search |
| players | `idx_players_external_league` | UNIQUE (partial) | Dedup on re-import by external ID |
| auction_logs | `idx_auction_logs_league` | B-tree | All logs of a league |
| auction_logs | `idx_auction_logs_league_created` | B-tree (DESC) | Recent logs first |
| auction_logs | `idx_auction_logs_action` | B-tree | Filter by action type |

---

## 7. Migration Order

Eseguire nell'ordine:

1. Extensions: `pg_trgm`
2. Enums: tutti i CREATE TYPE
3. Tables: `profiles` → `leagues` → `league_members` → `players` → `auction_logs`
4. Indexes
5. RLS Policies
6. Functions: `sell_player`, `rollback_last_sale`
7. Triggers: `handle_new_user`
