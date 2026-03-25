'use client'

import React, { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getDevAuthHeaders } from '@/lib/client/dev-auth'

// ─── 国际化文本 ───────────────────────────────────────────────────────────────

const i18n = {
  en: {
    title: 'AI Emoji Generator',
    subtitle: 'Turn any idea into a cute emoji in seconds',
    placeholder: 'Describe your emoji... e.g. happy cat eating pizza',
    memeLabel: 'Meme Text',
    styleLabel: 'Style',
    generate: 'Generate',
    generating: 'Generating...',
    download: 'Download Meme',
    resultTitle: 'Your Emojis',
    clickToMeme: 'Click image to preview meme',
    styles: {
      cartoon: 'Cartoon',
      pixel: 'Pixel',
      '3d': '3D',
      minimal: 'Minimal',
      watercolor: 'Watercolor',
      anime: 'Anime',
      sticker: 'Sticker',
      clay: 'Clay',
    },
    freeLeft: (n: number) => `${n} free generations left today`,
    noFree: 'Daily limit reached. Come back tomorrow!',
    error: 'Generation failed, please try again.',
    exportLabel: 'Export for',
    exportOriginal: 'Original PNG (full size)',
    exportWechat: 'WeChat sticker ~240 PNG',
    exportTelegram: 'Telegram sticker 512 WebP',
    exportDiscord: 'Discord emoji 128 PNG',
    exportHint:
      'Square crop, centered. Discord has a 256 KB limit — use Original and compress elsewhere if needed.',
  },
  zh: {
    title: 'AI Emoji 生成器',
    subtitle: '输入描述，秒出专属 emoji 表情',
    placeholder: '描述你想要的 emoji，例如：开心的猫咪吃披萨',
    memeLabel: '表情包文字',
    styleLabel: '风格',
    generate: '生成',
    generating: '生成中...',
    download: '下载表情包',
    resultTitle: '生成结果',
    clickToMeme: '点击图片预览表情包效果',
    styles: {
      cartoon: '卡通',
      pixel: '像素',
      '3d': '3D',
      minimal: '简约',
      watercolor: '水彩',
      anime: '动漫',
      sticker: '贴纸',
      clay: '黏土',
    },
    freeLeft: (n: number) => `今日剩余免费次数：${n}`,
    noFree: '今日次数已用完，明天再来！',
    error: '生成失败，请重试。',
    exportLabel: '导出规格',
    exportOriginal: '原图 PNG（当前预览尺寸）',
    exportWechat: '微信表情约 240 PNG',
    exportTelegram: 'Telegram 贴纸 512 WebP',
    exportDiscord: 'Discord 表情 128 PNG',
    exportHint:
      '均为正方形居中裁切。Discord 单图限 256KB，若超限可下原图后用压缩工具处理。',
  },
}

// ─── 次数限制工具函数 ──────────────────────────────────────────────────────────

const DAILY_LIMIT = 5
const STORAGE_KEY = 'emoji_gen_usage'

function getUsage(): { date: string; count: number } {
  if (typeof window === 'undefined') return { date: '', count: 0 }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { date: '', count: 0 }
    return JSON.parse(raw)
  } catch {
    return { date: '', count: 0 }
  }
}

function incrementUsage(): number {
  const today = new Date().toDateString()
  const usage = getUsage()
  const count = usage.date === today ? usage.count + 1 : 1
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, count }))
  return count
}

function getRemainingToday(): number {
  const today = new Date().toDateString()
  const usage = getUsage()
  if (usage.date !== today) return DAILY_LIMIT
  return Math.max(0, DAILY_LIMIT - usage.count)
}

// ─── Canvas 表情包合成 ────────────────────────────────────────────────────────

async function composeMeme(
  imageUrl: string,
  topText: string,
  bottomText: string
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      const fontSize = Math.floor(img.width / 10)
      ctx.font = `900 ${fontSize}px Impact, Arial Black, sans-serif`
      ctx.textAlign = 'center'
      ctx.lineWidth = fontSize / 8

      const drawText = (text: string, x: number, y: number) => {
        ctx.strokeStyle = 'black'
        ctx.strokeText(text, x, y)
        ctx.fillStyle = 'white'
        ctx.fillText(text, x, y)
      }

      if (topText) {
        drawText(topText.toUpperCase(), canvas.width / 2, fontSize + 10)
      }
      if (bottomText) {
        drawText(bottomText.toUpperCase(), canvas.width / 2, canvas.height - 20)
      }

      resolve(canvas.toDataURL('image/png'))
    }
    img.src = imageUrl
  })
}

type ExportPresetId = 'original' | 'wechat' | 'telegram' | 'discord'

const EXPORT_PRESETS: Record<
  ExportPresetId,
  { size: number | null; mime: string; ext: string; quality?: number }
> = {
  original: { size: null, mime: 'image/png', ext: 'png' },
  wechat: { size: 240, mime: 'image/png', ext: 'png' },
  telegram: { size: 512, mime: 'image/webp', ext: 'webp', quality: 0.92 },
  discord: { size: 128, mime: 'image/png', ext: 'png' },
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = dataUrl
  })
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const scale = Math.max(size / iw, size / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportMemeDataUrl(dataUrl: string, presetId: ExportPresetId): Promise<void> {
  const preset = EXPORT_PRESETS[presetId]
  const base = 'emojiai-meme'

  if (preset.size == null) {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${base}.png`
    a.click()
    return
  }

  const img = await loadImageFromDataUrl(dataUrl)
  const canvas = document.createElement('canvas')
  const s = preset.size
  canvas.width = s
  canvas.height = s
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unsupported')
  drawCover(ctx, img, s)

  const mime = preset.mime
  const q = preset.quality

  if (mime === 'image/webp') {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, q)
    )
    if (!blob) throw new Error('WebP export not supported in this browser')
    downloadBlob(blob, `${base}-${presetId}-${s}w.${preset.ext}`)
    return
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime))
  if (!blob) throw new Error('PNG export failed')
  downloadBlob(blob, `${base}-${presetId}-${s}.${preset.ext}`)
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

function HomeContent() {
  const searchParams = useSearchParams()
  const isDev = process.env.NODE_ENV !== 'production'
  const [lang, setLang] = useState<'en' | 'zh'>('en')
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('cartoon')
  const [memeTopText, setMemeTopText] = useState('')
  const [memeBottomText, setMemeBottomText] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [memePreview, setMemePreview] = useState<string | null>(null)
  const [exportPreset, setExportPreset] = useState<ExportPresetId>('original')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
const [cloudCredits, setCloudCredits] = useState<number | null>(null)
const [remaining, setRemaining] = useState<number | null>(null)
const lastPreviewUrlRef = useRef<string | null>(null)

const canvasRef = useRef<HTMLCanvasElement>(null)
const t = i18n[lang]

const freeAvailable = remaining != null && remaining > 0
const cloudAvailable = cloudCredits != null && cloudCredits > 0
// Rule: when free is used up (dailyRemaining <= 0), allow generation via cloud credits.
const canGenerate =
  freeAvailable || (cloudAvailable && (!freeAvailable || remaining == null))

useEffect(() => {
  setRemaining(getRemainingToday())
  void refreshCloudQuota()
}, [])

useEffect(() => {
  const qPrompt = searchParams.get('prompt')
  const qStyle = searchParams.get('style')
  const qTop = searchParams.get('top')
  const qBottom = searchParams.get('bottom')
  const qPreview = searchParams.get('preview')

  if (qPrompt) setPrompt(qPrompt)
  if (qStyle && qStyle in i18n.en.styles) setStyle(qStyle)
  if (qTop != null) setMemeTopText(qTop)
  if (qBottom != null) setMemeBottomText(qBottom)
  if (qPreview && lastPreviewUrlRef.current !== qPreview) {
    lastPreviewUrlRef.current = qPreview
    void handleMemePreview(qPreview)
  }
}, [searchParams])

async function refreshCloudQuota() {
  try {
    const res = await fetch('/api/me/quota', {
      headers: getDevAuthHeaders(),
    })
    if (!res.ok) return
    const data = (await res.json()) as {
      enabled?: boolean
      dailyRemaining?: number
      creditBalance?: number
    }
    if (!data.enabled) return
    if (typeof data.dailyRemaining === 'number') setRemaining(data.dailyRemaining)
    if (typeof data.creditBalance === 'number') setCloudCredits(data.creditBalance)
  } catch {
    // Fallback to local mode silently.
  }
}

// 生成图片
async function handleGenerate() {
if (!prompt.trim() || loading) return
if (!canGenerate) {
  setError(t.noFree)
  return
}
setLoading(true)
setError('')
setImages([])
setMemePreview(null)
try {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getDevAuthHeaders() },
    body: JSON.stringify({
      prompt,
      style,
      topText: memeTopText,
      bottomText: memeBottomText,
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error)
  setImages(data.images)
  if (cloudCredits != null) {
    await refreshCloudQuota()
  } else {
    const newCount = incrementUsage()
    setRemaining(Math.max(0, DAILY_LIMIT - newCount))
  }
} catch (e: unknown) {
  setError(e instanceof Error ? e.message : t.error)
} finally {
  setLoading(false)
}
}

// 点击图片生成表情包预览
async function handleMemePreview(url: string) {
  try {
    const dataUrl = await composeMeme(url, memeTopText, memeBottomText)
    setMemePreview(dataUrl)
  } catch {
    setError(lang === 'zh' ? '预览生成失败，请重试。' : 'Preview generation failed, please retry.')
  }
}

// 下载表情包（可选缩放 / 转 WebP）
async function handleDownloadMeme() {
  if (!memePreview) return
  try {
    await exportMemeDataUrl(memePreview, exportPreset)
  } catch (e) {
    setError(e instanceof Error ? e.message : t.error)
  }
}

return (
<main className="min-h-screen bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50">
  {/* 导航栏 */}
  <nav className="flex justify-between items-center px-6 py-4 max-w-4xl mx-auto">
    <span className="text-2xl font-bold text-purple-600">✨ EmojiAI</span>
    <div className="flex items-center gap-2">
      <Link
        href="/history"
        className="px-3 py-1 rounded-full border border-purple-300 text-purple-600 text-sm hover:bg-purple-50 transition"
      >
        {lang === 'zh' ? '历史' : 'History'}
      </Link>
      <Link
        href="/account"
        className="px-3 py-1 rounded-full border border-purple-300 text-purple-600 text-sm hover:bg-purple-50 transition"
      >
        {lang === 'zh' ? '账户' : 'Account'}
      </Link>
      <Link
        href="/pricing"
        className="px-3 py-1 rounded-full border border-purple-300 text-purple-600 text-sm hover:bg-purple-50 transition"
      >
        {lang === 'zh' ? '定价' : 'Pricing'}
      </Link>
      {isDev ? (
        <Link
          href="/ops"
          className="px-3 py-1 rounded-full border border-purple-300 text-purple-600 text-sm hover:bg-purple-50 transition"
        >
          Ops
        </Link>
      ) : null}
      <button
        onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
        className="px-3 py-1 rounded-full border border-purple-300 text-purple-600 text-sm hover:bg-purple-50 transition"
      >
        {lang === 'en' ? '中文' : 'EN'}
      </button>
    </div>
  </nav>
  {/* 标题区 */}
  <div className="text-center pt-10 pb-8 px-4">
    <h1 className="text-4xl md:text-5xl font-extrabold text-gray-800 mb-3">{t.title}</h1>
    <p className="text-gray-500 text-lg">{t.subtitle}</p>
  </div>
  {/* 主卡片 */}
  <div className="max-w-2xl mx-auto px-4">
    <div className="bg-white rounded-3xl shadow-xl p-6 space-y-4">
      {/* 风格选择 */}
      <div>
        <p className="text-sm text-gray-500 mb-2">{t.styleLabel}</p>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(t.styles).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStyle(key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                style === key
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-purple-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* 描述输入 */}
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder={t.placeholder}
        rows={3}
        className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
        onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleGenerate() }}
      />
      {/* 表情包文字输入 */}
      <div>
        <p className="text-sm text-gray-500 mb-2">{t.memeLabel}</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={memeTopText}
            onChange={e => setMemeTopText(e.target.value)}
            placeholder={lang === 'zh' ? '顶部文字' : 'Top text'}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
          <input
            type="text"
            value={memeBottomText}
            onChange={e => setMemeBottomText(e.target.value)}
            placeholder={lang === 'zh' ? '底部文字' : 'Bottom text'}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>
      </div>
      {/* 生成按钮 */}
      <button
        onClick={handleGenerate}
        disabled={loading || !prompt.trim() || !canGenerate}
        className="w-full py-3 rounded-2xl bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white font-bold text-lg transition"
      >
        {loading ? t.generating : t.generate}
      </button>
      {/* 剩余次数 */}
      <p
        className={`text-center text-sm ${
          freeAvailable ? 'text-gray-400' : cloudAvailable ? 'text-purple-400' : 'text-red-400'
        }`}
      >
        {remaining == null
          ? '…'
          : freeAvailable
            ? t.freeLeft(remaining)
            : cloudAvailable
              ? lang === 'zh'
                ? '免费用完，使用云端点数'
                : 'Free used up, using cloud credits'
              : t.noFree}
      </p>
      {cloudCredits != null ? (
        <p className="text-center text-xs text-purple-400">
          {lang === 'zh' ? `云端点数余额：${cloudCredits}` : `Cloud credits: ${cloudCredits}`}
        </p>
      ) : null}
      {/* 错误提示 */}
      {error && <p className="text-center text-red-500 text-sm">{error}</p>}
    </div>
    {/* 生成结果 */}
    {images.length > 0 && (
      <div className="mt-8">
        <h2 className="text-xl font-bold text-gray-700 mb-1 text-center">{t.resultTitle}</h2>
        <p className="text-center text-sm text-purple-400 mb-4">{t.clickToMeme}</p>
<div className="grid grid-cols-2 gap-4">
{images.map((url, idx) => (
<div
key={idx}
onClick={() => handleMemePreview(url)}
className="bg-white rounded-2xl shadow-md overflow-hidden group relative cursor-pointer"
>
{/* eslint-disable-next-line @next/next/no-img-element */}
<img src={url} alt={`emoji-${idx + 1}`} className="w-full aspect-square object-cover" />
<div className="absolute inset-0 bg-purple-500/0 group-hover:bg-purple-500/20 transition flex items-center justify-center">
<span className="text-white text-sm font-bold opacity-0 group-hover:opacity-100 transition">
{lang === 'zh' ? '点击制作表情包' : 'Click to make meme'}
</span>
</div>
</div>
))}
</div>
</div>
)}
    {/* 表情包预览 */}
    {memePreview && (
      <div className="mt-8 bg-white rounded-3xl shadow-xl p-6 text-center">
        <h2 className="text-xl font-bold text-gray-700 mb-4">
          {lang === 'zh' ? '表情包预览' : 'Meme Preview'}
        </h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={memePreview} alt="meme preview" className="w-full max-w-sm mx-auto rounded-2xl shadow-md" />
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <label className="flex w-full max-w-xs flex-col gap-1 text-left sm:w-auto sm:min-w-[220px]">
            <span className="text-xs text-gray-500">{t.exportLabel}</span>
            <select
              value={exportPreset}
              onChange={e => setExportPreset(e.target.value as ExportPresetId)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="original">{t.exportOriginal}</option>
              <option value="wechat">{t.exportWechat}</option>
              <option value="telegram">{t.exportTelegram}</option>
              <option value="discord">{t.exportDiscord}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleDownloadMeme()}
            className="w-full max-w-xs shrink-0 rounded-full bg-purple-500 px-6 py-2.5 font-bold text-white transition hover:bg-purple-600 sm:w-auto"
          >
            {t.download}
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-md text-center text-xs text-gray-400">{t.exportHint}</p>
      </div>
    )}
    {/* 加载骨架屏 */}
    {loading && (
      <div className="mt-8 grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white rounded-2xl shadow-md aspect-square animate-pulse bg-gray-100" />
        ))}
      </div>
    )}
  </div>
  {/* 隐藏 canvas */}
  <canvas ref={canvasRef} className="hidden" />
  {/* 页脚 */}
  <footer className="text-center text-gray-400 text-sm py-10 mt-10">
    © 2026 EmojiAI · Powered by AI
  </footer>
</main>
)
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 via-pink-50 to-purple-50">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  )
}