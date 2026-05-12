import type { MetadataRoute } from 'next'

const BASE_URL = 'https://aiemoji.cc'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/history`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ]
}
