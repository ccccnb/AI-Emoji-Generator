import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/auth'
import { getCreditLedger, getRecentOrders, getUsageStats } from '@/lib/server/billing'
import { getQuotaSnapshot, isCloudQuotaEnabled } from '@/lib/server/quota'

export async function GET(req: NextRequest) {
  if (!isCloudQuotaEnabled()) {
    return NextResponse.json({
      enabled: false,
      message: 'Cloud account is disabled. Configure Supabase env variables.',
    })
  }

  try {
    const user = await getRequestUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [quota, orders, ledger, stats] = await Promise.all([
      getQuotaSnapshot(user),
      getRecentOrders(user.id),
      getCreditLedger(user.id),
      getUsageStats(user.id),
    ])

    return NextResponse.json({
      enabled: true,
      quota,
      orders,
      ledger,
      stats,
    })
  } catch (e) {
    console.error('account fetch failed:', e)
    return NextResponse.json({ error: 'Failed to fetch account data' }, { status: 500 })
  }
}
