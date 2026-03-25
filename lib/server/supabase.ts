import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type SupabaseEnv = {
  url: string
  anonKey: string
  serviceRoleKey: string
}

function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceRoleKey) return null
  return { url, anonKey, serviceRoleKey }
}

export function isSupabaseEnabled(): boolean {
  return readSupabaseEnv() !== null
}

let adminClient: SupabaseClient | null = null

export function getSupabaseAdminClient(): SupabaseClient {
  const env = readSupabaseEnv()
  if (!env) {
    throw new Error('Supabase is not configured')
  }

  if (!adminClient) {
    adminClient = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  return adminClient
}
