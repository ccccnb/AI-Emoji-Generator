/* eslint-disable no-console */

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const devUserId = process.env.SMOKE_DEV_USER_ID || ''

async function run(name, fn) {
  try {
    await fn()
    console.log(`[ok] ${name}`)
  } catch (e) {
    console.error(`[failed] ${name}:`, e instanceof Error ? e.message : String(e))
    process.exitCode = 1
  }
}

function authHeaders() {
  return devUserId ? { 'x-dev-user-id': devUserId } : {}
}

await run('ops health endpoint', async () => {
  const res = await fetch(`${baseUrl}/api/ops/health`)
  if (!res.ok) throw new Error(`status ${res.status}`)
  const body = await res.json()
  if (!body?.ok) throw new Error('invalid payload')
})

await run('quota endpoint', async () => {
  const res = await fetch(`${baseUrl}/api/me/quota`, { headers: authHeaders() })
  if (!res.ok && res.status !== 401 && res.status !== 503) {
    throw new Error(`unexpected status ${res.status}`)
  }
})

await run('history endpoint', async () => {
  const res = await fetch(`${baseUrl}/api/me/history?limit=1`, { headers: authHeaders() })
  if (!res.ok && res.status !== 401 && res.status !== 503) {
    throw new Error(`unexpected status ${res.status}`)
  }
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
