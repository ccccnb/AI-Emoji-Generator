import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/auth'
import { getRecentOrders } from '@/lib/server/billing'
import { getQuotaSnapshot, isCloudQuotaEnabled } from '@/lib/server/quota'

export async function GET(req: NextRequest) {
  if (!isCloudQuotaEnabled()) {
    return NextResponse.json({
      enabled: false,
      message: 'Cloud billing is disabled. Configure Supabase env variables.',
    })
  }

  try {
    const user = await getRequestUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [quota, orders] = await Promise.all([getQuotaSnapshot(user), getRecentOrders(user.id)])

    return NextResponse.json({
      enabled: true,
      quota,
      orders,
    })
  } catch (e) {
    console.error('billing fetch failed:', e)
    return NextResponse.json({ error: 'Failed to fetch billing data' }, { status: 500 })
  }
}
