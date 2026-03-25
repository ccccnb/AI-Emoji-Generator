'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getDevAuthHeaders } from '@/lib/client/dev-auth'

type HistoryItem = {
  id: number
  requestId: string
  prompt: string
  style: string
  topText: string
  bottomText: string
  imageUrls: string[]
  favorited?: boolean
  createdAt: string
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [styleFilter, setStyleFilter] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [favorites, setFavorites] = useState<Record<number, true>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function favoriteStorageKey() {
    const devId =
      typeof window !== 'undefined' ? window.localStorage.getItem('dev_user_id') : null
    return `emoji_history_favorites_${devId ?? 'guest'}`
  }

  function toggleFavorite(id: number) {
    const nextFavorited = !favorites[id]
    setFavorites((prev) => {
      const next = { ...prev }
      if (nextFavorited) next[id] = true
      else delete next[id]
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(favoriteStorageKey(), JSON.stringify(Object.keys(next)))
      }
      return next
    })

    void (async () => {
      try {
        const res = await fetch('/api/me/favorites', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getDevAuthHeaders(),
          },
          body: JSON.stringify({ history_id: id, favorited: nextFavorited }),
        })
        if (!res.ok && res.status !== 401 && res.status !== 503) {
          throw new Error('Cloud favorite sync failed')
        }
      } catch {
        // Keep local state even when cloud sync fails.
      }
    })()
  }

  async function loadHistory(cursor?: string, append = false) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=12` : '?limit=12'
    const res = await fetch(`/api/me/history${query}`, { headers: getDevAuthHeaders() })
    const data = (await res.json()) as {
      enabled?: boolean
      items?: HistoryItem[]
      nextCursor?: string | null
      error?: string
    }
    if (!res.ok) throw new Error(data.error || 'Failed to fetch history')
    if (data.enabled && Array.isArray(data.items)) {
      setItems((prev) => (append ? [...prev, ...data.items!] : data.items!))
      setNextCursor(data.nextCursor ?? null)
      const fromServer: Record<number, true> = {}
      data.items.forEach((item) => {
        if (item.favorited) fromServer[item.id] = true
      })
      if (Object.keys(fromServer).length > 0) {
        setFavorites((prev) => ({ ...prev, ...fromServer }))
      }
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(favoriteStorageKey())
      if (!raw) return
      const ids = JSON.parse(raw) as string[]
      const mapped: Record<number, true> = {}
      ids.forEach((id) => {
        const n = Number(id)
        if (Number.isFinite(n)) mapped[n] = true
      })
      setFavorites(mapped)
    } catch {
      // ignore malformed local data
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (!alive) return
        await loadHistory(undefined, false)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Failed to fetch history')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/me/favorites', { headers: getDevAuthHeaders() })
        if (!res.ok) return
        const data = (await res.json()) as { enabled?: boolean; ids?: number[] }
        if (!alive || !data.enabled || !Array.isArray(data.ids)) return
        const mapped: Record<number, true> = {}
        data.ids.forEach((id) => {
          if (Number.isFinite(id)) mapped[id] = true
        })
        setFavorites((prev) => ({ ...prev, ...mapped }))
      } catch {
        // local favorites remain available.
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const styles = Array.from(new Set(items.map((i) => i.style))).sort()
  const filtered = items.filter((item) => {
    if (styleFilter !== 'all' && item.style !== styleFilter) return false
    if (favoritesOnly && !favorites[item.id]) return false
    if (!searchText.trim()) return true
    const q = searchText.trim().toLowerCase()
    return (
      item.prompt.toLowerCase().includes(q) ||
      item.topText.toLowerCase().includes(q) ||
      item.bottomText.toLowerCase().includes(q)
    )
  })

  const grouped = filtered.reduce<Record<string, HistoryItem[]>>((acc, item) => {
    const d = new Date(item.createdAt)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfItem = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diffDays = Math.floor(
      (startOfToday.getTime() - startOfItem.getTime()) / (1000 * 60 * 60 * 24)
    )

    let bucket = d.toLocaleDateString()
    if (diffDays === 0) bucket = 'Today'
    else if (diffDays === 1) bucket = 'Yesterday'

    if (!acc[bucket]) acc[bucket] = []
    acc[bucket].push(item)
    return acc
  }, {})

  const bucketOrder = ['Today', 'Yesterday']
  const orderedBuckets = Object.keys(grouped).sort((a, b) => {
    const ia = bucketOrder.indexOf(a)
    const ib = bucketOrder.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    const da = new Date(grouped[a][0]?.createdAt ?? 0).getTime()
    const db = new Date(grouped[b][0]?.createdAt ?? 0).getTime()
    return db - da
  })

  return (
    <main className="min-h-screen bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-gray-800">Generation History</h1>
          <p className="mt-2 text-gray-500">Recent generation assets, ready to edit again.</p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-md">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <select
              value={styleFilter}
              onChange={(e) => setStyleFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="all">All styles</option>
              {styles.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search prompt / meme text"
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            />
            <label className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(e) => setFavoritesOnly(e.target.checked)}
              />
              Favorites only
            </label>
            <button
              type="button"
              onClick={() => {
                const favoritesData = filtered.filter((item) => favorites[item.id])
                const blob = new Blob([JSON.stringify(favoritesData, null, 2)], {
                  type: 'application/json',
                })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'emoji-history-favorites.json'
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="rounded-xl border border-purple-300 bg-white px-3 py-2 text-sm text-purple-700 transition hover:bg-purple-50"
            >
              Export favorites
            </button>
          </div>
          {loading ? <p className="text-sm text-gray-500">Loading history...</p> : null}
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {!loading && !error && filtered.length === 0 ? (
            <p className="text-sm text-gray-500">No history yet. Generate your first emoji.</p>
          ) : null}
          <div className="space-y-4">
            {orderedBuckets.map((bucket) => (
              <div key={bucket}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {bucket}
                </h3>
                <div className="space-y-2">
                  {grouped[bucket].map((item) => (
                    <div key={item.id} className="rounded-xl bg-gray-50 px-3 py-3 text-sm">
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Link
                          href={`/?preview=${encodeURIComponent(item.imageUrls[0] ?? '')}&prompt=${encodeURIComponent(
                            item.prompt
                          )}&style=${encodeURIComponent(item.style)}&top=${encodeURIComponent(
                            item.topText
                          )}&bottom=${encodeURIComponent(item.bottomText)}`}
                          className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white"
                        >
                          {item.imageUrls[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrls[0]}
                              alt={`history-${item.id}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-gray-400">
                              no image
                            </div>
                          )}
                        </Link>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-gray-700">{item.style}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">
                                {new Date(item.createdAt).toLocaleString()}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleFavorite(item.id)}
                                className={`rounded-full px-2 py-0.5 text-xs transition ${
                                  favorites[item.id]
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-white text-gray-500'
                                }`}
                              >
                                {favorites[item.id] ? 'Favorited' : 'Favorite'}
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-gray-600">{item.prompt}</p>
                          <div className="mt-1 text-xs text-gray-500">
                            top: {item.topText || '-'} · bottom: {item.bottomText || '-'}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {item.imageUrls.slice(0, 4).map((imgUrl, imgIdx) => (
                              <Link
                                key={`${item.id}-${imgIdx}`}
                                href={`/?preview=${encodeURIComponent(imgUrl)}&prompt=${encodeURIComponent(
                                  item.prompt
                                )}&style=${encodeURIComponent(item.style)}&top=${encodeURIComponent(
                                  item.topText
                                )}&bottom=${encodeURIComponent(item.bottomText)}`}
                                className="h-10 w-10 overflow-hidden rounded-md border border-purple-200 bg-white transition hover:border-purple-400"
                                title={`Use image ${imgIdx + 1}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={imgUrl}
                                  alt={`history-${item.id}-${imgIdx + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              </Link>
                            ))}
                          </div>
                          <div className="mt-2">
                            <Link
                              href={`/?prompt=${encodeURIComponent(item.prompt)}&style=${encodeURIComponent(
                                item.style
                              )}&top=${encodeURIComponent(item.topText)}&bottom=${encodeURIComponent(
                                item.bottomText
                              )}`}
                              className="inline-flex rounded-full border border-purple-300 px-3 py-1 text-xs font-medium text-purple-700 transition hover:bg-purple-50"
                            >
                              Edit again
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {nextCursor ? (
            <div className="mt-4 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => {
                  void (async () => {
                    try {
                      setLoadingMore(true)
                      await loadHistory(nextCursor, true)
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed to load more')
                    } finally {
                      setLoadingMore(false)
                    }
                  })()
                }}
                className="rounded-full border border-purple-300 px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-50 disabled:opacity-60"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full border border-purple-300 px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-50"
          >
            Back to Generator
          </Link>
          <Link
            href="/account"
            className="rounded-full border border-purple-300 px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-50"
          >
            Account
          </Link>
        </div>
      </div>
    </main>
  )
}
