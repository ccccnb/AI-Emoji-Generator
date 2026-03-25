'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CREDIT_PRODUCTS } from '@/lib/server/products'
import { getDevAuthHeaders } from '@/lib/client/dev-auth'

type BillingOrder = {
  id: string
  productCode: string
  amount: string
  currency: string
  status: string
  createdAt: string
}

function PricingContent() {
  const params = useSearchParams()
  const status = params.get('status')
  const [loadingCode, setLoadingCode] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [credits, setCredits] = useState<number | null>(null)
  const [orders, setOrders] = useState<BillingOrder[]>([])
  const canPay = useMemo(() => loadingCode === null, [loadingCode])

  async function refreshBilling() {
    try {
      const res = await fetch('/api/me/billing', {
        headers: getDevAuthHeaders(),
      })
      if (!res.ok) return
      const data = (await res.json()) as {
        enabled?: boolean
        quota?: { creditBalance?: number }
        orders?: BillingOrder[]
      }
      if (!data.enabled) return
      if (typeof data.quota?.creditBalance === 'number') {
        setCredits(data.quota.creditBalance)
      }
      if (Array.isArray(data.orders)) {
        setOrders(data.orders)
      }
    } catch {
      // Keep pricing page usable without billing panel.
    }
  }

  useEffect(() => {
    void refreshBilling()
  }, [status])

  async function handleCheckout(productCode: string) {
    setError('')
    setLoadingCode(productCode)
    try {
      const res = await fetch('/api/pay/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getDevAuthHeaders(),
        },
        body: JSON.stringify({
          product_code: productCode,
          return_url: `${window.location.origin}/pay/success`,
          cancel_url: `${window.location.origin}/pricing?status=cancel`,
        }),
      })
      const data = (await res.json()) as { approve_url?: string; error?: string }
      if (!res.ok || !data.approve_url) {
        throw new Error(data.error || 'Checkout failed')
      }
      window.location.href = data.approve_url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed')
      setLoadingCode(null)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-gray-800">Pricing</h1>
          <p className="mt-2 text-gray-500">
            Buy credits with PayPal and continue generating emojis anytime.
          </p>
          <p className="mt-2 text-xs text-gray-400">Login is required before payment.</p>
          {status === 'success' ? (
            <p className="mt-2 text-sm text-green-600">
              Payment returned successfully. Balance refresh is automatic.
            </p>
          ) : null}
          {status === 'cancel' ? (
            <p className="mt-2 text-sm text-gray-500">Payment was canceled.</p>
          ) : null}
          {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
        </div>

        {credits != null ? (
          <div className="mb-6 rounded-2xl bg-white p-4 text-center shadow-md">
            <p className="text-sm text-gray-500">Current cloud credits</p>
            <p className="mt-1 text-2xl font-extrabold text-purple-600">{credits}</p>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          {CREDIT_PRODUCTS.map((p) => (
            <div key={p.code} className="rounded-2xl bg-white p-6 shadow-lg">
              <h2 className="text-xl font-bold text-gray-800">{p.name}</h2>
              <p className="mt-2 text-sm text-gray-500">{p.description}</p>
              <p className="mt-6 text-3xl font-extrabold text-purple-600">
                ${p.amount}
                <span className="ml-1 text-sm font-medium text-gray-500">{p.currency}</span>
              </p>
              <p className="mt-1 text-sm text-gray-500">{p.credits} credits</p>
              <button
                type="button"
                disabled={!canPay}
                onClick={() => void handleCheckout(p.code)}
                className="mt-6 w-full rounded-full bg-purple-500 px-4 py-2.5 font-bold text-white transition hover:bg-purple-600"
              >
                {loadingCode === p.code ? 'Redirecting...' : 'Pay with PayPal'}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/"
            className="inline-flex rounded-full border border-purple-300 px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-50"
          >
            Back to Generator
          </Link>
        </div>

        {orders.length > 0 ? (
          <div className="mt-8 rounded-2xl bg-white p-5 shadow-md">
            <h3 className="text-lg font-bold text-gray-800">Recent orders</h3>
            <div className="mt-3 space-y-2">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="text-gray-600">
                    {order.productCode} · {order.amount} {order.currency}
                  </span>
                  <span
                    className={`font-medium ${
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
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50 px-4 py-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm text-gray-500">Loading…</p>
          </div>
        </main>
      }
    >
      <PricingContent />
    </Suspense>
  )
}
