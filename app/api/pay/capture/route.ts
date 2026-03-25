import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getRequestUser } from '@/lib/server/auth'
import { completeOrderAndGrantCredits, markOrderFailed } from '@/lib/server/billing'
import { logError, logInfo } from '@/lib/server/logger'
import { capturePaypalOrder } from '@/lib/server/paypal'
import { isCloudQuotaEnabled } from '@/lib/server/quota'

export async function POST(req: NextRequest) {
  const requestId = randomUUID()
  if (!isCloudQuotaEnabled()) {
    return NextResponse.json({ error: 'Cloud billing is not configured', requestId }, { status: 503 })
  }

  const user = await getRequestUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401 })
  }

  const body = (await req.json()) as { paypal_order_id?: string }
  const paypalOrderId = body.paypal_order_id?.trim()
  if (!paypalOrderId) {
    return NextResponse.json({ error: 'paypal_order_id is required', requestId }, { status: 400 })
  }

  try {
    logInfo('pay.capture', 'capture started', { requestId, paypalOrderId })
    const capture = await capturePaypalOrder(paypalOrderId)
    if (capture.fromExistingCapture) {
      logInfo('pay.capture', 'order already captured; reconciled via GET order', {
        requestId,
        paypalOrderId,
      })
    }
    if (capture.status !== 'COMPLETED') {
      await markOrderFailed(paypalOrderId)
      return NextResponse.json({ error: 'Payment not completed', requestId }, { status: 402 })
    }

    const result = await completeOrderAndGrantCredits({
      providerOrderId: paypalOrderId,
      providerCaptureId: capture.captureId,
      payerEmail: capture.payerEmail,
      expectedUserId: user.id,
    })

    return NextResponse.json({
      request_id: requestId,
      status: 'paid',
      order_id: result.orderId,
      credits_added: result.creditsAdded,
      already_paid: result.alreadyPaid,
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'ORDER_OWNERSHIP_MISMATCH') {
      return NextResponse.json({ error: 'Forbidden', requestId }, { status: 403 })
    }
    if (e instanceof Error && e.message === 'FINALIZE_RPC_MISSING') {
      return NextResponse.json(
        {
          error: 'Server migration missing: finalize_paypal_order',
          requestId,
        },
        { status: 503 }
      )
    }
    logError('pay.capture', 'capture failed', { requestId, error: String(e) })
    return NextResponse.json({ error: 'Capture failed', requestId }, { status: 500 })
  }
}
