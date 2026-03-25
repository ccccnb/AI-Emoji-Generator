import { getSupabaseAdminClient, isSupabaseEnabled } from './supabase'
import type { RequestUser } from './auth'

const DEFAULT_DAILY_FREE_QUOTA = 5
const DEFAULT_PLAN_TIER = 'free'
const DEFAULT_GENERATION_COST = 1
const MAX_QUOTA_RETRIES = 3

type UserProfileRow = {
  id: string
  email: string | null
  plan_tier: string
  credit_balance: number
  daily_free_quota: number
  daily_used: number
  quota_date: string
}

type UsageStatus = 'success' | 'failed'

export type QuotaSnapshot = {
  planTier: string
  creditBalance: number
  dailyRemaining: number
  dailyUsed: number
  dailyFreeQuota: number
  quotaDate: string
}

export type QuotaReservation = {
  userId: string
  requestId: string
  mode: 'free' | 'credit'
  costCredits: number
}

export function isCloudQuotaEnabled(): boolean {
  return isSupabaseEnabled()
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function getOrCreateUserProfile(user: RequestUser): Promise<UserProfileRow> {
  const supabase = getSupabaseAdminClient()
  const now = today()

  const { data: existing, error: selectError } = await supabase
    .from('users_profile')
    .select(
      'id,email,plan_tier,credit_balance,daily_free_quota,daily_used,quota_date'
    )
    .eq('id', user.id)
    .maybeSingle()

  if (selectError) throw selectError
  if (existing) return existing as UserProfileRow

  const payload = {
    id: user.id,
    email: user.email,
    plan_tier: DEFAULT_PLAN_TIER,
    credit_balance: 0,
    daily_free_quota: DEFAULT_DAILY_FREE_QUOTA,
    daily_used: 0,
    quota_date: now,
  }

  const { data: inserted, error: insertError } = await supabase
    .from('users_profile')
    .insert(payload)
    .select(
      'id,email,plan_tier,credit_balance,daily_free_quota,daily_used,quota_date'
    )
    .single()

  if (insertError) throw insertError
  return inserted as UserProfileRow
}

async function resetDailyIfNeeded(profile: UserProfileRow): Promise<UserProfileRow> {
  const now = today()
  if (profile.quota_date === now) return profile

  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('users_profile')
    .update({ daily_used: 0, quota_date: now, updated_at: new Date().toISOString() })
    .eq('id', profile.id)
    .select(
      'id,email,plan_tier,credit_balance,daily_free_quota,daily_used,quota_date'
    )
    .single()

  if (error) throw error
  return data as UserProfileRow
}

function toSnapshot(row: UserProfileRow): QuotaSnapshot {
  return {
    planTier: row.plan_tier,
    creditBalance: row.credit_balance,
    dailyRemaining: Math.max(0, row.daily_free_quota - row.daily_used),
    dailyUsed: row.daily_used,
    dailyFreeQuota: row.daily_free_quota,
    quotaDate: row.quota_date,
  }
}

export async function getQuotaSnapshot(user: RequestUser): Promise<QuotaSnapshot> {
  const profile = await getOrCreateUserProfile(user)
  const normalized = await resetDailyIfNeeded(profile)
  return toSnapshot(normalized)
}

export async function reserveGenerationQuota(
  user: RequestUser,
  requestId: string,
  costCredits = DEFAULT_GENERATION_COST
): Promise<QuotaReservation> {
  const supabase = getSupabaseAdminClient()
  let profile = await resetDailyIfNeeded(await getOrCreateUserProfile(user))

  // Reset daily counters once date changes; idempotent and safe.
  const now = today()
  if (profile.quota_date !== now) {
    await supabase
      .from('users_profile')
      .update({ daily_used: 0, quota_date: now, updated_at: new Date().toISOString() })
      .eq('id', profile.id)
    profile = await resetDailyIfNeeded(profile)
  }

  for (let i = 0; i < MAX_QUOTA_RETRIES; i++) {
    if (profile.daily_used < profile.daily_free_quota) {
      const { data, error } = await supabase
        .from('users_profile')
        .update({
          daily_used: profile.daily_used + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)
        .eq('daily_used', profile.daily_used)
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (data?.id) {
        return { userId: profile.id, requestId, mode: 'free', costCredits: 0 }
      }

      // Lost update race; re-read and retry.
      profile = await resetDailyIfNeeded(await getOrCreateUserProfile(user))
      continue
    }

    if (profile.credit_balance < costCredits) {
      throw new Error('INSUFFICIENT_QUOTA')
    }

    const { data, error: debitError } = await supabase
      .from('users_profile')
      .update({
        credit_balance: profile.credit_balance - costCredits,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id)
      .eq('credit_balance', profile.credit_balance)
      .select('id')
      .maybeSingle()

    if (debitError) throw debitError
    if (!data?.id) {
      profile = await resetDailyIfNeeded(await getOrCreateUserProfile(user))
      continue
    }

    const { error: ledgerError } = await supabase.from('credit_ledger').insert({
      user_id: profile.id,
      delta: -costCredits,
      reason: 'generation',
      request_id: requestId,
    })
    if (ledgerError) throw ledgerError

    return { userId: profile.id, requestId, mode: 'credit', costCredits }
  }

  // If retries are exhausted, treat as contention and ask caller to retry.
  throw new Error('QUOTA_CONTENTION')
}

export async function rollbackGenerationQuota(reservation: QuotaReservation): Promise<void> {
  const supabase = getSupabaseAdminClient()

  if (reservation.mode === 'free') {
    const { data, error } = await supabase
      .from('users_profile')
      .select('daily_used')
      .eq('id', reservation.userId)
      .single()
    if (error) throw error

    const nextDailyUsed = Math.max(0, (data?.daily_used as number) - 1)
    const { error: updateError } = await supabase
      .from('users_profile')
      .update({ daily_used: nextDailyUsed, updated_at: new Date().toISOString() })
      .eq('id', reservation.userId)
    if (updateError) throw updateError
    return
  }

  if (reservation.costCredits > 0) {
    const { data, error } = await supabase
      .from('users_profile')
      .select('credit_balance')
      .eq('id', reservation.userId)
      .single()
    if (error) throw error

    const creditBalance = (data?.credit_balance as number) ?? 0
    const { error: refundError } = await supabase
      .from('users_profile')
      .update({
        credit_balance: creditBalance + reservation.costCredits,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservation.userId)
    if (refundError) throw refundError

    const { error: ledgerError } = await supabase.from('credit_ledger').insert({
      user_id: reservation.userId,
      delta: reservation.costCredits,
      reason: 'generation_refund',
      request_id: reservation.requestId,
    })
    if (ledgerError) throw ledgerError
  }
}

export async function logUsage(params: {
  userId: string
  requestId: string
  style: string
  imageCount: number
  costCredits: number
  status: UsageStatus
  providerLatencyMs: number
  promptHash?: string
}): Promise<void> {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase.from('usage_logs').insert({
    user_id: params.userId,
    request_id: params.requestId,
    prompt_hash: params.promptHash ?? null,
    style: params.style,
    image_count: params.imageCount,
    cost_credits: params.costCredits,
    status: params.status,
    provider_latency_ms: params.providerLatencyMs,
  })
  if (error) throw error
}
