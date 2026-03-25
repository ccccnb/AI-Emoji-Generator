import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { completeOrderAndGrantCredits, insertWebhookEvent } from '@/lib/server/billing'
import { logError, logInfo } from '@/lib/server/logger'
import { verifyPaypalWebhookSignature } from '@/lib/server/paypal'
import { isCloudQuotaEnabled } from '@/lib/server/quota'

type PaypalWebhookEvent = {
  id?: string
  event_type?: string
  resource?: {
    status?: string
    id?: string
    supplementary_data?: {
      related_ids?: {
        order_id?: string
      }
    }
    payer?: {
      email_address?: string
    }
  }
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID()
  if (!isCloudQuotaEnabled()) {
    return NextResponse.json({ ok: true, request_id: requestId })
  }

  const rawBody = await req.text()
  const verified = await verifyPaypalWebhookSignature({ headers: req.headers, rawBody })
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature', request_id: requestId }, { status: 401 })
  }

  const event = JSON.parse(rawBody) as PaypalWebhookEvent
  if (!event.id || !event.event_type) {
    return NextResponse.json({ error: 'Bad event payload', request_id: requestId }, { status: 400 })
  }
  logInfo('pay.webhook', 'webhook received', { requestId, eventId: event.id, eventType: event.event_type })

  const accepted = await insertWebhookEvent({
    eventId: event.id,
    eventType: event.event_type,
    payload: event,
  })
  if (!accepted) {
    return NextResponse.json({ ok: true, duplicate: true, request_id: requestId })
  }

  // Grant credits only on completed capture event.
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id
    if (paypalOrderId) {
      await completeOrderAndGrantCredits({
        providerOrderId: paypalOrderId,
        providerCaptureId: event.resource?.id ?? null,
        payerEmail: event.resource?.payer?.email_address ?? null,
      })
    } else {
      logError('pay.webhook', 'missing related order id', { requestId, eventId: event.id })
    }
  }

  return NextResponse.json({ ok: true, request_id: requestId })
}
