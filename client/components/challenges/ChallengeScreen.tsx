'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@apollo/client'
import { Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDeleteButton } from '@/components/board/ConfirmDeleteButton'
import { challengeErrorMessage } from '@/lib/challenge-form'
import {
  acceptVariables,
  battlePath,
  careerWinsText,
  challengeClosedStatement,
  challengeHeadline,
  challengeRuleBullets,
  challengeScreenView,
  challengeUserName,
  clearChallengerVideo,
  isChallengeUnavailable,
  ownEntryLink,
  previewEmbedUrl,
} from '@/lib/challenge-screen'
import {
  CHALLENGE_LIMITS,
  challengeBadgeVariant,
  timeLeftLabel,
  videoUrlError,
  type ChallengeRole,
} from '@/lib/challenge-view'
import { fieldClass, labelClass } from '@/lib/form-styles'
import {
  ACCEPT_CHALLENGE,
  DECLINE_CHALLENGE,
  GET_CHALLENGE,
  GET_CHALLENGES_WAITING,
  GET_MY_CHALLENGES,
  WITHDRAW_CHALLENGE,
} from '@/lib/graphql/challenges'

interface ChallengeUser {
  id: string
  username: string | null
  name: string | null
  image: string | null
  battlesWon?: number | null
}

/** What `GET_CHALLENGE` returns. `challengerVideoUrl` is only ever read through `ownEntryLink`. */
interface ChallengeData {
  id: string
  title: string
  message: string | null
  votingDays: number
  status: string
  expiresAt: string
  viewerRole: ChallengeRole
  battleId: string | null
  challenger: ChallengeUser
  opponent: ChallengeUser
  challengerVideoUrl: string | null
}

type ActionName = 'accept' | 'decline' | 'withdraw'

const ACCEPT_VIDEO_FIELD_ID = 'challenge-accept-videoUrl'

// After any mutation the nav count and "Your challenges" lists are refetched; `Challenge:<id>` is
// updated by the mutation result itself (every mutation returns the same summary fields).
const REFETCH_AFTER_MUTATION = [GET_CHALLENGES_WAITING, GET_MY_CHALLENGES]

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full p-4 sm:p-8 flex items-start justify-center">
      <div className="w-full max-w-3xl">{children}</div>
    </div>
  )
}

function Unavailable() {
  return (
    <PageShell>
      <Card className="p-6 sm:p-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-graffiti text-foreground">This challenge isn&apos;t available</h1>
        <p className="mt-3 text-base text-muted-foreground">
          It may have been removed, or it may be between two other DJs.
        </p>
        <Link href="/" className={`${buttonVariants({ size: 'lg' })} mt-6`}>
          Back to home
        </Link>
      </Card>
    </PageShell>
  )
}

export function ChallengeScreen({ id }: { id: string }) {
  const { data, loading, error, refetch } = useQuery<{ challenge: ChallengeData }>(GET_CHALLENGE, {
    variables: { id },
  })

  if (error && isChallengeUnavailable(error)) return <Unavailable />

  const challenge = data?.challenge
  if (!challenge) {
    if (error) {
      return (
        <PageShell>
          <Card className="p-6 sm:p-8 text-center">
            <p role="alert" className="text-base text-destructive">
              {challengeErrorMessage(error)}
            </p>
            <Button type="button" size="lg" className="mt-4" onClick={() => void refetch().catch(() => undefined)}>
              Try again
            </Button>
          </Card>
        </PageShell>
      )
    }
    if (loading) {
      return (
        <PageShell>
          <p role="status" className="p-8 text-center text-base text-muted-foreground">
            Loading challenge…
          </p>
        </PageShell>
      )
    }
    return <Unavailable />
  }

  return <ChallengeDetails challenge={challenge} reload={refetch} />
}

function ChallengeDetails({
  challenge,
  reload,
}: {
  challenge: ChallengeData
  reload: () => Promise<unknown>
}) {
  const router = useRouter()
  const role = challenge.viewerRole

  // The clock moves on while the page is open: a challenge that expires now loses its actions
  // (`challengeScreenView` takes the effective status before deciding what to offer).
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const view = challengeScreenView(challenge, now)
  const challengerName = challengeUserName(challenge.challenger)
  const opponentName = challengeUserName(challenge.opponent)
  const otherName = role === 'OPPONENT' ? challengerName : opponentName

  const [videoUrl, setVideoUrl] = useState('')
  const [videoError, setVideoError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<ActionName | null>(null)
  // A ref closes the gap before `busyAction` renders, so a fast double click sends one request.
  const busyRef = useRef(false)
  // Focus goes back to the link field after a refusal, once the form is enabled again.
  const [focusRequest, setFocusRequest] = useState(0)

  const mutationOptions = { refetchQueries: REFETCH_AFTER_MUTATION }
  const [acceptChallenge] = useMutation<{ acceptChallenge: { id: string; status: string; battleId: string | null } }>(
    ACCEPT_CHALLENGE,
    { ...mutationOptions, update: (cache, { data }) => clearChallengerVideo(cache, data?.acceptChallenge) },
  )
  const [declineChallenge] = useMutation<{ declineChallenge: { id: string; status: string } }>(DECLINE_CHALLENGE, {
    ...mutationOptions,
    update: (cache, { data }) => clearChallengerVideo(cache, data?.declineChallenge),
  })
  const [withdrawChallenge] = useMutation<{ withdrawChallenge: { id: string; status: string } }>(WITHDRAW_CHALLENGE, {
    ...mutationOptions,
    update: (cache, { data }) => clearChallengerVideo(cache, data?.withdrawChallenge),
  })

  const focusedRequestRef = useRef(0)
  useEffect(() => {
    if (focusRequest === focusedRequestRef.current || busyAction !== null) return
    focusedRequestRef.current = focusRequest
    document.getElementById(ACCEPT_VIDEO_FIELD_ID)?.focus()
  }, [focusRequest, busyAction])

  /** Runs one action at a time; a refusal shows the server's safe message and reloads the challenge. */
  async function run(action: ActionName, task: () => Promise<void>) {
    if (busyRef.current) return
    // Check the clock again at the moment of the click, not only at the last tick.
    const current = new Date()
    setNow(current)
    const latest = challengeScreenView(challenge, current)
    if (latest.kind !== 'RESPOND' && latest.kind !== 'WAITING') {
      setActionError(challengeClosedStatement(latest.status, role, otherName))
      return
    }
    busyRef.current = true
    setBusyAction(action)
    setActionError(null)
    try {
      await task()
    } catch (err) {
      setActionError(challengeErrorMessage(err))
      if (action === 'accept') setFocusRequest((n) => n + 1)
      // The challenge may have changed under us (answered elsewhere, withdrawn): show what is true now.
      void reload().catch(() => undefined)
    } finally {
      busyRef.current = false
      setBusyAction(null)
    }
  }

  async function handleAccept(e: FormEvent) {
    e.preventDefault()
    if (busyRef.current) return
    const problem = videoUrlError(videoUrl)
    if (problem) {
      setVideoError(problem)
      document.getElementById(ACCEPT_VIDEO_FIELD_ID)?.focus()
      return
    }
    setVideoError(null)
    await run('accept', async () => {
      const result = await acceptChallenge({ variables: acceptVariables(challenge.id, videoUrl) })
      const battleId = result.data?.acceptChallenge?.battleId
      if (battleId) router.push(battlePath(battleId))
    })
  }

  const decline = () => run('decline', async () => void (await declineChallenge({ variables: { id: challenge.id } })))
  const withdraw = () => run('withdraw', async () => void (await withdrawChallenge({ variables: { id: challenge.id } })))

  const busy = busyAction !== null
  const timeLeft = view.showTimeLeft ? timeLeftLabel(challenge.expiresAt, now) : ''
  const wins = careerWinsText(challenge.challenger.battlesWon)
  const entryLink = ownEntryLink(challenge, now)
  const embedUrl = previewEmbedUrl(videoUrl)
  const message = challenge.message?.trim() ? challenge.message : null

  return (
    <PageShell>
      <div className="mb-6">
        <p className="text-xl font-graffiti text-amber-500 mb-2">Head to head challenge</p>
        <h1 className="text-3xl font-graffiti text-foreground break-words">{challenge.title}</h1>
        <p className="mt-2 text-base text-muted-foreground break-words">
          {challengeHeadline(role, challengerName, opponentName)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge variant={challengeBadgeVariant(view.status)}>
            <span className="sr-only">Challenge status: </span>
            {view.statusLabel}
          </Badge>
          {timeLeft && <span className="text-base text-muted-foreground">{timeLeft}</span>}
        </div>
        <div className="mt-3 h-px bg-gradient-to-r from-amber-500 to-transparent" />
      </div>

      <div className="space-y-6">
        {role === 'OPPONENT' && (
          <Card className="p-4 sm:p-6">
            <h2 className="text-2xl font-graffiti text-foreground mb-2">The challenger</h2>
            <p className="text-base text-foreground break-words">
              <Link
                href={`/users/${encodeURIComponent(challenge.challenger.id)}`}
                className="font-semibold text-amber-500 underline underline-offset-2"
              >
                {challengerName}
              </Link>
              {wins && <span className="text-muted-foreground"> · {wins}</span>}
            </p>
            {message && (
              <figure className="mt-4">
                <figcaption className="text-base font-bold tracking-widest uppercase text-muted-foreground">
                  Their message
                </figcaption>
                <blockquote className="mt-1 whitespace-pre-wrap break-words border-l-2 border-amber-500 pl-4 text-base text-foreground">
                  {message}
                </blockquote>
              </figure>
            )}
          </Card>
        )}

        {role === 'CHALLENGER' && message && (
          <Card className="p-4 sm:p-6">
            <h2 className="text-2xl font-graffiti text-foreground mb-2">Your message</h2>
            <p className="whitespace-pre-wrap break-words text-base text-foreground">{message}</p>
          </Card>
        )}

        {view.kind === 'RESPOND' && (
          <>
            <Card className="p-4 sm:p-6">
              <div
                role="img"
                aria-label="Their video is hidden"
                className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-4 text-center"
              >
                <Lock className="h-8 w-8 text-amber-500" aria-hidden="true" />
                <p className="text-xl font-graffiti text-foreground">Their video is hidden</p>
              </div>
              <p className="mt-3 text-base text-muted-foreground">
                You cannot see {challengerName}&apos;s video until you accept. Then both entries appear together on the
                battle page, so neither of you sees the other first.
              </p>
            </Card>

            <Card className="p-4 sm:p-6">
              <h2 className="text-2xl font-graffiti text-foreground mb-3">Your answer</h2>
              <ul className="mb-5 list-disc space-y-2 pl-5 text-base text-muted-foreground marker:text-amber-500">
                {challengeRuleBullets(challenge.votingDays, challengerName).map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>

              <form onSubmit={handleAccept} noValidate className="space-y-4" aria-busy={busyAction === 'accept'}>
                <fieldset className="min-w-0 space-y-2 border-0 p-0 m-0" disabled={busy}>
                  <label htmlFor={ACCEPT_VIDEO_FIELD_ID} className={labelClass}>
                    Your video (YouTube link) <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id={ACCEPT_VIDEO_FIELD_ID}
                    type="url"
                    inputMode="url"
                    value={videoUrl}
                    onChange={(e) => {
                      setVideoUrl(e.target.value)
                      setVideoError(null)
                      setActionError(null)
                    }}
                    maxLength={CHALLENGE_LIMITS.urlMax}
                    autoComplete="off"
                    placeholder="https://youtube.com/watch?v=..."
                    aria-required="true"
                    aria-invalid={videoError ? true : undefined}
                    aria-describedby={[videoError ? 'challenge-accept-videoUrl-error' : null, 'challenge-accept-videoUrl-hint']
                      .filter(Boolean)
                      .join(' ')}
                    className={fieldClass}
                  />
                  <p id="challenge-accept-videoUrl-hint" className="text-base text-muted-foreground">
                    Record and upload your video first. You cannot change your entry once the battle opens.
                  </p>
                  {videoError && (
                    <p id="challenge-accept-videoUrl-error" className="text-base font-medium text-destructive">
                      {videoError}
                    </p>
                  )}
                </fieldset>

                {embedUrl && (
                  <div>
                    <p className={`${labelClass} mb-2`}>Preview</p>
                    <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
                      <iframe
                        src={embedUrl}
                        title="Preview of your video"
                        allow="encrypted-media; picture-in-picture"
                        referrerPolicy="strict-origin-when-cross-origin"
                        loading="lazy"
                        className="h-full w-full border-0"
                      />
                    </div>
                  </div>
                )}

                {actionError && (
                  <p role="alert" className="text-base font-medium text-destructive">
                    {actionError}
                  </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-auto">
                    {busyAction === 'accept' ? 'Accepting…' : 'Accept and enter'}
                  </Button>
                  <ConfirmDeleteButton
                    label="Decline"
                    question="Decline this challenge? This cannot be undone."
                    confirmLabel="Yes, decline"
                    pendingLabel="Declining…"
                    size="default"
                    disabled={busy}
                    onConfirm={decline}
                  />
                </div>
              </form>
            </Card>
          </>
        )}

        {view.kind === 'WAITING' && (
          <Card className="p-4 sm:p-6">
            <h2 className="text-2xl font-graffiti text-foreground mb-2">Waiting for {opponentName}</h2>
            <p className="text-base text-muted-foreground">
              Your video stays hidden from {opponentName} until they accept. You can withdraw until then.
            </p>
            {entryLink && (
              <p className="mt-4 text-base text-foreground break-words">
                Your entry:{' '}
                <a
                  href={entryLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-amber-500 underline underline-offset-2"
                >
                  {entryLink}
                </a>
              </p>
            )}
            {actionError && (
              <p role="alert" className="mt-4 text-base font-medium text-destructive">
                {actionError}
              </p>
            )}
            <div className="mt-4">
              <ConfirmDeleteButton
                label="Withdraw"
                question="Withdraw this challenge? This cannot be undone."
                confirmLabel="Yes, withdraw"
                pendingLabel="Withdrawing…"
                size="default"
                disabled={busy}
                onConfirm={withdraw}
              />
            </div>
          </Card>
        )}

        {view.kind === 'ACCEPTED' && view.battleId && (
          <Card className="p-4 sm:p-6">
            <h2 className="text-2xl font-graffiti text-foreground mb-2">The battle is on</h2>
            <p className="text-base text-muted-foreground">
              {role === 'OPPONENT' ? 'You' : opponentName} accepted. Both entries are on the battle page and the
              community is voting.
            </p>
            <Link href={battlePath(view.battleId)} className={`${buttonVariants({ size: 'lg' })} mt-4 w-full sm:w-auto`}>
              Open the battle
            </Link>
          </Card>
        )}

        {view.kind === 'CLOSED' && (
          <Card className="p-4 sm:p-6">
            <p className="text-base text-foreground">{challengeClosedStatement(view.status, role, otherName)}</p>
            {actionError && (
              <p role="alert" className="mt-3 text-base font-medium text-destructive">
                {actionError}
              </p>
            )}
          </Card>
        )}
      </div>
    </PageShell>
  )
}
