'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface ModalProps {
  /** Called on Esc and on a click on the backdrop. Never called while `busy`. */
  onClose: () => void
  title: string
  /** Shown under the title and announced with it. */
  description?: ReactNode
  /** A submit is in flight: Esc and the backdrop do nothing. */
  busy?: boolean
  children: ReactNode
}

/**
 * A thin wrapper around the native <dialog>. It is open for as long as it is mounted: the
 * caller mounts it to open it (so a dialog's own state starts fresh each time) and unmounts it
 * to close it. The browser provides the focus trap, the inert page behind it and the scroll lock.
 *
 * Initial focus goes to the first element marked `data-autofocus`, else the first focusable
 * element. Focus goes back to whatever opened the dialog when it closes.
 */
export function Modal({ onClose, title, description, busy = false, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const pressStartedOnBackdrop = useRef(false)
  // Set once the Modal is being unmounted: the `close` event our own dialog.close() queues must not reach the caller.
  const unmounting = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    unmounting.current = false
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()

    return () => {
      unmounting.current = true
      if (dialog.open) dialog.close()
      // The button that opened the dialog may be gone (a deleted user's row). Fall back to the page heading.
      if (opener?.isConnected) {
        opener.focus()
      } else {
        const heading = document.querySelector<HTMLElement>('h1')
        if (heading) {
          heading.tabIndex = -1
          heading.focus()
        }
      }
    }
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => {
        // Esc. The browser would close the dialog itself; the caller decides instead.
        e.preventDefault()
        if (!busy) onClose()
      }}
      onClose={(e) => {
        // The native dialog closed without going through onCancel (for example Chrome skips the
        // cancel event for a second Esc press with no user activation in between). Bring React
        // back in line with it.
        const dialog = e.currentTarget
        if (unmounting.current || dialog.open) return // our own close(), or a stale event for a dialog that was reopened
        if (busy) {
          dialog.showModal() // a submit is in flight: the dialog stays up
          return
        }
        onClose()
      }}
      onMouseDown={(e) => {
        pressStartedOnBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        // A click on the dialog element itself (not its content) is a click on the backdrop.
        // The press must also have started there, so selecting text and releasing outside does not close it.
        if (e.target === e.currentTarget && pressStartedOnBackdrop.current && !busy) onClose()
        pressStartedOnBackdrop.current = false
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg overflow-visible border-0 bg-transparent p-0 text-foreground backdrop:bg-black/70"
    >
      <Card className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden shadow-2xl">
        <div className="shrink-0 p-6 pb-4">
          <h2 id={titleId} className="break-words font-graffiti text-2xl leading-tight">
            {title}
          </h2>
          {description && (
            <div id={descriptionId} className="mt-2 text-base text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto px-6 pb-6">{children}</div>
      </Card>
    </dialog>
  )
}

/** The place a dialog shows a failure. Always rendered so screen readers announce it when it fills. */
export function ModalError({ message }: { message: string | null }) {
  return (
    <div role="alert" className={cn(message && 'mt-4')}>
      {message && <p className="text-base font-medium text-red-400">{message}</p>}
    </div>
  )
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap justify-end gap-2">{children}</div>
}

/** Field label look shared with the profile form. */
export const labelClass = 'block text-base font-bold tracking-widest uppercase text-muted-foreground'

/** Text input look shared with the profile form. */
export const fieldClass =
  'w-full rounded-md border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors disabled:opacity-50'
