import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    challenge: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}))

import { db } from './db'
import { buildChallengeEmail, notifyChallenge, type ChallengeEvent } from './challengeEmail'

const fn = (f: unknown) => f as ReturnType<typeof vi.fn>
const chFindUnique = fn(db.challenge.findUnique)
const userFindUnique = fn(db.user.findUnique)

const CONFIG = { apiKey: 're_fake_key_123', from: 'Battle Skratch <hi@example.com>', siteUrl: 'https://example.com' }
const CHALLENGER_ADDRESS = 'challenger-secret@mail.test'
const OPPONENT_ADDRESS = 'opponent-secret@mail.test'

const base = { title: 'Scratch showdown', otherName: 'DJ Opp', challengeId: 'c1', siteUrl: 'https://example.com' }

describe('buildChallengeEmail', () => {
  it('links exactly to /challenges/<id> and strips a trailing slash from the site url', () => {
    for (const siteUrl of ['https://example.com', 'https://example.com/']) {
      const mail = buildChallengeEmail('CHALLENGED', { ...base, siteUrl })
      expect(mail.html).toContain('href="https://example.com/challenges/c1"')
      expect(mail.text).toContain('https://example.com/challenges/c1')
      expect(mail.text).not.toContain('com//challenges')
    }
  })

  it('escapes user text in the html and keeps it plain in subject and text', () => {
    const title = '<img src=x onerror=1>'
    const otherName = '"><b>'
    for (const event of ['CHALLENGED', 'ACCEPTED', 'DECLINED'] as ChallengeEvent[]) {
      const mail = buildChallengeEmail(event, { ...base, title, otherName })
      expect(mail.html).not.toContain('<img')
      expect(mail.html).not.toContain('<b>')
      expect(mail.html).not.toContain('"><')
      expect(mail.html).toContain('&lt;img src=x onerror=1&gt;')
      expect(mail.html).toContain('&quot;&gt;&lt;b&gt;')
      expect(mail.subject).toContain(title)
      expect(mail.text).toContain(title)
      expect(mail.text).toContain(otherName)
    }
  })

  it('says who did what in each event', () => {
    expect(buildChallengeEmail('CHALLENGED', base).subject).toMatch(/DJ Opp.*challenged you/i)
    expect(buildChallengeEmail('ACCEPTED', base).subject).toMatch(/DJ Opp.*accepted/i)
    expect(buildChallengeEmail('DECLINED', base).subject).toMatch(/DJ Opp.*declined/i)
  })

  it('carries no message text and no video link: the signature has no parameter for them', () => {
    const mail = buildChallengeEmail('CHALLENGED', {
      ...base,
      // Extra keys a careless caller might pass; they must not reach the email.
      ...({ message: 'secret message', videoUrl: 'https://youtube.com/watch?v=hidden' } as object),
    })
    for (const part of [mail.subject, mail.html, mail.text]) {
      expect(part).not.toContain('secret message')
      expect(part).not.toContain('youtube.com')
    }
    expect(buildChallengeEmail.length).toBe(2)
  })
})

describe('notifyChallenge', () => {
  const user = (over: Record<string, unknown>) => ({
    username: 'djx',
    name: null,
    email: 'x@mail.test',
    challengeEmails: true,
    suspendedAt: null,
    suspendedUntil: null,
    ...over,
  })

  let fetchImpl: ReturnType<typeof vi.fn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    chFindUnique.mockResolvedValue({ id: 'c1', title: 'Scratch showdown', challengerId: 'chal', opponentId: 'opp' })
    userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'chal'
        ? user({ username: 'DJ Chal', email: CHALLENGER_ADDRESS })
        : user({ username: 'DJ Opp', email: OPPONENT_ADDRESS })
    )
  })

  const run = (event: ChallengeEvent = 'CHALLENGED', config: typeof CONFIG | null = CONFIG) =>
    notifyChallenge(event, 'c1', { fetchImpl: fetchImpl as unknown as typeof fetch, config })

  const allLogs = () => JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls, ...logSpy.mock.calls])

  it('posts to Resend with a Bearer key and { from, to, subject, html, text }', async () => {
    await run('CHALLENGED')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer re_fake_key_123')
    expect(init.headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(init.body)
    expect(Object.keys(body).sort()).toEqual(['from', 'html', 'subject', 'text', 'to'])
    expect(body.from).toBe(CONFIG.from)
    expect(body.to).toBe(OPPONENT_ADDRESS)
    expect(body.html).toContain('https://example.com/challenges/c1')
  })

  it('CHALLENGED goes to the opponent and names the challenger', async () => {
    await run('CHALLENGED')
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.to).toBe(OPPONENT_ADDRESS)
    expect(body.subject).toContain('DJ Chal')
  })

  it.each(['ACCEPTED', 'DECLINED'] as const)('%s goes to the challenger and names the opponent', async (event) => {
    await run(event)
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.to).toBe(CHALLENGER_ADDRESS)
    expect(body.subject).toContain('DJ Opp')
  })

  it('reads the recipient address with a select, and the challenge without the video url or message', async () => {
    await run('CHALLENGED')
    const recipientCall = userFindUnique.mock.calls.find((c) => c[0].where.id === 'opp')
    expect(recipientCall?.[0].select.email).toBe(true)
    const otherCall = userFindUnique.mock.calls.find((c) => c[0].where.id === 'chal')
    expect(otherCall?.[0].select.email).toBeUndefined()
    const sel = chFindUnique.mock.calls[0][0].select
    expect(sel.challengerVideoUrl).toBeUndefined()
    expect(sel.message).toBeUndefined()
  })

  it('is skipped (no fetch, no database read) when email is not configured', async () => {
    await run('CHALLENGED', null)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(chFindUnique).not.toHaveBeenCalled()
  })

  it('is skipped when the recipient opted out', async () => {
    userFindUnique.mockImplementation(async () => user({ challengeEmails: false }))
    await run('CHALLENGED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('is skipped when the recipient is suspended now, but not when the suspension has ended', async () => {
    userFindUnique.mockImplementation(async () => user({ suspendedAt: new Date(Date.now() - 1000), suspendedUntil: null }))
    await run('CHALLENGED')
    expect(fetchImpl).not.toHaveBeenCalled()

    userFindUnique.mockImplementation(async () =>
      user({ suspendedAt: new Date(Date.now() - 5000), suspendedUntil: new Date(Date.now() - 1000) })
    )
    await run('CHALLENGED')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('is skipped when the challenge or a user no longer exists', async () => {
    chFindUnique.mockResolvedValue(null)
    await run('CHALLENGED')
    chFindUnique.mockResolvedValue({ id: 'c1', title: 't', challengerId: 'chal', opponentId: 'opp' })
    userFindUnique.mockResolvedValue(null)
    await run('CHALLENGED')
    userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'opp' ? user({}) : null
    )
    await run('CHALLENGED')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never rejects when fetch rejects, and logs neither the key nor the address', async () => {
    fetchImpl.mockRejectedValue(new Error(`boom Bearer ${CONFIG.apiKey} to ${OPPONENT_ADDRESS}`))
    await expect(run('CHALLENGED')).resolves.toBeUndefined()
    const logs = allLogs()
    expect(logs).toContain('CHALLENGED')
    expect(logs).toContain('c1')
    expect(logs).not.toContain(CONFIG.apiKey)
    expect(logs).not.toContain(OPPONENT_ADDRESS)
  })

  it('never rejects on a non-2xx answer and logs only the event, the challenge id and the status', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => `bad to ${OPPONENT_ADDRESS}`,
      json: async () => ({ message: `bad to ${OPPONENT_ADDRESS}` }),
    })
    await expect(run('ACCEPTED')).resolves.toBeUndefined()
    const logs = allLogs()
    expect(logs).toContain('ACCEPTED')
    expect(logs).toContain('c1')
    expect(logs).toContain('422')
    expect(logs).not.toContain(CONFIG.apiKey)
    expect(logs).not.toContain(CHALLENGER_ADDRESS)
    expect(logs).not.toContain(OPPONENT_ADDRESS)
  })

  it('never rejects when the database throws', async () => {
    chFindUnique.mockRejectedValue(new Error(`db down ${OPPONENT_ADDRESS}`))
    await expect(run('CHALLENGED')).resolves.toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(allLogs()).not.toContain(OPPONENT_ADDRESS)
  })

  it('reads the config from the environment when none is given (unset: skipped)', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    await expect(notifyChallenge('CHALLENGED', 'c1', { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
