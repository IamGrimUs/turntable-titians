'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Modal } from '@/components/admin/Modal'
import { UserSearchPanel } from '@/components/UserSearchPanel'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const LABEL = 'Search for a DJ'

/**
 * The navigation's "Find a DJ" trigger. `sidebar` is an icon like the other sidebar items (render it
 * inside the sidebar's TooltipProvider); `floating` sits at the top right of the page on phones, where
 * the bottom bar is full. The dialog is mounted only while open, so it starts fresh each time and
 * focus returns to this button when it closes.
 */
export function UserSearchButton({ variant }: { variant: 'sidebar' | 'floating' }) {
  const [open, setOpen] = useState(false)

  const dialog = open ? (
    <Modal title="Find a DJ" onClose={() => setOpen(false)} className="mt-4 mb-auto">
      <UserSearchPanel onClose={() => setOpen(false)} />
    </Modal>
  ) : null

  if (variant === 'floating') {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden fixed top-3 right-3 z-40"
          aria-label={LABEL}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </Button>
        {dialog}
      </>
    )
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={LABEL}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className="group flex w-full items-center justify-center rounded-md p-2.5 text-base font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Search</p>
        </TooltipContent>
      </Tooltip>
      {dialog}
    </>
  )
}
