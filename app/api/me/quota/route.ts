import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/auth'
import { getQuotaSnapshot, isCloudQuotaEnabled } from '@/lib/server/quota'

export async function GET(req: NextRequest) {
  if (!isCloudQuotaEnabled()) {
    return NextResponse.json({
      enabled: false,
      message: 'Cloud quota is disabled. Configure Supabase env variables.',
    })
  }

  try {
    const user = await getRequestUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const quota = await getQuotaSnapshot(user)
    return NextResponse.json({ enabled: true, ...quota })
  } catch (e) {
    console.error('quota fetch failed:', e)
    return NextResponse.json({ error: 'Failed to fetch quota' }, { status: 500 })
  }
}
