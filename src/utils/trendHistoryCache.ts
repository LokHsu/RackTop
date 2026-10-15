import type { HistoryPoint } from '../types/models'

interface CacheEntry {
  expiresAt: number
  points?: HistoryPoint[]
  request?: Promise<HistoryPoint[]>
}

const historyCache = new Map<string, CacheEntry>()
const MAX_CACHE_ENTRIES = 32

function storeEntry(key: string, entry: CacheEntry) {
  historyCache.delete(key)
  historyCache.set(key, entry)
  while (historyCache.size > MAX_CACHE_ENTRIES) historyCache.delete(historyCache.keys().next().value!)
}

export function getCachedTrendHistory(key: string) {
  return historyCache.get(key)?.points
}

export function loadCachedTrendHistory(key: string, loader: () => Promise<HistoryPoint[]>, maxAgeMs = 25_000) {
  const cached = historyCache.get(key)
  if (cached?.points && cached.expiresAt > Date.now()) return Promise.resolve(cached.points)
  if (cached?.request) return cached.request

  const request = loader().then((points) => {
    if (historyCache.get(key)?.request === request) storeEntry(key, { points, expiresAt: Date.now() + maxAgeMs })
    return points
  }).catch((error) => {
    if (historyCache.get(key)?.request === request) historyCache.delete(key)
    throw error
  })
  storeEntry(key, { points: cached?.points, expiresAt: cached?.expiresAt ?? 0, request })
  return request
}

export function clearTrendHistoryCache(serverId?: string) {
  if (serverId === undefined) historyCache.clear()
  else for (const key of historyCache.keys()) if (key.startsWith(`${serverId}:`)) historyCache.delete(key)
}
