'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getDevAuthHeaders } from '@/lib/client/dev-auth'

type CaptureState = 'capturing' | 'success' | 'failed'

function PaySuccessContent() {
  const params = useSearchParams()
  const paypalOrderId = params.get('token')
  const [state, setState] = useState<CaptureState>('capturing')
  const [message, setMessage] = useState('Capturing your payment...')

  const missingToken = useMemo(() => !paypalOrderId, [paypalOrderId])

  useEffect(() => {
    if (!paypalOrderId) {
      setState('failed')
      setMessage('Missing PayPal order id in callback URL.')
      return
    }

    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/pay/capture', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getDevAuthHeaders(),
          },
          body: JSON.stringify({ paypal_order_id: paypalOrderId }),
        })
        const data = (await res.json()) as {
          credits_added?: number
          error?: string
          already_paid?: boolean
        }
        if (!res.ok) {
          throw new Error(data.error || 'Capture failed')
        }
        if (!alive) return
        setState('success')
        const credits = data.credits_added ?? 0
        setMessage(
          data.already_paid
            ? 'Payment already captured. Your credits are available.'
            : `Payment successful. Added ${credits} credits to your account.`
        )
      } catch (e) {
        if (!alive) return
        setState('failed')
        setMessage(e instanceof Error ? e.message : 'Capture failed')
      }
    })()

    return () => {
      alive = false
    }
  }, [paypalOrderId])

  return (
    <main className="min-h-screen bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-xl">
        <h1 className="text-3xl font-extrabold text-gray-800">Payment Result</h1>
        <p
          className={`mt-4 text-sm ${
            state === 'success'
              ? 'text-green-600'
              : state === 'failed'
                ? 'text-red-500'
                : 'text-gray-500'
          }`}
        >
          {message}
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-purple-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-purple-600"
          >
            Back to Generator
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-purple-300 px-5 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-50"
          >
            Pricing
          </Link>
        </div>

        {missingToken ? (
          <p className="mt-4 text-xs text-gray-400">
            Tip: this page should be opened from PayPal return URL.
          </p>
        ) : null}
      </div>
    </main>
  )
}

export default function PaySuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50 px-4 py-10">
          <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-xl">
            <h1 className="text-3xl font-extrabold text-gray-800">Payment Result</h1>
            <p className="mt-4 text-sm text-gray-500">Loading…</p>
          </div>
        </main>
      }
    >
      <PaySuccessContent />
    </Suspense>
  )
}
