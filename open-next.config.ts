import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// 未接 R2/KV 时先用默认；需要 ISR/增量缓存时再按
// https://opennext.js.org/cloudflare/caching 接入 r2IncrementalCache 与 wrangler r2_buckets
export default defineCloudflareConfig({})
