import { ImportedPlayer } from "../lib/listone-parser";

type ImportPreviewCacheItem = {
  leagueId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  players: ImportedPlayer[];
};

const importPreviewCache = new Map<string, ImportPreviewCacheItem>();
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function getCacheKey(leagueId: string, userId: string): string {
  return `${leagueId}:${userId}`;
}

export function setImportPreviewCache(params: {
  leagueId: string;
  userId: string;
  players: ImportedPlayer[];
  ttlMs?: number;
}) {
  const ttlMs = params.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  const key = getCacheKey(params.leagueId, params.userId);

  importPreviewCache.set(key, {
    leagueId: params.leagueId,
    userId: params.userId,
    createdAt: now,
    expiresAt: now + ttlMs,
    players: params.players,
  });
}

export function getImportPreviewCache(leagueId: string, userId: string) {
  const key = getCacheKey(leagueId, userId);
  const item = importPreviewCache.get(key);

  if (!item) {
    return null;
  }

  if (item.expiresAt <= Date.now()) {
    importPreviewCache.delete(key);
    return null;
  }

  return item;
}

export function clearImportPreviewCache(leagueId: string, userId: string) {
  const key = getCacheKey(leagueId, userId);
  importPreviewCache.delete(key);
}
