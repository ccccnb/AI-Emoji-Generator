/* eslint-disable no-console */

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'
const devUserId = process.env.SMOKE_DEV_USER_ID || ''
const workers = Number(process.env.STRESS_WORKERS || 8)
const rounds = Number(process.env.STRESS_ROUNDS || 20)

if (!devUserId) {
  console.error('SMOKE_DEV_USER_ID is required for stress-quota')
  process.exit(1)
}

const res = await fetch(`${baseUrl}/api/dev/quota-race`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-dev-user-id': devUserId,
  },
  body: JSON.stringify({ workers, rounds }),
})

const body = await res.json()
if (!res.ok) {
  console.error('stress-quota failed:', body)
  process.exit(1)
}

console.log('stress-quota result:', body)
if (!body.ok) {
  process.exit(1)
}
