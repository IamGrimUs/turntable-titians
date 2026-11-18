'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Home, Swords, Lightbulb, User, LogIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NavAvatar } from '@/components/NavAvatar'
import { WaitingPill } from '@/components/challenges/WaitingPill'
import { useChallengesWaiting } from '@/lib/use-challenges-waiting'
import { waitingAriaLabel } from '@/lib/profile-challenges'

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Battles', href: '/battles', icon: Swords },
  { name: 'Ideas', href: '/board', icon: Lightbulb },
]

export function BottomNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const waiting = useChallengesWaiting()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex md:hidden h-16 bg-background border-t border-border/60">
      {navigation.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== '/' && pathname?.startsWith(item.href))
        const Icon = item.icon
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 px-0.5 text-sm whitespace-nowrap transition-colors',
              isActive
                ? 'text-amber-500'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{item.name}</span>
          </Link>
        )
      })}

      {session?.user ? (
        <Link
          href="/profile"
          aria-label={waitingAriaLabel(waiting)}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1 px-0.5 text-sm whitespace-nowrap transition-colors',
            pathname === '/profile'
              ? 'text-amber-500'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span className="relative flex">
            {session.user.image ? (
              <NavAvatar key={session.user.image} src={session.user.image} />
            ) : (
              <User className="h-5 w-5" />
            )}
            <WaitingPill count={waiting} />
          </span>
          <span>Profile</span>
        </Link>
      ) : (
        <Link
          href="/auth/signin"
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1 px-0.5 text-sm whitespace-nowrap transition-colors',
            pathname === '/auth/signin'
              ? 'text-amber-500'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <LogIn className="h-5 w-5" />
          <span>Sign In</span>
        </Link>
      )}
    </nav>
  )
}
