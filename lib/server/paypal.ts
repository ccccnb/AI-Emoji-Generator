const PAYPAL_API_BASE =
  process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'

type PaypalOrderRequest = {
  amount: string
  currency: string
  customId: string
  returnUrl: string
  cancelUrl: string
  description: string
}

type PaypalOrderResponse = {
  id: string
  links?: Array<{ href: string; rel: string; method: string }>
}

function ensurePaypalEnv() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('PayPal env is not configured')
  }
  return { clientId, clientSecret }
}

async function getPaypalAccessToken(): Promise<string> {
  const { clientId, clientSecret } = ensurePaypalEnv()
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to get PayPal token: ${text}`)
  }
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export async function createPaypalOrder(
  req: PaypalOrderRequest
): Promise<{ paypalOrderId: string; approveUrl: string }> {
  const token = await getPaypalAccessToken()
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: req.customId,
          description: req.description,
          amount: { currency_code: req.currency, value: req.amount },
        },
      ],
      application_context: {
        return_url: req.returnUrl,
        cancel_url: req.cancelUrl,
        user_action: 'PAY_NOW',
      },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to create PayPal order: ${text}`)
  }
  const data = (await res.json()) as PaypalOrderResponse
  const approveUrl = data.links?.find((l) => l.rel === 'approve')?.href
  if (!data.id || !approveUrl) {
    throw new Error('Invalid PayPal order response')
  }
  return { paypalOrderId: data.id, approveUrl }
}

type PaypalOrderPayload = {
  status?: string
  payer?: { email_address?: string }
  purchase_units?: Array<{
    payments?: { captures?: Array<{ id?: string }> }
  }>
}

function parseCapturedOrderPayload(data: PaypalOrderPayload): {
  status: string
  captureId: string | null
  payerEmail: string | null
} {
  const captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null
  return {
    status: data.status ?? 'UNKNOWN',
    captureId,
    payerEmail: data.payer?.email_address ?? null,
  }
}

function paypalErrorHasIssue(bodyText: string, issue: string): boolean {
  try {
    const j = JSON.parse(bodyText) as { details?: Array<{ issue?: string }> }
    return j.details?.some((d) => d.issue === issue) ?? false
  } catch {
    return false
  }
}

async function getPaypalOrderPayload(paypalOrderId: string): Promise<PaypalOrderPayload> {
  const token = await getPaypalAccessToken()
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Failed to fetch PayPal order: ${text}`)
  }
  return JSON.parse(text) as PaypalOrderPayload
}

export async function capturePaypalOrder(paypalOrderId: string): Promise<{
  status: string
  captureId: string | null
  payerEmail: string | null
  /** True when POST /capture returned ORDER_ALREADY_CAPTURED and details were loaded via GET order */
  fromExistingCapture?: boolean
}> {
  const token = await getPaypalAccessToken()
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  const text = await res.text()
  if (res.ok) {
    const data = JSON.parse(text) as PaypalOrderPayload
    return parseCapturedOrderPayload(data)
  }
  if (paypalErrorHasIssue(text, 'ORDER_ALREADY_CAPTURED')) {
    const order = await getPaypalOrderPayload(paypalOrderId)
    return { ...parseCapturedOrderPayload(order), fromExistingCapture: true }
  }
  throw new Error(`Failed to capture PayPal order: ${text}`)
}

export async function verifyPaypalWebhookSignature(params: {
  headers: Headers
  rawBody: string
}): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) return false

  const token = await getPaypalAccessToken()
  const transmissionId = params.headers.get('paypal-transmission-id')
  const transmissionTime = params.headers.get('paypal-transmission-time')
  const certUrl = params.headers.get('paypal-cert-url')
  const authAlgo = params.headers.get('paypal-auth-algo')
  const transmissionSig = params.headers.get('paypal-transmission-sig')

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return false
  }

  const res = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: webhookId,
      webhook_event: JSON.parse(params.rawBody),
    }),
  })

  if (!res.ok) return false
  const data = (await res.json()) as { verification_status?: string }
  return data.verification_status === 'SUCCESS'
}
