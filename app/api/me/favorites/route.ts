import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/auth'
import { getFavoriteHistoryIds, setHistoryFavorite } from '@/lib/server/billing'
import { isCloudQuotaEnabled } from '@/lib/server/quota'

export async function GET(req: NextRequest) {
  if (!isCloudQuotaEnabled()) {
    return NextResponse.json({ enabled: false, ids: [] })
  }

  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ids = await getFavoriteHistoryIds(user.id)
    return NextResponse.json({ enabled: true, ids })
  } catch (e) {
    console.error('favorites fetch failed:', e)
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isCloudQuotaEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 503 })
  }

  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as { history_id?: number; favorited?: boolean }
    const historyId = Number(body.history_id)
    const favorited = Boolean(body.favorited)
    if (!Number.isFinite(historyId)) {
      return NextResponse.json({ error: 'history_id is required' }, { status: 400 })
    }

    await setHistoryFavorite({ userId: user.id, historyId, favorited })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('favorites update failed:', e)
    return NextResponse.json({ error: 'Failed to update favorite' }, { status: 500 })
  }
}
