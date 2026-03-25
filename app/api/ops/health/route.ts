import { NextResponse } from 'next/server'
import { isSupabaseEnabled } from '@/lib/server/supabase'
import { getFinalizeRpcStatus, getOpsSummary } from '@/lib/server/billing'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const env = {
    siliconflow: Boolean(process.env.SILICONFLOW_API_KEY),
    supabase: isSupabaseEnabled(),
    paypalClientId: Boolean(process.env.PAYPAL_CLIENT_ID),
    paypalSecret: Boolean(process.env.PAYPAL_CLIENT_SECRET),
    paypalWebhookId: Boolean(process.env.PAYPAL_WEBHOOK_ID),
  }

  let summary: Awaited<ReturnType<typeof getOpsSummary>> | null = null
  let migrations: {
    finalizePaypalOrderRpc: 'ready' | 'missing' | 'unknown'
    detail?: string
  } | null = null
  if (env.supabase) {
    try {
      const [s, rpc] = await Promise.all([getOpsSummary(), getFinalizeRpcStatus()])
      summary = s
      migrations = {
        finalizePaypalOrderRpc: rpc.status,
        detail: rpc.detail,
      }
    } catch (e) {
      console.error('ops summary failed:', e)
    }
  }

  return NextResponse.json({
    ok: true,
    env,
    summary,
    migrations,
    now: new Date().toISOString(),
  })
}
