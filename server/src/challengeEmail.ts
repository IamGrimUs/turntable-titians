import { db } from './db'
import { getEmailConfig } from './config'
import { isSuspended } from './suspension'

/**
 * Best-effort emails about direct challenges, sent straight to Resend's REST API (no SDK).
 *
 * Privacy rules, on purpose: an email carries the challenge title and the other DJ's name only.
 * It never carries the challenge message (free text sent from our domain) or any video link (the
 * challenger's entry is hidden until the opponent accepts). A recipient's address is read inside
 * `notifyChallenge` and nowhere else, and is never logged.
 */

export type ChallengeEvent = 'CHALLENGED' | 'ACCEPTED' | 'DECLINED'

const RESEND_URL = 'https://api.resend.com/emails'
const SEND_TIMEOUT_MS = 10_000

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A header must be one line, so any line break in user text becomes a space. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

const ACTIONS: Record<ChallengeEvent, { verb: string; line: string }> = {
  CHALLENGED: { verb: 'challenged you to a head to head', line: 'challenged you to a head to head' },
  ACCEPTED: { verb: 'accepted your challenge', line: 'accepted your challenge. The duel is open for voting.' },
  DECLINED: { verb: 'declined your challenge', line: 'declined your challenge.' },
}

/**
 * Subject, html and text of one challenge email. Title and name are user text: HTML-escaped in
 * the html, plain in the subject and text. The only link is the challenge page. There is no
 * parameter for the message or a video URL, so they cannot end up in an email.
 */
export function buildChallengeEmail(
  event: ChallengeEvent,
  d: { title: string; otherName: string; challengeId: string; siteUrl: string }
): { subject: string; html: string; text: string } {
  const link = `${d.siteUrl.replace(/\/+$/, '')}/challenges/${d.challengeId}`
  const action = ACTIONS[event]
  const subject = oneLine(`${d.otherName} ${action.verb}: ${d.title}`)
  const cta = event === 'CHALLENGED' ? 'See the challenge' : 'Open the challenge'

  const html =
    `<p><strong>${escapeHtml(d.otherName)}</strong> ${escapeHtml(action.line)}</p>` +
    `<p>Challenge: <strong>${escapeHtml(d.title)}</strong></p>` +
    `<p><a href="${escapeHtml(link)}">${cta}</a></p>` +
    `<p style="color:#666;font-size:14px">You get these emails because you are a member of Battle Skratch. ` +
    `You can turn them off on your profile page.</p>`

  const text =
    `${d.otherName} ${action.line}\n\n` +
    `Challenge: ${d.title}\n\n` +
    `${cta}: ${link}\n\n` +
    `You get these emails because you are a member of Battle Skratch. You can turn them off on your profile page.\n`

  return { subject, html, text }
}

const displayName = (u: { username: string | null; name: string | null }) => u.username ?? u.name ?? 'A DJ'

/**
 * Emails the right DJ about a challenge event: the challenged DJ when challenged, the challenger
 * when it is accepted or declined. Never throws and never rejects; every failure is logged with
 * the event, the challenge id and (for Resend) the status code only: no key, no address, no body.
 *
 * Skipped when email is not configured, when the recipient opted out (`challengeEmails: false`),
 * is suspended now, or when the challenge or a user no longer exists.
 */
export async function notifyChallenge(
  event: ChallengeEvent,
  challengeId: string,
  deps: { fetchImpl?: typeof fetch; config?: ReturnType<typeof getEmailConfig> } = {}
): Promise<void> {
  try {
    const config = deps.config === undefined ? getEmailConfig() : deps.config
    if (!config) return
    const fetchImpl = deps.fetchImpl ?? fetch

    const challenge = await db.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, title: true, challengerId: true, opponentId: true },
    })
    if (!challenge) return

    const toOpponent = event === 'CHALLENGED'
    const recipientId = toOpponent ? challenge.opponentId : challenge.challengerId
    const otherId = toOpponent ? challenge.challengerId : challenge.opponentId

    // The only place an address is read, and only for the one recipient.
    const recipient = await db.user.findUnique({
      where: { id: recipientId },
      select: {
        email: true,
        challengeEmails: true,
        suspendedAt: true,
        suspendedUntil: true,
      },
    })
    if (!recipient || !recipient.challengeEmails || isSuspended(recipient)) return

    const other = await db.user.findUnique({ where: { id: otherId }, select: { username: true, name: true } })
    if (!other) return

    const mail = buildChallengeEmail(event, {
      title: challenge.title,
      otherName: displayName(other),
      challengeId: challenge.id,
      siteUrl: config.siteUrl,
    })

    const res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.from, to: recipient.email, ...mail }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    if (!res.ok) console.error('[challenge-email] send failed:', event, challengeId, `status ${res.status}`)
  } catch {
    // The error itself is dropped on purpose: a fetch or Prisma message can echo the address or key.
    console.error('[challenge-email] send failed:', event, challengeId)
  }
}
