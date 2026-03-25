import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Emoji Generator - Create Custom Emojis with AI | AI Emoji 生成器',
  description: 'Generate unique custom emojis with AI. Just describe what you want and get cute emojis instantly. Free to use! | 用 AI 生成专属 emoji 表情，输入描述秒出结果。',
  keywords: 'ai emoji generator, emoji maker, custom emoji, ai emoji, emoji creator',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
