import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/auth'
import { getFavoriteHistoryIds, getImageHistory } from '@/lib/server/billing'
import { isCloudQuotaEnabled } from '@/lib/server/quota'

export async function GET(req: NextRequest) {
  if (!isCloudQuotaEnabled()) {
    return NextResponse.json({
      enabled: false,
      message: 'Cloud history is disabled. Configure Supabase env variables.',
    })
  }

  try {
    const user = await getRequestUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined
    const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? 12)
    const limit = Number.isFinite(limitRaw) ? limitRaw : 12
    const [{ items, nextCursor }, favoriteIds] = await Promise.all([
      getImageHistory(user.id, { cursor, limit }),
      getFavoriteHistoryIds(user.id),
    ])
    const favored = new Set(favoriteIds)
    const withFavorite = items.map((item) => ({ ...item, favorited: favored.has(item.id) }))
    return NextResponse.json({ enabled: true, items: withFavorite, nextCursor })
  } catch (e) {
    console.error('history fetch failed:', e)
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
