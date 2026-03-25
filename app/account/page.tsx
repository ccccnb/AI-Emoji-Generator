'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getDevAuthHeaders } from '@/lib/client/dev-auth'

type AccountData = {
  quota: {
    creditBalance: number
    dailyRemaining: number
    dailyFreeQuota: number
    planTier: string
  }
  orders: Array<{
    id: string
    productCode: string
    amount: string
    currency: string
    status: string
    createdAt: string
  }>
  ledger: Array<{
    id: number
    delta: number
    reason: string
    requestId: string | null
    createdAt: string
  }>
  stats: {
    generatedLast7d: number
    favoritesCount: number
  }
}

export default function AccountPage() {
  const [data, setData] = useState<AccountData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/me/account', { headers: getDevAuthHeaders() })
        const body = (await res.json()) as
          | ({ enabled?: boolean; error?: string } & Partial<AccountData>)
          | undefined
        if (!res.ok) throw new Error(body?.error || 'Failed to fetch account')
        if (!alive) return
        if (body?.enabled) {
          setData({
            quota: body.quota as AccountData['quota'],
            orders: (body.orders ?? []) as AccountData['orders'],
            ledger: (body.ledger ?? []) as AccountData['ledger'],
            stats: (body.stats ?? {
              generatedLast7d: 0,
              favoritesCount: 0,
            }) as AccountData['stats'],
          })
        }
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Failed to fetch account')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-gray-800">Account</h1>
          <p className="mt-2 text-gray-500">Credits, daily quota, ledger and recent payments.</p>
        </div>

        {loading ? <p className="text-center text-sm text-gray-500">Loading account...</p> : null}
        {error ? <p className="text-center text-sm text-red-500">{error}</p> : null}

        {data ? (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-white p-4 text-center shadow-md">
                <p className="text-xs text-gray-500">Plan</p>
                <p className="mt-1 text-2xl font-extrabold text-purple-600">{data.quota.planTier}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 text-center shadow-md">
                <p className="text-xs text-gray-500">Cloud Credits</p>
                <p className="mt-1 text-2xl font-extrabold text-purple-600">
                  {data.quota.creditBalance}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4 text-center shadow-md">
                <p className="text-xs text-gray-500">Daily Remaining</p>
                <p className="mt-1 text-2xl font-extrabold text-purple-600">
                  {data.quota.dailyRemaining}/{data.quota.dailyFreeQuota}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-4 text-center shadow-md">
                <p className="text-xs text-gray-500">Generated in last 7 days</p>
                <p className="mt-1 text-2xl font-extrabold text-purple-600">
                  {data.stats?.generatedLast7d ?? 0}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4 text-center shadow-md">
                <p className="text-xs text-gray-500">Favorites</p>
                <p className="mt-1 text-2xl font-extrabold text-purple-600">
                  {data.stats?.favoritesCount ?? 0}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-md">
              <h3 className="text-lg font-bold text-gray-800">Credit Ledger</h3>
              <div className="mt-3 space-y-2">
                {data.ledger.length === 0 ? (
                  <p className="text-sm text-gray-500">No ledger records yet.</p>
                ) : (
                  data.ledger.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm"
                    >
                      <span className="text-gray-600">
                        {row.reason}
                        {row.requestId ? ` · ${row.requestId.slice(0, 8)}` : ''}
                      </span>
                      <span className={row.delta >= 0 ? 'text-green-600' : 'text-red-500'}>
                        {row.delta >= 0 ? `+${row.delta}` : row.delta}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-md">
              <h3 className="text-lg font-bold text-gray-800">Recent Orders</h3>
              <div className="mt-3 space-y-2">
                {data.orders.length === 0 ? (
                  <p className="text-sm text-gray-500">No payment orders yet.</p>
                ) : (
                  data.orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm"
                    >
                      <span className="text-gray-600">
                        {order.productCode} · {order.amount} {order.currency}
                      </span>
                      <span
                        className={`${
                          order.status === 'paid'
                            ? 'text-green-600'
                            : order.status === 'failed'
                              ? 'text-red-500'
                              : 'text-gray-500'
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full border border-purple-300 px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-50"
          >
            Back to Generator
          </Link>
          <Link
            href="/history"
            className="rounded-full border border-purple-300 px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-50"
          >
            History
          </Link>
        </div>
      </div>
    </main>
  )
}
