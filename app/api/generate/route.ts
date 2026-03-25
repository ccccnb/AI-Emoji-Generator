import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomUUID } from 'crypto'
import { getRequestUser } from '@/lib/server/auth'
import { insertImageHistory } from '@/lib/server/billing'
import { logError, logInfo } from '@/lib/server/logger'
import {
  isCloudQuotaEnabled,
  logUsage,
  reserveGenerationQuota,
  rollbackGenerationQuota,
} from '@/lib/server/quota'

/** Kolors 对英文提示更敏感；风格段放最前，用户描述作为「主体」紧随其后 */
const STYLE_PACKS: Record<
  string,
  { lead: string; negative: string }
> = {
  cartoon: {
    lead:
      '2D flat cartoon mascot emoji, bold clean outlines, simple cel shading, bright flat colors, cute proportions, vector sticker look, NOT a photograph',
    negative:
      'photorealistic, realistic photo, photograph, dslr, 8k uhd, skin pores, hyperrealistic, blurry, watermark, text, logo, frame',
  },
  pixel: {
    lead:
      'pixel art emoji sprite, crisp square pixels, limited retro palette, 16-bit game asset style, visible pixel grid aesthetic, NOT smooth gradients',
    negative:
      'photorealistic, smooth gradient airbrush, vector flat, 3d render, oil painting, blurry, watermark, text',
  },
  '3d': {
    lead:
      '3D rendered emoji icon, soft studio lighting, smooth glossy plastic material, rounded Apple-style 3D mascot, subtle subsurface scattering',
    negative:
      'flat 2d, pixel art, sketch, line art only, photograph, photorealistic fur, noisy, watermark, text',
  },
  minimal: {
    lead:
      'ultra minimal geometric emoji icon, very few shapes, limited flat colors, clean negative space, Swiss graphic simplicity',
    negative:
      'busy detail, photorealistic, 3d render, texture noise, gradient mesh, ornate, watermark, text, sketch',
  },
  watercolor: {
    lead:
      'soft watercolor illustration emoji, gentle pigment bleed on paper, light washes, hand-painted charm, pastel-friendly',
    negative:
      'vector sharp edges only, pixel art, 3d plastic, photorealistic, harsh digital, oily, watermark, text',
  },
  anime: {
    lead:
      'Japanese anime style emoji, clean cel shading, anime highlights, cute simplified features, production anime coloring',
    negative:
      'western photorealistic, 3d cgi movie, pixel art, oil painting, western cartoon thick rubber hose, watermark, text',
  },
  sticker: {
    lead:
      'kawaii die-cut vinyl sticker emoji, thick white outer border, flat vibrant fills, slight gloss, social sticker pack style',
    negative:
      'no white outline, photorealistic, messy background scene, full environment, watermark, text, blurry',
  },
  clay: {
    lead:
      'stop-motion claymation emoji, hand-sculpted plasticine look, soft finger marks, studio clay character, warm soft lighting',
    negative:
      'flat vector, pixel art, sharp digital illustration, photorealistic real fur, metal, glass, watermark, text',
  },
}

const DEFAULT_STYLE = 'cartoon'

const BASE_TAIL =
  'single centered subject, plain solid white background, square composition, high quality, no text in image'

function buildPrompt(userPrompt: string, styleKey: string): { prompt: string; negative: string } {
  const pack = STYLE_PACKS[styleKey] ?? STYLE_PACKS[DEFAULT_STYLE]
  const subject = userPrompt.trim()
  const prompt = `${pack.lead}. Main subject: ${subject}. ${BASE_TAIL}.`
  const negative = `${pack.negative}, duplicate, cropped, deformed`
  return { prompt, negative }
}

function extractImageUrls(data: unknown): string[] {
  if (!data || typeof data !== 'object') return []
  const o = data as Record<string, unknown>
  const raw = Array.isArray(o.images)
    ? o.images
    : Array.isArray(o.data)
      ? o.data
      : []
  return raw
    .map((item: unknown) => {
      if (item && typeof item === 'object' && 'url' in item) {
        const u = (item as { url: unknown }).url
        return typeof u === 'string' ? u : ''
      }
      return ''
    })
    .filter(Boolean)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  const styleKey = typeof body.style === 'string' ? body.style : DEFAULT_STYLE
  const topText = typeof body.topText === 'string' ? body.topText : ''
  const bottomText = typeof body.bottomText === 'string' ? body.bottomText : ''
  const requestId = randomUUID()
  const promptHash = createHash('sha256').update(prompt).digest('hex')
  const authRequired =
    process.env.ENFORCE_AUTH_FOR_GENERATE === '1' ||
    process.env.ENFORCE_AUTH_FOR_GENERATE === 'true'

  if (!prompt.trim()) {
    return NextResponse.json({ error: 'Prompt is required', requestId }, { status: 400 })
  }

  const apiKey = process.env.SILICONFLOW_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured', requestId }, { status: 500 })
  }

  const { prompt: fullPrompt, negative } = buildPrompt(prompt, styleKey)
  const cloudQuota = isCloudQuotaEnabled()
  const user = await getRequestUser(req)

  if (cloudQuota && authRequired && !user) {
    return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401 })
  }

  let reservation: Awaited<ReturnType<typeof reserveGenerationQuota>> | null = null
  if (cloudQuota && user) {
    try {
      reservation = await reserveGenerationQuota(user, requestId)
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      if (message === 'INSUFFICIENT_QUOTA') {
        return NextResponse.json({ error: 'Insufficient quota', requestId }, { status: 402 })
      }
      if (message === 'QUOTA_CONTENTION') {
        return NextResponse.json(
          { error: 'Quota is busy, please retry', requestId },
          { status: 409 }
        )
      }
      logError('generate', 'quota reservation failed', { requestId, error: String(e) })
      return NextResponse.json({ error: 'Quota check failed', requestId }, { status: 500 })
    }
  }

  try {
    logInfo('generate', 'generation started', { requestId, style: styleKey, hasUser: Boolean(user) })
    const startedAt = Date.now()
    const response = await fetch('https://api.siliconflow.cn/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Kwai-Kolors/Kolors',
        prompt: fullPrompt,
        negative_prompt: negative,
        image_size: '1024x1024',
        batch_size: 4,
        num_inference_steps: 22,
        guidance_scale: 9.5,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      logError('generate', 'provider API error', { requestId, detail: err })
      if (reservation) {
        await rollbackGenerationQuota(reservation)
        await logUsage({
          userId: reservation.userId,
          requestId,
          style: styleKey,
          imageCount: 0,
          costCredits: reservation.costCredits,
          status: 'failed',
          providerLatencyMs: Date.now() - startedAt,
          promptHash,
        })
      }
      return NextResponse.json({ error: 'Generation failed', requestId }, { status: 500 })
    }

    const data = await response.json()
    const images = extractImageUrls(data)
    if (reservation) {
      await insertImageHistory({
        userId: reservation.userId,
        requestId,
        prompt,
        style: styleKey,
        topText,
        bottomText,
        imageUrls: images,
      })
      await logUsage({
        userId: reservation.userId,
        requestId,
        style: styleKey,
        imageCount: images.length,
        costCredits: reservation.costCredits,
        status: 'success',
        providerLatencyMs: Date.now() - startedAt,
        promptHash,
      })
    }
    logInfo('generate', 'generation success', {
      requestId,
      imageCount: images.length,
      elapsedMs: Date.now() - startedAt,
    })
    return NextResponse.json({ images, requestId })
  } catch (e) {
    logError('generate', 'generation failed', { requestId, error: String(e) })
    if (reservation) {
      try {
        await rollbackGenerationQuota(reservation)
        await logUsage({
          userId: reservation.userId,
          requestId,
          style: styleKey,
          imageCount: 0,
          costCredits: reservation.costCredits,
          status: 'failed',
          providerLatencyMs: 0,
          promptHash,
        })
      } catch (rollbackError) {
        logError('generate', 'quota rollback failed', {
          requestId,
          error: String(rollbackError),
        })
      }
    }
    return NextResponse.json({ error: 'Network error', requestId }, { status: 500 })
  }
}
