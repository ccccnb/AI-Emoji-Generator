import { getSupabaseAdminClient } from './supabase'

export async function createOrder(params: {
  userId: string
  productCode: string
  amount: string
  currency: string
  provider: 'paypal'
  providerOrderId: string
}): Promise<string> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('orders')
    .insert({
      user_id: params.userId,
      product_code: params.productCode,
      amount: params.amount,
      currency: params.currency,
      provider: params.provider,
      provider_order_id: params.providerOrderId,
      status: 'created',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function completeOrderAndGrantCredits(params: {
  providerOrderId: string
  providerCaptureId: string | null
  payerEmail: string | null
  expectedUserId?: string
}): Promise<{ orderId: string; creditsAdded: number; alreadyPaid: boolean }> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase.rpc('finalize_paypal_order', {
    p_provider_order_id: params.providerOrderId,
    p_provider_capture_id: params.providerCaptureId,
    p_payer_email: params.payerEmail,
    p_expected_user_id: params.expectedUserId ?? null,
  })

  if (error) {
    const msg = error.message || ''
    const errCode = (error as { code?: string }).code ?? ''
    if (
      errCode === 'PGRST202' ||
      msg.includes('finalize_paypal_order') ||
      msg.includes('Could not find the function public.finalize_paypal_order')
    ) {
      throw new Error('FINALIZE_RPC_MISSING')
    }
    if (msg.includes('ORDER_OWNERSHIP_MISMATCH')) {
      throw new Error('ORDER_OWNERSHIP_MISMATCH')
    }
    if (msg.includes('ORDER_NOT_FOUND')) {
      throw new Error('ORDER_NOT_FOUND')
    }
    if (msg.includes('UNKNOWN_PRODUCT_CODE')) {
      throw new Error('UNKNOWN_PRODUCT_CODE')
    }
    throw error
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    throw new Error('EMPTY_FINALIZE_RESULT')
  }
  return {
    orderId: String(row.order_id),
    creditsAdded: Number(row.credits_added ?? 0),
    alreadyPaid: Boolean(row.already_paid),
  }
}

export async function getFinalizeRpcStatus(): Promise<{
  status: 'ready' | 'missing' | 'unknown'
  detail?: string
}> {
  const supabase = getSupabaseAdminClient()
  const probeId = '__probe__'
  const { error } = await supabase.rpc('finalize_paypal_order', {
    p_provider_order_id: probeId,
    p_provider_capture_id: null,
    p_payer_email: null,
    p_expected_user_id: null,
  })

  if (!error) return { status: 'ready' }

  const msg = error.message || ''
  const errCode = (error as { code?: string }).code ?? ''
  if (
    errCode === 'PGRST202' ||
    msg.includes('finalize_paypal_order') ||
    msg.includes('Could not find the function public.finalize_paypal_order')
  ) {
    return { status: 'missing', detail: msg }
  }

  if (msg.includes('ORDER_NOT_FOUND') || msg.includes('P0001')) {
    return { status: 'ready' }
  }

  return { status: 'unknown', detail: msg }
}

export async function markOrderFailed(providerOrderId: string): Promise<void> {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('orders')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('provider_order_id', providerOrderId)
  if (error) throw error
}

export async function insertWebhookEvent(params: {
  eventId: string
  eventType: string
  payload: unknown
}): Promise<boolean> {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase.from('webhook_events').insert({
    provider: 'paypal',
    event_id: params.eventId,
    event_type: params.eventType,
    payload: params.payload,
  })

  if (!error) return true

  // 23505 unique violation => already processed
  if ((error as { code?: string }).code === '23505') return false
  throw error
}

export async function getRecentOrders(userId: string): Promise<
  Array<{
    id: string
    productCode: string
    amount: string
    currency: string
    status: string
    createdAt: string
  }>
> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('orders')
    .select('id,product_code,amount,currency,status,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id as string,
    productCode: row.product_code as string,
    amount: String(row.amount),
    currency: row.currency as string,
    status: row.status as string,
    createdAt: row.created_at as string,
  }))
}

export async function getCreditLedger(userId: string): Promise<
  Array<{
    id: number
    delta: number
    reason: string
    requestId: string | null
    createdAt: string
  }>
> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('credit_ledger')
    .select('id,delta,reason,request_id,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    delta: Number(row.delta),
    reason: String(row.reason),
    requestId: (row.request_id as string | null) ?? null,
    createdAt: String(row.created_at),
  }))
}

export async function getUsageHistory(userId: string): Promise<
  Array<{
    id: number
    requestId: string
    style: string
    imageCount: number
    costCredits: number
    status: string
    providerLatencyMs: number
    createdAt: string
  }>
> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('usage_logs')
    .select('id,request_id,style,image_count,cost_credits,status,provider_latency_ms,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    requestId: String(row.request_id),
    style: String(row.style),
    imageCount: Number(row.image_count),
    costCredits: Number(row.cost_credits),
    status: String(row.status),
    providerLatencyMs: Number(row.provider_latency_ms),
    createdAt: String(row.created_at),
  }))
}

export async function insertImageHistory(params: {
  userId: string
  requestId: string
  prompt: string
  style: string
  topText: string
  bottomText: string
  imageUrls: string[]
}): Promise<void> {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase.from('images_history').insert({
    user_id: params.userId,
    request_id: params.requestId,
    prompt: params.prompt,
    style: params.style,
    top_text: params.topText,
    bottom_text: params.bottomText,
    image_urls: params.imageUrls,
  })
  if (error) throw error
}

export async function getImageHistory(
  userId: string,
  options?: { cursor?: string; limit?: number }
): Promise<{
  items: Array<{
    id: number
    requestId: string
    prompt: string
    style: string
    topText: string
    bottomText: string
    imageUrls: string[]
    createdAt: string
  }>
  nextCursor: string | null
}> {
  const supabase = getSupabaseAdminClient()
  const limit = Math.min(Math.max(options?.limit ?? 12, 1), 50)
  let query = supabase
    .from('images_history')
    .select('id,request_id,prompt,style,top_text,bottom_text,image_urls,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (options?.cursor) {
    query = query.lt('created_at', options.cursor)
  }

  const { data, error } = await query
  if (error) throw error

  const raw = (data ?? []).map((row) => ({
    id: Number(row.id),
    requestId: String(row.request_id),
    prompt: String(row.prompt),
    style: String(row.style),
    topText: String(row.top_text ?? ''),
    bottomText: String(row.bottom_text ?? ''),
    imageUrls: Array.isArray(row.image_urls)
      ? (row.image_urls as unknown[]).filter((u): u is string => typeof u === 'string')
      : [],
    createdAt: String(row.created_at),
  }))

  const hasMore = raw.length > limit
  const items = hasMore ? raw.slice(0, limit) : raw
  const nextCursor = hasMore ? items[items.length - 1]?.createdAt ?? null : null

  return { items, nextCursor }
}

export async function getFavoriteHistoryIds(userId: string): Promise<number[]> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('history_favorites')
    .select('image_history_id')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? [])
    .map((row) => Number(row.image_history_id))
    .filter((n) => Number.isFinite(n))
}

export async function setHistoryFavorite(params: {
  userId: string
  historyId: number
  favorited: boolean
}): Promise<void> {
  const supabase = getSupabaseAdminClient()
  if (params.favorited) {
    const { error } = await supabase.from('history_favorites').upsert(
      {
        user_id: params.userId,
        image_history_id: params.historyId,
      },
      { onConflict: 'user_id,image_history_id', ignoreDuplicates: true }
    )
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('history_favorites')
    .delete()
    .eq('user_id', params.userId)
    .eq('image_history_id', params.historyId)
  if (error) throw error
}

export async function getUsageStats(userId: string): Promise<{
  generatedLast7d: number
  favoritesCount: number
}> {
  const supabase = getSupabaseAdminClient()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [{ count: generatedCount, error: generatedErr }, { count: favoriteCount, error: favErr }] =
    await Promise.all([
      supabase
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'success')
        .gte('created_at', since),
      supabase
        .from('history_favorites')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ])

  if (generatedErr) throw generatedErr
  if (favErr) throw favErr

  return {
    generatedLast7d: generatedCount ?? 0,
    favoritesCount: favoriteCount ?? 0,
  }
}

export async function getOpsSummary(): Promise<{
  usersProfileCount: number
  recentWebhook24h: number
  recentUsage24h: number
}> {
  const supabase = getSupabaseAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: usersCount, error: usersErr },
    { count: webhooksCount, error: webhooksErr },
    { count: usageCount, error: usageErr },
  ] = await Promise.all([
    supabase.from('users_profile').select('*', { count: 'exact', head: true }),
    supabase
      .from('webhook_events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since),
    supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since),
  ])

  if (usersErr) throw usersErr
  if (webhooksErr) throw webhooksErr
  if (usageErr) throw usageErr

  return {
    usersProfileCount: usersCount ?? 0,
    recentWebhook24h: webhooksCount ?? 0,
    recentUsage24h: usageCount ?? 0,
  }
}
