import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getRequestUser } from '@/lib/server/auth'
import { createOrder } from '@/lib/server/billing'
import { logError, logInfo } from '@/lib/server/logger'
import { createPaypalOrder } from '@/lib/server/paypal'
import { getProductByCode } from '@/lib/server/products'
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

  const body = (await req.json()) as {
    product_code?: string
    return_url?: string
    cancel_url?: string
  }

  const productCode = body.product_code ?? ''
  const product = getProductByCode(productCode)
  if (!product) {
    return NextResponse.json({ error: 'Unknown product', requestId }, { status: 400 })
  }

  const origin = req.nextUrl.origin
  const returnUrl = body.return_url ?? `${origin}/pricing?status=success`
  const cancelUrl = body.cancel_url ?? `${origin}/pricing?status=cancel`

  try {
    logInfo('pay.checkout', 'checkout started', { requestId, userId: user.id, productCode })
    const paypal = await createPaypalOrder({
      amount: product.amount,
      currency: product.currency,
      customId: `${user.id}:${product.code}`,
      returnUrl,
      cancelUrl,
      description: `${product.name} - ${product.credits} credits`,
    })

    const orderId = await createOrder({
      userId: user.id,
      productCode: product.code,
      amount: product.amount,
      currency: product.currency,
      provider: 'paypal',
      providerOrderId: paypal.paypalOrderId,
    })

    return NextResponse.json({
      request_id: requestId,
      order_id: orderId,
      paypal_order_id: paypal.paypalOrderId,
      approve_url: paypal.approveUrl,
    })
  } catch (e) {
    logError('pay.checkout', 'checkout failed', { requestId, error: String(e) })
    return NextResponse.json({ error: 'Checkout failed', requestId }, { status: 500 })
  }
}
