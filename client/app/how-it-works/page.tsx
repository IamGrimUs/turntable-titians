import type { Metadata } from 'next'
import Link from 'next/link'
import { Eye, Lock, Trophy, Vote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PROPS_LABELS } from '@/lib/props-button'
import { BATTLE_TYPES } from '@/lib/battle-types'

export const metadata: Metadata = {
  title: 'How Battles Work - Battle Skratch',
  description:
    'How Battle Skratch battles run: entering a set, voting, and how winners are decided.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-3xl font-graffiti text-foreground">{title}</h2>
      <div className="mt-2 mb-5 h-px bg-gradient-to-r from-amber-500 to-transparent" />
      <div className="space-y-4 text-base leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 font-black text-black"
          >
            {i + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  )
}

const strong = 'font-semibold text-foreground'

export default function HowItWorksPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <header>
        <p className="text-xl font-graffiti text-amber-500 mb-2">Battle Skratch</p>
        <h1 className="text-5xl font-graffiti text-foreground">How Battles Work</h1>
        <div className="mt-3 mb-4 h-px bg-gradient-to-r from-amber-500 to-transparent" />
        <p className="text-base leading-relaxed text-muted-foreground">
          DJs post a video of their set, the community votes for the ones they love, and the winner is
          revealed when the battle ends. Here is everything you need to know to take part.
        </p>
      </header>

      <Section title="The life of a battle">
        <p>Every battle moves through three stages, based on its start and end dates.</p>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="space-y-2 p-4">
              <Badge variant="upcoming">UPCOMING</Badge>
              <p>
                Announced but not started. You can look around, but entries and voting are not open yet.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-4">
              <Badge variant="active">ACTIVE</Badge>
              <p>Entries and voting are open. Submit your set, watch the others and back your favourite.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-4">
              <Badge variant="completed">COMPLETED</Badge>
              <p>
                Everything is closed. The vote counts are revealed and the winner is crowned. If entries tied
                for first, voting reopens for 3 days on just the tied entries before the winner is crowned.
              </p>
            </CardContent>
          </Card>
        </div>
        <p>
          A battle is open on its start date and on its end date, and it closes after the end date. An active
          battle shows how many days are left.
        </p>
      </Section>

      <Section title="Entering a battle">
        <Steps
          items={[
            <>
              <span className={strong}>Sign in.</span> Use Google or a link sent to your email, then pick a
              username when asked. You need an account to enter or vote, but anyone can watch.
            </>,
            <>
              <span className={strong}>Open an active battle.</span> Entries are only accepted while a battle is
              ACTIVE. Read its type and description first; that is what your set should fit.
            </>,
            <>
              <span className={strong}>Submit your entry.</span> Tap <span className={strong}>Submit Entry</span>{' '}
              and paste the link to your set on YouTube. A title and description are optional but help people
              know what they are watching.
            </>,
          ]}
        />
        <h3 className="pt-2 text-xl font-semibold text-foreground">What is expected</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <span className={strong}>One entry per battle.</span> Each account can enter a battle once, so make it
            your best.
          </li>
          <li>
            <span className={strong}>A YouTube link people can watch.</span> Watch, youtu.be and Shorts links
            all work. Set the video to public or unlisted; a private video cannot be played by voters.
          </li>
          <li>
            <span className={strong}>Stay on theme.</span> Follow the battle&apos;s type and any rules in its
            description.
          </li>
          <li>
            <span className={strong}>Keep it friendly.</span> This is a community. Hype each other up and
            respect the result.
          </li>
        </ul>
      </Section>

      <Section title="Voting">
        <p className="flex items-start gap-2">
          <Vote className="mt-1 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          <span>
            Press <span className={strong}>{PROPS_LABELS.give}</span> on the entry you think is best. That is
            your vote for the battle.
          </span>
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <span className={strong}>One vote per battle.</span> You get a single vote in each battle, so use it
            on your favourite.
          </li>
          <li>
            <span className={strong}>You can change your mind.</span> While the battle is active, press{' '}
            <span className={strong}>{PROPS_LABELS.given}</span> again to take your vote back, then vote for
            another entry. Once the battle ends, votes are final.
          </li>
          <li>
            <span className={strong}>Not for your own entry.</span> You can vote for anyone else&apos;s set, but
            not your own.
          </li>
          <li>
            <span className={strong}>You must be signed in</span>, and voting only works while the battle is
            ACTIVE.
          </li>
          <li>
            <span className={strong}>Runoff votes.</span> If a battle ends tied for first, anyone signed in can
            vote in the runoff except the tied DJs, including people who voted in the first round. The runoff
            counts stay hidden until it closes, and you can change your runoff vote until then.
          </li>
        </ul>

        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <Lock className="mt-1 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="space-y-2">
            <p className={strong}>Votes are secret</p>
            <p>
              Nobody sees who you voted for. While a battle is running, nobody sees the vote counts either:
              entries show &ldquo;hidden&rdquo; and are listed in the order they were submitted, not by
              popularity.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border/60 bg-card px-4 py-3">
          <Trophy className="mt-1 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="space-y-2">
            <p className={strong}>How the winner is decided</p>
            <p>
              When the end date passes, the counts are revealed and the entries are ranked by votes received.
              The entry with the most votes wins. If entries tie for the top spot, voting reopens for a
              3-day runoff on just the tied entries, and the tied DJs cannot vote in it. The entry with the
              most runoff votes wins. If the runoff ends level too, they share the win. A battle that
              finished with no votes has no winner.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Wins and the Hall of Fame">
        <p>
          Every completed regular battle with a winner goes on the record. Wins are counted only from finished
          battles, so the numbers never move while a battle is still running.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <span className={strong}>The Hall of Fame</span> ranks everyone with at least one win by their
            career wins. DJs with the same number of wins share a rank. Open it from the Battles page.
          </li>
          <li>
            <span className={strong}>Battle results</span> is the second tab there: every completed regular battle,
            newest first, with who won and the result.
          </li>
          <li>
            <span className={strong}>Your trophy shelf</span> is on your profile. It shows your wins, podium
            finishes (top three), best finish and winning streaks, plus badges for milestones.
          </li>
          <li>
            <span className={strong}>Shared wins count in full.</span> A win is only shared when the runoff
            also ends level. Then the win is on your record just like everyone else who tied.
          </li>
          <li>
            <span className={strong}>A runoff counts for nobody until it ends.</span> A battle that is in a
            runoff shows &ldquo;Runoff in progress&rdquo; and adds no win to anyone&apos;s record until the
            runoff closes.
          </li>
          <li>
            <span className={strong}>Head to head battles are not counted.</span> They have their own record
            (see below) and never add to your wins, the Hall of Fame or the battle results.
          </li>
        </ul>
      </Section>

      <Section title="Head to head challenges">
        <p>
          Want to take on one DJ directly? Challenge them to a head to head battle: just the two of you, and
          everyone else votes. It works differently from a regular battle, so here are the rules.
        </p>
        <Steps
          items={[
            <>
              <span className={strong}>Challenge a DJ.</span> You name one DJ and send your own entry video, and
              you pick how long voting lasts: 3, 7 or 14 days. The DJ you challenge cannot see your video until
              they accept, so use an unlisted video.
            </>,
            <>
              <span className={strong}>They answer within 10 days.</span> They can accept or decline. While it is
              still waiting, you can withdraw a challenge you sent.
            </>,
            <>
              <span className={strong}>Accepting opens the battle.</span> They enter with their own video and
              voting starts straight away. Like any battle, it is open through its last day.
            </>,
          ]}
        />
        <h3 className="pt-2 text-xl font-semibold text-foreground">Voting and the result</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <span className={strong}>Everyone else votes.</span> Anyone signed in can vote, except the two DJs,
            who cannot vote in their own head to head battle. Nobody can add other entries.
          </li>
          <li>
            <span className={strong}>Counts stay hidden until it ends.</span> Just like a regular battle.
          </li>
          <li>
            <span className={strong}>A tie is a draw.</span> If the votes are level, including when nobody
            voted, it is a draw. There is no runoff.
          </li>
          <li>
            <span className={strong}>A separate record.</span> Your head to head wins, losses and draws show on
            your profile once you have finished one. They never count toward your career wins or the Hall of
            Fame, and head to head battles are not listed in the Hall of Fame results.
          </li>
        </ul>
        <h3 className="pt-2 text-xl font-semibold text-foreground">Limits</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>Up to 3 challenges can be waiting for an answer at once.</li>
          <li>Only 1 challenge can be waiting between the same two DJs, whoever sent it.</li>
          <li>You can send 5 new challenges in 24 hours.</li>
          <li>If a DJ declines, wait 7 days before challenging them again.</li>
        </ul>
        <h3 className="pt-2 text-xl font-semibold text-foreground">Hearing about a challenge</h3>
        <p>
          You are told by email, and a count appears on the{' '}
          <span className={strong}>Profile</span> item in the menu. The challenges you have sent and received
          are listed on your own profile. If you would rather not get the emails, switch off{' '}
          <span className={strong}>Email me about challenges</span> in your profile.
        </p>
      </Section>

      <Section title="Hosting your own battle">
        <p className="flex items-start gap-2">
          <Eye className="mt-1 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          <span>
            Any signed-in user can create a battle. Choose a title, a type, a start and end date (up to a year
            apart) and a description. Put the rules in the description, since it is shown at the top of the
            battle for everyone to read.
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {BATTLE_TYPES.map((type) => (
            <Badge key={type} variant="outline" className="text-muted-foreground">
              {type}
            </Badge>
          ))}
        </div>
      </Section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/battles">View Battles</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/hall-of-fame">Hall of Fame</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/battles/create">Create Battle</Link>
        </Button>
      </div>
    </div>
  )
}
