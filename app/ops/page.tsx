'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type OpsPayload = {
  ok: boolean
  env: {
    siliconflow: boolean
    supabase: boolean
    paypalClientId: boolean
    paypalSecret: boolean
    paypalWebhookId: boolean
  }
  summary: {
    usersProfileCount: number
    recentWebhook24h: number
    recentUsage24h: number
  } | null
  migrations: {
    finalizePaypalOrderRpc: 'ready' | 'missing' | 'unknown'
    detail?: string
  } | null
  now: string
}

export default function OpsPage() {
  const [data, setData] = useState<OpsPayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/ops/health')
        const body = (await res.json()) as OpsPayload | { error?: string }
        if (!res.ok) throw new Error((body as { error?: string }).error || 'Failed to load ops')
        if (!alive) return
        setData(body as OpsPayload)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Failed to load ops')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className="min-h-screen bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-gray-800">Ops Health</h1>
          <p className="mt-2 text-gray-500">Development diagnostics for env and activity.</p>
        </div>

        {error ? <p className="mb-4 text-sm text-red-500">{error}</p> : null}

        {data ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-md">
              <h2 className="text-lg font-bold text-gray-800">Environment</h2>
              <div className="mt-3 grid gap-2 text-sm">
                {Object.entries(data.env).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-gray-600">{k}</span>
                    <span className={v ? 'text-green-600' : 'text-red-500'}>
                      {v ? 'ready' : 'missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-md">
              <h2 className="text-lg font-bold text-gray-800">24h Summary</h2>
              {data.summary ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-gray-50 px-3 py-3 text-center">
                    <p className="text-xs text-gray-500">Users</p>
                    <p className="text-xl font-bold text-purple-600">{data.summary.usersProfileCount}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 px-3 py-3 text-center">
                    <p className="text-xs text-gray-500">Webhook 24h</p>
                    <p className="text-xl font-bold text-purple-600">{data.summary.recentWebhook24h}</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 px-3 py-3 text-center">
                    <p className="text-xs text-gray-500">Usage 24h</p>
                    <p className="text-xl font-bold text-purple-600">{data.summary.recentUsage24h}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">Summary unavailable (likely Supabase not configured).</p>
              )}
              <p className="mt-3 text-xs text-gray-400">Generated at: {new Date(data.now).toLocaleString()}</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-md">
              <h2 className="text-lg font-bold text-gray-800">Migrations</h2>
              {data.migrations ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-gray-600">finalize_paypal_order RPC</span>
                    <span
                      className={`${
                        data.migrations.finalizePaypalOrderRpc === 'ready'
                          ? 'text-green-600'
                          : data.migrations.finalizePaypalOrderRpc === 'missing'
                            ? 'text-red-500'
                            : 'text-yellow-600'
                      }`}
                    >
                      {data.migrations.finalizePaypalOrderRpc}
                    </span>
                  </div>
                  {data.migrations.detail ? (
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                      {data.migrations.detail}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">
                  Migration status unavailable (likely Supabase not configured).
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Loading diagnostics...</p>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-flex rounded-full border border-purple-300 px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-50"
          >
            Back to Generator
          </Link>
        </div>
      </div>
    </main>
  )
}
