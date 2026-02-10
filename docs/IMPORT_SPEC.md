# IMPORT SPEC — Listone Fantacalcio v1.0

## 1. Overview

L'app supporta l'importazione del listone giocatori da file Excel (`.xlsx`) esportato da piattaforme come Fantacalcio.it. L'import gestisce due scenari:

- **Listone vergine:** solo giocatori senza assegnazioni → tutti importati come AVAILABLE
- **Asta in corso:** giocatori già assegnati a fantasquadre con prezzo → import con stato SOLD e creazione automatica delle rose

---

## 2. Formato File Atteso

### Header Row (Row 1)

| Colonna | Header | Tipo | Obbligatorio | Note |
|---|---|---|---|---|
| A | `#` | Number | No | ID esterno dal provider (Fantacalcio.it) |
| B | `Nome` | String | **Sì** | Nome giocatore (es. "Martinez L.", "Pulisic") |
| C | `Fuori lista` | String | No | `*` se fuori lista, vuoto altrimenti |
| D | `Sq.` | String | **Sì** | Squadra reale Serie A (es. "Inter", "Milan") |
| E | `Under` | Number | No | Età del giocatore |
| F | `R.` | String | **Sì** | Ruolo Classic: `P`, `D`, `C`, `A` |
| G | `R.MANTRA` | String | **Sì** | Ruolo Mantra: singolo o multi con `/` (es. `Pc`, `T/A`, `M/C`, `W/T/A`) |
| H | `PGv` | Number | No | Partite giocate con voto |
| I | `MV` | Float | No | Media voto |
| J | `FM` | Float | No | Fantamedia |
| K | `FVM/1000` | Number | No | Fantavalutazione media (in migliaia) |
| L | `QUOT.` | Number | No | Quotazione iniziale |
| M | `FantaSquadra` | String | No | Nome fantasquadra se già assegnato |
| N | `Costo` | String/Number | No | Prezzo d'acquisto (può essere stringa!) |

### Dati Osservati dal File di Riferimento

```
Totale righe:           655 giocatori
Fuori lista (*):        130 → ESCLUSI dall'import
Già assegnati:          475 (hanno sia FantaSquadra che Costo)
Disponibili:            180 → importati come AVAILABLE
Squadre Serie A:        20
Ruoli Classic:          P, D, C, A
Ruoli Mantra:           Por, Dc, Dd, Ds, E, M, C, T, W, A, Pc, B
                        Multi-ruolo con / → fino a 3 ruoli (es. W/T/A, B/Dd/Ds)
FVM range:              1 - 370
Costo colonna:          Sempre stringa (es. "36", non 36)
Nomi con iniziale:      "Martinez L.", "Paz N." (disambiguazione omonimi)
```

---

## 3. Logica di Parsing

### 3.1 Header Detection (Flessibile)

Il parser NON assume colonne fisse. Cerca gli header nella prima riga tramite mapping:

```javascript
const HEADER_ALIASES = {
  // Campo → possibili nomi header (case-insensitive, trimmed)
  externalId:   ['#', 'id', 'cod', 'codice'],
  name:         ['nome', 'giocatore', 'name'],
  excluded:     ['fuori lista', 'fuorilista', 'escluso', 'fuori'],
  team:         ['sq.', 'sq', 'squadra', 'team'],
  age:          ['under', 'età', 'age', 'eta'],
  roleClassic:  ['r.', 'r', 'ruolo', 'role'],
  roleMantra:   ['r.mantra', 'ruolo mantra', 'rmantra', 'mantra'],
  gamesPlayed:  ['pgv', 'pg', 'partite'],
  avgRating:    ['mv', 'media voto', 'media'],
  avgFanta:     ['fm', 'fantamedia', 'fanta media'],
  fvm:          ['fvm/1000', 'fvm', 'fantavalutazione'],
  quotation:    ['quot.', 'quot', 'quotazione', 'q'],
  fantaTeam:    ['fantasquadra', 'fanta squadra', 'squadra fanta', 'team name'],
  cost:         ['costo', 'prezzo', 'cost', 'price']
};
```

**Algoritmo:**
1. Leggi riga 1
2. Per ogni cella, trimma e lowercasa il valore
3. Matcha contro `HEADER_ALIASES`
4. Se `name` o `team` o `roleClassic` non trovati → errore con dettaglio colonne mancanti

### 3.2 Row Processing

Per ogni riga dalla 2 in poi:

```
1. SKIP se nome è vuoto o null
2. SKIP se colonna "Fuori lista" contiene qualsiasi valore non-vuoto (es. "*")
3. Normalizza ruoli:
   - roleClassic: uppercase, trim → "A", "C", "D", "P"
   - roleMantra: split su "/" → ["T", "A"] da "T/A"
4. Normalizza costo: parseInt(String(costo)) → se NaN → null
5. Normalizza FVM: parseInt o default 1
6. Determina status:
   - Se fantaTeam è non-vuoto E costo è non-null → SOLD
   - Altrimenti → AVAILABLE
```

### 3.3 Ruoli — Mapping Completo

**Classic (colonna F):**
| Valore | Significato |
|---|---|
| `P` | Portiere |
| `D` | Difensore |
| `C` | Centrocampista |
| `A` | Attaccante |

**Mantra (colonna G) — Ruoli singoli:**
| Valore | Significato |
|---|---|
| `Por` | Portiere |
| `Dc` | Difensore centrale |
| `Dd` | Difensore destro |
| `Ds` | Difensore sinistro |
| `E` | Esterno (terzino offensivo) |
| `M` | Mediano |
| `C` | Centrocampista centrale |
| `T` | Trequartista |
| `W` | Ala (Wing) |
| `A` | Attaccante |
| `Pc` | Prima punta / centravanti |
| `B` | Braccetto (difensore a 3) |

**Multi-ruolo Mantra:** separati da `/`. Esempi osservati:
```
T/A, M/C, C/T, C/W, W/A, E/W, E/M, W/T, 
Dd/E, Ds/E, Dd/Dc, Ds/Dc, Dd/Ds/E,
C/W/T, W/T/A, B/Dd/Ds, B/Dd/E, B/Ds/E
```

---

## 4. Import Asta in Corso

Quando il file contiene giocatori con `FantaSquadra` e `Costo` valorizzati, l'app deve ricostruire lo stato dell'asta.

### 4.1 Flusso

```
File Excel caricato
│
├─ Parse → Lista giocatori con status AVAILABLE o SOLD
│
├─ Estrai nomi unici FantaSquadra → ["Materazzi1908", "FC BABBA", ...]
│
├─ STEP 1: Mostra Preview all'Admin
│  ├─ Giocatori totali (esclusi fuori lista): 525
│  ├─ Già assegnati: 475
│  ├─ Disponibili: 50
│  ├─ FantaSquadre trovate: 8
│  └─ Lista fantasquadre con num giocatori e spesa totale
│
├─ STEP 2: Mapping FantaSquadre → Membri Lega
│  │
│  │  L'admin deve associare ogni FantaSquadra del file
│  │  a un membro della lega (league_member).
│  │
│  │  UI: Lista con dropdown per ogni fantasquadra
│  │  ┌─────────────────────┬───────────────────────┐
│  │  │ FantaSquadra (file) │ Membro lega           │
│  │  ├─────────────────────┼───────────────────────┤
│  │  │ Materazzi1908       │ [Dropdown: Mario ▾]   │
│  │  │ FC BABBA            │ [Dropdown: Luigi ▾]   │
│  │  │ LONGOBARDA          │ [Dropdown: ---   ▾]   │
│  │  └─────────────────────┴───────────────────────┘
│  │
│  │  Se un membro non viene mappato → i suoi giocatori
│  │  restano come AVAILABLE (l'admin può riassegnarli poi)
│  │
│  └─ Admin conferma mapping
│
├─ STEP 3: Calcolo Budget
│  │
│  │  Per ogni membro mappato:
│  │  budget_current = budget_initial - SUM(costo giocatori assegnati)
│  │  slots_filled = conteggio giocatori per ruolo
│  │
│  └─ Validazione:
│     ├─ budget_current < 0? → Warning (non bloccante, admin decide)
│     └─ slots > roster_limits? → Warning (non bloccante)
│
├─ STEP 4: Scrittura DB (Transazione)
│  ├─ INSERT players (tutti, con status AVAILABLE o SOLD)
│  ├─ UPDATE league_members (budget, slots per chi è mappato)
│  ├─ INSERT auction_logs (un record SOLD per ogni giocatore assegnato)
│  └─ UPDATE league status → ACTIVE (se era SETUP)
│
└─ DONE: Asta pronta per continuare
```

### 4.2 Edge Cases Import Asta in Corso

| Caso | Gestione |
|---|---|
| FantaSquadra nel file non mappata a nessun membro | Giocatori di quella squadra → AVAILABLE |
| Membro lega senza fantasquadra nel file | Budget intatto, rosa vuota |
| Budget negativo dopo import | Warning visuale, admin può aggiustare manualmente |
| Giocatore con FantaSquadra ma senza Costo | Impossibile nel dataset (sempre accoppiati), ma se succede → trattare come Costo = 0 con warning |
| Re-import su lega che ha già giocatori | Mostrare dialog: "Sovrascrivere listone esistente?" → se sì, DELETE tutti i players della lega prima dell'insert |
| Nomi giocatori duplicati | Usare `external_id` (colonna #) come chiave primaria di dedup. Se manca, dedup su `name + team_real` |

---

## 5. Schema DB — Aggiornamenti

### Tabella `players` — Colonne aggiunte

```sql
ALTER TABLE players ADD COLUMN external_id INT;              -- Colonna # dal file
ALTER TABLE players ADD COLUMN age INT;                      -- Under
ALTER TABLE players ADD COLUMN roles_mantra TEXT[] DEFAULT '{}'; -- Ruoli Mantra separati
ALTER TABLE players ADD COLUMN games_played INT;             -- PGv
ALTER TABLE players ADD COLUMN avg_rating NUMERIC(4,2);      -- MV
ALTER TABLE players ADD COLUMN avg_fanta NUMERIC(4,2);       -- FM
ALTER TABLE players ADD COLUMN quotation INT;                -- QUOT.

-- Indice per dedup su re-import
CREATE UNIQUE INDEX idx_players_external_league ON players(league_id, external_id) 
  WHERE external_id IS NOT NULL;
```

### Tabella `players` — Schema completo aggiornato

```sql
CREATE TABLE players (
  id              SERIAL PRIMARY KEY,
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  external_id     INT,                        -- # dal file Excel (per dedup)
  name            TEXT NOT NULL,
  team_real       TEXT NOT NULL,
  roles           TEXT[] NOT NULL DEFAULT '{}', -- Ruoli Classic: ["P"], ["D"], ["C"], ["A"]
  roles_mantra    TEXT[] NOT NULL DEFAULT '{}', -- Ruoli Mantra: ["T", "A"], ["M", "C"]
  fvm             INT NOT NULL DEFAULT 1,      -- Fantavalutazione media
  age             INT,
  games_played    INT,
  avg_rating      NUMERIC(4,2),
  avg_fanta       NUMERIC(4,2),
  quotation       INT,
  status          player_status NOT NULL DEFAULT 'AVAILABLE',
  sold_to         UUID REFERENCES league_members(id) ON DELETE SET NULL,
  sold_price      INT,
  sold_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Enum `player_status` — Nessun cambiamento

I giocatori "Fuori lista" sono **esclusi dall'import**, quindi non serve un nuovo status.

```sql
-- Rimane: 'AVAILABLE', 'SOLD', 'SKIPPED'
```

---

## 6. API Endpoint

### `POST /api/leagues/:id/players/import`

**Auth:** JWT + Admin della lega

**Content-Type:** `multipart/form-data`

**Body:**
```
file: <Excel .xlsx>
```

**Response (Step 1 — Preview):**
```json
{
  "preview": {
    "total_rows": 655,
    "excluded_fuori_lista": 130,
    "importable": 525,
    "available": 50,
    "sold": 475,
    "fanta_teams": [
      {
        "name": "Materazzi1908",
        "players_count": 25,
        "total_cost": 500,
        "players": [
          { "name": "Martinez L.", "role": "A", "cost": 36 },
          ...
        ]
      },
      ...
    ],
    "warnings": [
      "2 giocatori hanno costo 0",
      "FantaSquadra 'Team X' ha 30 giocatori (supera il limite rosa di 25)"
    ]
  }
}
```

### `POST /api/leagues/:id/players/import/confirm`

**Auth:** JWT + Admin

**Body:**
```json
{
  "team_mapping": {
    "Materazzi1908": "member-uuid-1",
    "FC BABBA": "member-uuid-2",
    "LONGOBARDA": null
  },
  "overwrite_existing": true
}
```

**Response:**
```json
{
  "imported": {
    "total_players": 525,
    "available": 90,
    "sold": 435,
    "members_updated": 6,
    "unmapped_teams": ["LONGOBARDA"],
    "unmapped_players_set_available": 40
  }
}
```

**Logica server:**
1. Se `overwrite_existing: true` → DELETE tutti i players della lega
2. INSERT tutti i giocatori parsati
3. Per ogni `team_mapping` entry con valore non-null:
   - UPDATE `players` SET `sold_to`, `sold_price`, `sold_at`, `status = 'SOLD'`
   - UPDATE `league_members` SET `budget_current`, `slots_filled`
   - INSERT `auction_logs` per ogni vendita
4. Per mapping con valore `null` → quei giocatori restano AVAILABLE
5. Return summary

---

## 7. Validazione Zod (Server-Side)

```typescript
import { z } from 'zod';

// Schema per una riga parsata dal file
const ImportedPlayerSchema = z.object({
  externalId: z.number().nullable(),
  name: z.string().min(1),
  teamReal: z.string().min(1),
  roleClassic: z.enum(['P', 'D', 'C', 'A']),
  rolesMantra: z.array(z.string()).min(1),
  fvm: z.number().int().min(0).default(1),
  age: z.number().int().nullable(),
  gamesPlayed: z.number().int().nullable(),
  avgRating: z.number().nullable(),
  avgFanta: z.number().nullable(),
  quotation: z.number().int().nullable(),
  fantaTeam: z.string().nullable(),        // Da file Excel
  cost: z.number().int().nullable(),        // Da file Excel
});

// Schema per il confirm
const ImportConfirmSchema = z.object({
  teamMapping: z.record(
    z.string(),                              // Nome fantasquadra dal file
    z.string().uuid().nullable()             // Member ID o null
  ),
  overwriteExisting: z.boolean().default(false),
});
```

---

## 8. Parsing Implementation Notes

### Libreria: `xlsx` (SheetJS)

```javascript
const XLSX = require('xlsx');

function parseListone(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]]; // Primo foglio
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Array di array

  // 1. Detect headers (row 0)
  const headerRow = rows[0];
  const columnMap = detectHeaders(headerRow); // → { name: 1, team: 3, roleClassic: 5, ... }

  // 2. Parse data rows
  const players = [];
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    try {
      const parsed = parseRow(row, columnMap, i + 1); // +1 per numero riga Excel
      if (parsed === null) continue; // Skipped (fuori lista o vuoto)
      players.push(parsed);
    } catch (e) {
      errors.push({ row: i + 1, error: e.message });
    }
  }

  return { players, errors };
}

function parseRow(row, colMap, rowNumber) {
  const name = String(row[colMap.name] || '').trim();
  if (!name) return null; // Riga vuota

  // Check fuori lista
  const excluded = row[colMap.excluded];
  if (excluded !== null && excluded !== undefined && String(excluded).trim() !== '') {
    return null; // Fuori lista → skip
  }

  // Parse ruoli mantra
  const mantraRaw = String(row[colMap.roleMantra] || '');
  const rolesMantra = mantraRaw.split('/').map(r => r.trim()).filter(Boolean);

  // Parse costo (può essere stringa)
  const costoRaw = row[colMap.cost];
  const cost = costoRaw !== null && costoRaw !== undefined
    ? parseInt(String(costoRaw), 10) || null
    : null;

  // Parse fantasquadra
  const fantaTeam = row[colMap.fantaTeam]
    ? String(row[colMap.fantaTeam]).trim()
    : null;

  return {
    externalId: row[colMap.externalId] ?? null,
    name,
    teamReal: String(row[colMap.team]).trim(),
    roleClassic: String(row[colMap.roleClassic]).trim().toUpperCase(),
    rolesMantra,
    fvm: parseInt(row[colMap.fvm]) || 1,
    age: parseInt(row[colMap.age]) || null,
    gamesPlayed: parseInt(row[colMap.gamesPlayed]) || null,
    avgRating: parseFloat(row[colMap.avgRating]) || null,
    avgFanta: parseFloat(row[colMap.avgFanta]) || null,
    quotation: parseInt(row[colMap.quotation]) || null,
    fantaTeam,
    cost,
    // Derived
    status: (fantaTeam && cost !== null) ? 'SOLD' : 'AVAILABLE',
  };
}
```

### Costo come Stringa

Nel file analizzato, la colonna `Costo` (N) è **sempre stringa** (es. `"36"` non `36`). Il parser deve gestire entrambi i casi:

```javascript
const cost = parseInt(String(costoRaw), 10);
// "36" → 36 ✓
// 36   → 36 ✓
// ""   → NaN → null ✓
// null → "null" → NaN → null ✓
```

---

## 9. UX Flow — Admin Import

### Screen 1: Upload

```
┌─────────────────────────────────────┐
│  Importa Listone                     │
│                                      │
│  ┌─────────────────────────────┐    │
│  │  📁 Trascina file .xlsx     │    │
│  │     o clicca per caricare   │    │
│  └─────────────────────────────┘    │
│                                      │
│  Formati supportati: .xlsx           │
│  Max 5MB                             │
└─────────────────────────────────────┘
```

### Screen 2: Preview

```
┌──────────────────────────────────────────────┐
│  Preview Import                               │
│                                               │
│  ✅ 525 giocatori importabili                 │
│  ❌ 130 esclusi (fuori lista)                 │
│  ⚽ 475 già assegnati a 8 fantasquadre        │
│  🆓 50 disponibili                            │
│                                               │
│  ⚠️  Warnings:                                │
│  • 2 giocatori hanno costo 0                  │
│                                               │
│  [Annulla]              [Avanti: Mapping →]   │
└──────────────────────────────────────────────┘
```

### Screen 3: Team Mapping (solo se ci sono assegnazioni)

```
┌──────────────────────────────────────────────┐
│  Associa FantaSquadre ai Membri               │
│                                               │
│  FantaSquadra (file)    Membro lega           │
│  ─────────────────────  ──────────────────    │
│  Materazzi1908 (25 g.)  [Mario Rossi    ▾]   │
│  FC BABBA (22 g.)       [Luigi Verdi    ▾]   │
│  LONGOBARDA (18 g.)     [-- Nessuno --  ▾]   │
│  Cascarut (15 g.)       [Paolo Bianchi  ▾]   │
│  ...                                          │
│                                               │
│  ℹ️ Squadre non associate: i giocatori        │
│     resteranno disponibili per l'asta         │
│                                               │
│  [← Indietro]              [Conferma Import]  │
└──────────────────────────────────────────────┘
```

### Screen 4: Result

```
┌──────────────────────────────────────────────┐
│  ✅ Import Completato!                        │
│                                               │
│  525 giocatori importati                      │
│  435 assegnati a 6 membri                     │
│  90 disponibili per l'asta                    │
│                                               │
│  ⚠️ 40 giocatori di "LONGOBARDA" non          │
│     assegnati (squadra non mappata)            │
│                                               │
│  [Vai all'Asta →]                             │
└──────────────────────────────────────────────┘
```
