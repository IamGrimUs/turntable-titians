'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Home, Swords, Plus, User, LogIn, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Battles', href: '/battles', icon: Swords },
  { name: 'Create', href: '/battles/create', icon: Plus },
]

export function BottomNav() {
  const pathname = usePathname()
  const { data: session } = useSession()

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
              'flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors',
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
        <>
          <Link
            href="/profile"
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors',
              pathname === '/profile'
                ? 'text-amber-500'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {session.user.image ? (
              <img
                src={session.user.image}
                alt="Profile"
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5" />
            )}
            <span>Profile</span>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span>Sign Out</span>
          </button>
        </>
      ) : (
        <Link
          href="/auth/signin"
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors',
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
