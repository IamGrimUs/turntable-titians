'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@apollo/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  buildChallengeVariables,
  challengeErrorMessage,
  challengePath,
  fieldDomId,
  firstErrorField,
  initialChallengeValues,
  SENT_FALLBACK_DELAY_MS,
  serverErrorField,
  type ChallengeField,
} from '@/lib/challenge-form'
import { CHALLENGE_LIMITS, validateChallengeForm, type ChallengeFormValues } from '@/lib/challenge-view'
import { fieldClass, labelClass } from '@/lib/form-styles'
import { CREATE_CHALLENGE } from '@/lib/graphql/challenges'
import { plural } from '@/lib/plural'
import { remainingChars } from '@/lib/post-idea-form'

interface ChallengeFormProps {
  /** The DJ from `?to=`, already cleaned by `prefillUsername`; empty when the person starts from scratch. */
  initialUsername: string
}

/**
 * The form that sends a direct challenge. The caller (the page behind the middleware) only shows it
 * to a signed-in user with a username. Client checks come from `validateChallengeForm`; the server
 * re-checks everything and its own message is shown for limits, the cooldown and an unknown DJ.
 * The challenger's video is hidden from the opponent until they accept, and the form says so.
 */
export function ChallengeForm({ initialUsername }: ChallengeFormProps) {
  const router = useRouter()
  const [values, setValues] = useState<ChallengeFormValues>(() => initialChallengeValues(initialUsername))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  // Stays true after a successful send so the form cannot be sent twice while the page navigates.
  const [sent, setSent] = useState(false)
  // The new challenge's id once sent: if the route change has not happened after a few seconds,
  // a plain link to it appears instead of leaving the form on "Sending…" with nothing else to do.
  const [sentId, setSentId] = useState<string | null>(null)
  const [showSentLink, setShowSentLink] = useState(false)
  // The field to focus after a server error. Focus has to wait until the fieldset is enabled again
  // (a disabled input cannot take focus), so the handler sets this and an effect does the focusing.
  // A fresh object per error, so the same field can be asked for twice; `focusedRef` remembers which
  // request already got its focus.
  const [focusTarget, setFocusTarget] = useState<{ field: ChallengeField } | null>(null)
  const focusedRef = useRef<{ field: ChallengeField } | null>(null)

  // `loading` only updates after a render, so a fast double click could slip a second request
  // through; the ref closes that gap.
  const sendingRef = useRef(false)
  const [createChallenge, { loading }] = useMutation<{ createChallenge: { id: string } }>(CREATE_CHALLENGE)
  const busy = loading || sent

  useEffect(() => {
    if (!focusTarget || busy || focusedRef.current === focusTarget) return
    focusedRef.current = focusTarget
    document.getElementById(fieldDomId(focusTarget.field))?.focus()
  }, [focusTarget, busy])

  useEffect(() => {
    if (!sentId) return
    const timer = setTimeout(() => setShowSentLink(true), SENT_FALLBACK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [sentId])

  function setField<K extends keyof ChallengeFormValues>(field: K, value: ChallengeFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => {
      if (!current[field]) return current
      const rest = { ...current }
      delete rest[field]
      return rest
    })
    setFormError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (sendingRef.current || busy) return

    const errors = validateChallengeForm(values)
    const first = firstErrorField(errors)
    if (first) {
      setFieldErrors(errors)
      setFormError(null)
      document.getElementById(fieldDomId(first))?.focus()
      return
    }

    sendingRef.current = true
    setFieldErrors({})
    setFormError(null)
    try {
      const result = await createChallenge({ variables: buildChallengeVariables(values) })
      const id = result.data?.createChallenge?.id
      if (!id) {
        setFormError(challengeErrorMessage(null))
        return
      }
      setSent(true)
      setSentId(id)
      router.push(challengePath(id))
    } catch (err) {
      // Keep what was typed so the person can fix it (another DJ, a shorter title).
      const message = challengeErrorMessage(err)
      const field = serverErrorField(message)
      if (field) {
        setFieldErrors({ [field]: message })
        setFocusTarget({ field })
      } else {
        setFormError(message)
      }
    } finally {
      sendingRef.current = false
    }
  }

  function handleCancel() {
    if (window.history.length > 1) router.back()
    else router.push('/')
  }

  function describedBy(field: ChallengeField, extra?: string) {
    return [fieldErrors[field] ? `challenge-${field}-error` : null, extra].filter(Boolean).join(' ') || undefined
  }

  function fieldError(field: ChallengeField) {
    const message = fieldErrors[field]
    if (!message) return null
    return (
      <p id={`challenge-${field}-error`} className="text-base font-medium text-destructive">
        {message}
      </p>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <Card className="p-4 sm:p-6">
        <form onSubmit={handleSubmit} noValidate className="space-y-6" aria-busy={loading}>
          <fieldset className="space-y-6 min-w-0 border-0 p-0 m-0" disabled={busy}>
            <div className="space-y-2">
              <label htmlFor="challenge-username" className={labelClass}>
                DJ to challenge <span aria-hidden="true">*</span>
              </label>
              <input
                id="challenge-username"
                type="text"
                value={values.username}
                onChange={(e) => setField('username', e.target.value)}
                maxLength={CHALLENGE_LIMITS.usernameMax}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Their username"
                aria-required="true"
                aria-invalid={fieldErrors.username ? true : undefined}
                aria-describedby={describedBy('username')}
                className={fieldClass}
              />
              {fieldError('username')}
            </div>

            <div className="space-y-2">
              <label htmlFor="challenge-title" className={labelClass}>
                Title <span aria-hidden="true">*</span>
              </label>
              <input
                id="challenge-title"
                type="text"
                value={values.title}
                onChange={(e) => setField('title', e.target.value)}
                maxLength={CHALLENGE_LIMITS.titleMax}
                placeholder="e.g. Scratch showdown"
                aria-required="true"
                aria-invalid={fieldErrors.title ? true : undefined}
                aria-describedby={describedBy('title', 'challenge-title-hint')}
                className={fieldClass}
              />
              <p id="challenge-title-hint" className="text-base text-muted-foreground">
                {plural(remainingChars(values.title, CHALLENGE_LIMITS.titleMax), 'character')} left. No links.
              </p>
              {fieldError('title')}
            </div>

            <div className="space-y-2">
              <label htmlFor="challenge-message" className={labelClass}>
                Message (optional)
              </label>
              <textarea
                id="challenge-message"
                value={values.message}
                onChange={(e) => setField('message', e.target.value)}
                maxLength={CHALLENGE_LIMITS.messageMax}
                rows={3}
                placeholder="Ground rules, a bit of trash talk, anything people should know"
                aria-invalid={fieldErrors.message ? true : undefined}
                aria-describedby={describedBy('message', 'challenge-message-hint')}
                className={`${fieldClass} resize-none`}
              />
              <p id="challenge-message-hint" className="text-base text-muted-foreground">
                {plural(remainingChars(values.message, CHALLENGE_LIMITS.messageMax), 'character')} left. No links. If they accept, your message is shown to everyone on the battle page.
              </p>
              {fieldError('message')}
            </div>

            <div className="space-y-2">
              <label htmlFor="challenge-videoUrl" className={labelClass}>
                Your video (YouTube link) <span aria-hidden="true">*</span>
              </label>
              <input
                id="challenge-videoUrl"
                type="url"
                inputMode="url"
                value={values.videoUrl}
                onChange={(e) => setField('videoUrl', e.target.value)}
                maxLength={CHALLENGE_LIMITS.urlMax}
                autoComplete="off"
                placeholder="https://youtube.com/watch?v=..."
                aria-required="true"
                aria-invalid={fieldErrors.videoUrl ? true : undefined}
                aria-describedby={describedBy('videoUrl', 'challenge-videoUrl-hint')}
                className={fieldClass}
              />
              <p id="challenge-videoUrl-hint" className="text-base text-muted-foreground">
                They will not see this video until they accept. Use an unlisted video so it cannot be found before
                then.
              </p>
              {fieldError('videoUrl')}
            </div>

            <div className="space-y-2">
              <p id="challenge-votingDays-label" className={labelClass}>
                Voting length
              </p>
              <div
                id="challenge-votingDays"
                role="group"
                aria-labelledby="challenge-votingDays-label"
                aria-describedby={describedBy('votingDays', 'challenge-votingDays-hint')}
                className="grid grid-cols-3 gap-2"
              >
                {CHALLENGE_LIMITS.votingDays.map((days) => {
                  const selected = values.votingDays === days
                  return (
                    <button
                      key={days}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setField('votingDays', days)}
                      className={`h-11 rounded-md border px-3 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 disabled:opacity-50 ${
                        selected
                          ? 'border-amber-500 bg-amber-500 text-black'
                          : 'border-border bg-transparent text-muted-foreground hover:border-amber-500/50 hover:text-foreground'
                      }`}
                    >
                      {days} days
                    </button>
                  )
                })}
              </div>
              <p id="challenge-votingDays-hint" className="text-base text-muted-foreground">
                How long the community votes once they accept.
              </p>
              {fieldError('votingDays')}
            </div>
          </fieldset>

          {/* The status container is always mounted (empty) and filled later, so screen readers announce it. */}
          <div role="status" className="text-base text-foreground empty:!mt-0">
            {showSentLink && sentId && (
              <p>
                Your challenge was sent.{' '}
                <Link href={challengePath(sentId)} className="text-amber-500 underline underline-offset-2">
                  Open it
                </Link>
              </p>
            )}
          </div>

          {formError && (
            <p role="alert" className="text-base font-medium text-destructive">
              {formError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" onClick={handleCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? 'Sending…' : 'Send challenge'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="text-2xl font-graffiti text-foreground mb-3">How a challenge works</h2>
        <ol className="list-decimal space-y-3 pl-5 text-base text-muted-foreground marker:text-amber-500">
          <li>You send the challenge with your own video.</li>
          <li>
            The DJ has {CHALLENGE_LIMITS.answerDays} days to answer. They will not see your video until they accept.
          </li>
          <li>If they accept, they add their own video and a public head to head battle starts today.</li>
          <li>Your message is shown to everyone on the battle page once they accept.</li>
          <li>The community votes. The most votes wins, and a tie is a draw.</li>
        </ol>
        <p className="mt-4 text-base text-muted-foreground">
          If they decline, or do not answer in time, nothing is made public and your video is never shown to them.
        </p>
      </Card>
    </div>
  )
}
