import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './suggest.js'

const ORIGIN = 'https://lexus-x.github.io'

function store(start = {}) {
  const items = new Map(Object.entries(start))
  return { items, get: async key => items.get(key) ?? null, put: async (key, value) => { items.set(key, value) } }
}

const post = (body, origin = ORIGIN) => new Request('https://suggest.test/', {
  method: 'POST',
  headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const notes = kv => [...kv.items.keys()].filter(key => key.startsWith('note:'))

test('keeps the text and nothing about the sender', async () => {
  const kv = store()
  const answer = await worker.fetch(post({ text: '  better colours  ' }), { SUGGESTIONS: kv })
  assert.equal(answer.status, 204)
  const [key] = notes(kv)
  assert.equal(kv.items.get(key), 'better colours')
  assert.match(key, /^note:\d+:[0-9a-f-]+$/)
})

test('refuses other sites, empty notes and notes that are too long', async () => {
  const kv = store()
  assert.equal((await worker.fetch(post({ text: 'hi' }, 'https://evil.test'), { SUGGESTIONS: kv })).status, 403)
  assert.equal((await worker.fetch(post({ text: '   ' }), { SUGGESTIONS: kv })).status, 400)
  assert.equal((await worker.fetch(post({ text: 'x'.repeat(1001) }), { SUGGESTIONS: kv })).status, 400)
  assert.equal(notes(kv).length, 0)
})

test('bots that fill the hidden field get a quiet success and store nothing', async () => {
  const kv = store()
  const answer = await worker.fetch(post({ text: 'spam', website: 'x' }), { SUGGESTIONS: kv })
  assert.equal(answer.status, 204)
  assert.equal(notes(kv).length, 0)
})

test('stops at the daily limit', async () => {
  const counter = `count:${new Date().toISOString().slice(0, 10)}`
  const kv = store({ [counter]: '50' })
  assert.equal((await worker.fetch(post({ text: 'hi' }), { SUGGESTIONS: kv })).status, 429)
  assert.equal(notes(kv).length, 0)
})
