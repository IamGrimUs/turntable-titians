'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { adminMenuItems, type Role } from '@/lib/admin-access'
import { cn } from '@/lib/utils'

/**
 * The admin section menu: a 200px labelled column beside the icon rail on desktop, and a
 * native <details> "Menu" button above the page on small screens. The items come from
 * adminMenuItems(role), so a link is only shown to someone who may open it.
 */
export function AdminMenu({ role }: { role: Role }) {
  const pathname = usePathname()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const items = adminMenuItems(role)

  const links = items.map((item) => {
    const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
    return (
      <li key={item.key}>
        <Link
          href={item.href}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => {
            if (detailsRef.current) detailsRef.current.open = false
          }}
          className={cn(
            'flex items-center rounded-md px-2.5 py-2 text-base font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60',
            isActive
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          {item.label}
        </Link>
      </li>
    )
  })

  return (
    <>
      <nav
        aria-label="Admin"
        className="hidden w-[200px] shrink-0 border-r border-border/60 px-3 py-4 md:block"
      >
        <p className="mx-2 mb-3 mt-1.5 text-base font-semibold uppercase tracking-widest text-muted-foreground">
          Admin
        </p>
        <ul className="space-y-0.5">{links}</ul>
      </nav>

      <details ref={detailsRef} className="group border-b border-border/60 md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-base font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500/60 [&::-webkit-details-marker]:hidden">
          <span>Menu</span>
          <ChevronDown
            aria-hidden="true"
            className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <nav aria-label="Admin" className="px-3 pb-3">
          <ul className="space-y-0.5">{links}</ul>
        </nav>
      </details>
    </>
  )
}
