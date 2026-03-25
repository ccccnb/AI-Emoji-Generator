import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getRequestUser } from '@/lib/server/auth'
import { reserveGenerationQuota, rollbackGenerationQuota, isCloudQuotaEnabled } from '@/lib/server/quota'

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!isCloudQuotaEnabled()) {
    return NextResponse.json({ error: 'Cloud quota is disabled' }, { status: 503 })
  }

  const user = await getRequestUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as { workers?: number; rounds?: number }
  const workers = Math.min(Math.max(Number(body.workers ?? 8), 1), 50)
  const rounds = Math.min(Math.max(Number(body.rounds ?? 20), 1), 200)

  let success = 0
  let fail = 0

  await Promise.all(
    Array.from({ length: workers }).map(async (_, w) => {
      for (let i = 0; i < rounds; i++) {
        const rid = `race-${w}-${i}-${randomUUID()}`
        try {
          const r = await reserveGenerationQuota(user, rid)
          await rollbackGenerationQuota(r)
          success += 1
        } catch {
          fail += 1
        }
      }
    })
  )

  return NextResponse.json({
    ok: true,
    workers,
    rounds,
    attempts: workers * rounds,
    success,
    fail,
  })
}
