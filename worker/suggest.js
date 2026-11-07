// Takes anonymous suggestions from the site and keeps only their text. Read them in the Cloudflare dashboard.
const ORIGIN = 'https://lexus-x.github.io'
const MAX_LENGTH = 1000
const DAILY_LIMIT = 50 // shortcut: one shared cap instead of per-sender limits, because senders are never identified
const TWO_DAYS = 172800

const CORS = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-methods': 'POST',
  'access-control-allow-headers': 'content-type',
}

const reply = (status, body = null) => new Response(body, { status, headers: CORS })

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return reply(204)
    if (request.method !== 'POST') return reply(405, 'POST only')
    if (request.headers.get('origin') !== ORIGIN) return reply(403, 'Wrong origin')

    const { text, website } = await request.json().catch(() => ({}))
    if (website) return reply(204) // only bots fill the hidden field, so they get a quiet success
    const note = typeof text === 'string' ? text.trim() : ''
    if (!note || note.length > MAX_LENGTH) return reply(400, 'Empty or too long')

    const counter = `count:${new Date().toISOString().slice(0, 10)}`
    const today = Number(await env.SUGGESTIONS.get(counter)) || 0
    if (today >= DAILY_LIMIT) return reply(429, 'Too many today')

    await env.SUGGESTIONS.put(counter, String(today + 1), { expirationTtl: TWO_DAYS })
    await env.SUGGESTIONS.put(`note:${Date.now()}:${crypto.randomUUID()}`, note)
    return reply(204)
  },
}
