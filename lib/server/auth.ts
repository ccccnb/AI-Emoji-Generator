import { NextRequest } from 'next/server'
import { getSupabaseAdminClient, isSupabaseEnabled } from './supabase'

export type RequestUser = {
  id: string
  email: string | null
}

export async function getRequestUser(req: NextRequest): Promise<RequestUser | null> {
  const authorization = req.headers.get('authorization')
  const hasBearer = authorization?.startsWith('Bearer ')

  if (hasBearer && isSupabaseEnabled()) {
    const token = authorization!.slice('Bearer '.length).trim()
    if (token) {
      const supabase = getSupabaseAdminClient()
      const { data, error } = await supabase.auth.getUser(token)
      if (!error && data.user) {
        return { id: data.user.id, email: data.user.email ?? null }
      }
    }
  }

  // Local dev escape hatch until login UI is wired.
  if (process.env.NODE_ENV !== 'production') {
    const devUserId = req.headers.get('x-dev-user-id')
    if (devUserId) {
      return { id: devUserId, email: null }
    }
  }

  return null
}
