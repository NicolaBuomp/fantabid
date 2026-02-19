import * as XLSX from "xlsx";
import { z } from "zod";

const HEADER_ALIASES = {
  externalId: ["#", "id", "cod", "codice", "d"],
  name: ["nome", "giocatore", "nome giocatore", "calciatore", "name"],
  excluded: ["fuori lista", "fuorilista", "escluso", "fuori"],
  team: ["sq.", "sq", "squadra", "squadra reale", "team", "club"],
  age: ["under", "età", "age", "eta"],
  roleClassic: ["r.", "r", "ruolo", "ruolo classic", "role"],
  roleMantra: [
    "rm",
    "r.mantra",
    "r mantra",
    "ruolo mantra",
    "ruolo-mantra",
    "rmantra",
    "mantra",
  ],
  gamesPlayed: ["pgv", "pg", "partite"],
  avgRating: ["mv", "media voto", "media"],
  avgFanta: ["fm", "fantamedia", "fanta media"],
  fvm: ["fvm/1000", "fvm", "fantavalutazione"],
  quotation: ["quot.", "quot", "quotazione", "q"],
  fantaTeam: ["fantasquadra", "fanta squadra", "squadra fanta", "team name"],
  cost: ["costo", "prezzo", "cost", "price"],
} as const;

const importedPlayerSchema = z.object({
  external_id: z.number().int().nullable(),
  name: z.string().min(1),
  team_real: z.string().min(1),
  roles: z.array(z.string().min(1)).min(1),
  roles_mantra: z.array(z.string().min(1)),
  fvm: z.number().int().min(1),
  age: z.number().int().nullable(),
  games_played: z.number().int().nullable(),
  avg_rating: z.number().nullable(),
  avg_fanta: z.number().nullable(),
  quotation: z.number().int().nullable(),
  status: z.enum(["AVAILABLE", "SOLD"]),
  fanta_team: z.string().nullable(),
  cost: z.number().int().nullable(),
});

export type ImportedPlayer = z.infer<typeof importedPlayerSchema>;

export type ParseListoneResult = {
  players: ImportedPlayer[];
  preview: {
    total_rows: number;
    excluded_fuori_lista: number;
    importable: number;
    available: number;
    sold: number;
    fanta_teams: Array<{
      name: string;
      players_count: number;
      total_cost: number;
    }>;
    warnings: string[];
    errors: Array<{
      row: number;
      message: string;
    }>;
  };
};

function normalizeHeader(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9#]/g, "");

  return normalized;
}

function normalizeCellString(value: unknown): string {
  return String(value ?? "").trim();
}

function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseFloatNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseFloat(String(value).trim().replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
}

function findHeaderIndexes(headerRow: unknown[]): {
  indexes: Partial<Record<keyof typeof HEADER_ALIASES, number>>;
  missingRequired: string[];
} {
  const indexes: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  const normalizedHeaders = headerRow.map((value) => normalizeHeader(value));

  (Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>).forEach(
    (field) => {
      const aliases = HEADER_ALIASES[field].map((alias) =>
        normalizeHeader(alias),
      );
      const headerIndex = normalizedHeaders.findIndex((header) =>
        aliases.includes(header as never),
      );

      if (headerIndex >= 0) {
        indexes[field] = headerIndex;
      }
    },
  );

  const requiredFields: Array<keyof typeof HEADER_ALIASES> = [
    "name",
    "team",
    "roleClassic",
  ];

  const missingRequired = requiredFields.filter(
    (field) => indexes[field] === undefined,
  );

  return { indexes, missingRequired };
}

function detectHeaderRow(rows: unknown[][]): {
  headerRowIndex: number;
  indexes: Partial<Record<keyof typeof HEADER_ALIASES, number>>;
} {
  const rowsToScan = Math.min(rows.length, 15);

  for (let rowIndex = 0; rowIndex < rowsToScan; rowIndex += 1) {
    const candidateHeaderRow = rows[rowIndex] ?? [];
    const { indexes, missingRequired } = findHeaderIndexes(candidateHeaderRow);

    if (missingRequired.length === 0) {
      return {
        headerRowIndex: rowIndex,
        indexes,
      };
    }
  }

  const firstRow = rows[0] ?? [];
  const { missingRequired } = findHeaderIndexes(firstRow);
  throw new Error(`LISTONE_MISSING_HEADERS:${missingRequired.join(",")}`);
}

export function parseListone(buffer: Buffer): ParseListoneResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("LISTONE_EMPTY_WORKBOOK");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  if (!rows.length) {
    throw new Error("LISTONE_EMPTY_SHEET");
  }

  const { headerRowIndex, indexes } = detectHeaderRow(rows);

  const warnings: string[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const players: ImportedPlayer[] = [];

  let excludedFuoriLista = 0;

  for (
    let rowIndex = headerRowIndex + 1;
    rowIndex < rows.length;
    rowIndex += 1
  ) {
    const rowNumber = rowIndex + 1;
    const row = rows[rowIndex] ?? [];

    const rawName = normalizeCellString(row[indexes.name ?? -1]);
    if (!rawName) {
      continue;
    }

    const excludedValue = normalizeCellString(row[indexes.excluded ?? -1]);
    if (excludedValue) {
      excludedFuoriLista += 1;
      continue;
    }

    const teamReal = normalizeCellString(row[indexes.team ?? -1]);
    const roleClassic = normalizeCellString(
      row[indexes.roleClassic ?? -1],
    ).toUpperCase();
    const roleMantraRaw =
      indexes.roleMantra !== undefined
        ? normalizeCellString(row[indexes.roleMantra])
        : roleClassic;

    if (!teamReal || !roleClassic) {
      errors.push({
        row: rowNumber,
        message: "Missing required team or classic role",
      });
      continue;
    }

    const roleMantra = roleMantraRaw
      .split("/")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!roleMantra.length) {
      roleMantra.push(roleClassic);
    }

    let cost = parseInteger(row[indexes.cost ?? -1]);
    const fantaTeam = normalizeCellString(row[indexes.fantaTeam ?? -1]) || null;

    if (fantaTeam && cost === null) {
      cost = 0;
      warnings.push(
        `Row ${rowNumber}: fanta team present without cost, defaulted to 0`,
      );
    }

    const status = fantaTeam ? "SOLD" : "AVAILABLE";

    if (status === "SOLD" && cost === 0) {
      warnings.push(`Row ${rowNumber}: sold player has cost 0`);
    }

    const candidate: ImportedPlayer = {
      external_id: parseInteger(row[indexes.externalId ?? -1]),
      name: rawName,
      team_real: teamReal,
      roles: [roleClassic],
      roles_mantra: roleMantra,
      fvm: parseInteger(row[indexes.fvm ?? -1]) ?? 1,
      age: parseInteger(row[indexes.age ?? -1]),
      games_played: parseInteger(row[indexes.gamesPlayed ?? -1]),
      avg_rating: parseFloatNumber(row[indexes.avgRating ?? -1]),
      avg_fanta: parseFloatNumber(row[indexes.avgFanta ?? -1]),
      quotation: parseInteger(row[indexes.quotation ?? -1]),
      status,
      fanta_team: fantaTeam,
      cost,
    };

    const parsedCandidate = importedPlayerSchema.safeParse(candidate);
    if (!parsedCandidate.success) {
      errors.push({
        row: rowNumber,
        message: parsedCandidate.error.issues
          .map((issue) => issue.message)
          .join(", "),
      });
      continue;
    }

    players.push(parsedCandidate.data);
  }

  const soldPlayers = players.filter((player) => player.status === "SOLD");
  const availablePlayers = players.filter(
    (player) => player.status === "AVAILABLE",
  );

  const fantaTeamsAccumulator = new Map<
    string,
    { players_count: number; total_cost: number }
  >();

  soldPlayers.forEach((player) => {
    const teamName = player.fanta_team;
    if (!teamName) {
      return;
    }

    const current = fantaTeamsAccumulator.get(teamName) ?? {
      players_count: 0,
      total_cost: 0,
    };

    current.players_count += 1;
    current.total_cost += player.cost ?? 0;
    fantaTeamsAccumulator.set(teamName, current);
  });

  const fantaTeams = Array.from(fantaTeamsAccumulator.entries())
    .map(([name, data]) => ({
      name,
      players_count: data.players_count,
      total_cost: data.total_cost,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    players,
    preview: {
      total_rows: Math.max(0, rows.length - (headerRowIndex + 1)),
      excluded_fuori_lista: excludedFuoriLista,
      importable: players.length,
      available: availablePlayers.length,
      sold: soldPlayers.length,
      fanta_teams: fantaTeams,
      warnings,
      errors,
    },
  };
}
