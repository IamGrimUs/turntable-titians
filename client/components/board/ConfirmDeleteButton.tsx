'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

interface ConfirmDeleteButtonProps {
  /** Text of the first button, e.g. "Delete idea". */
  label: string
  /** Question shown at the confirm step, e.g. "Delete this idea? This cannot be undone." */
  question: string
  /** Does the delete. It must handle its own errors; the button only guards double clicks. */
  onConfirm: () => Promise<void>
  size?: 'default' | 'sm'
}

/**
 * Two-step delete: the first click only asks, the second one deletes. A ref (set synchronously)
 * stops a fast double click from sending two requests.
 */
export function ConfirmDeleteButton({ label, question, onConfirm, size = 'sm' }: ConfirmDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const runningRef = useRef(false)

  async function confirm() {
    if (runningRef.current) return
    runningRef.current = true
    setPending(true)
    try {
      await onConfirm()
    } finally {
      runningRef.current = false
      setPending(false)
      setConfirming(false)
    }
  }

  if (!confirming) {
    return (
      <Button type="button" variant="outline" size={size} onClick={() => setConfirming(true)}>
        {label}
      </Button>
    )
  }

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-base text-foreground">{question}</span>
      <Button type="button" variant="destructive" size={size} onClick={confirm} disabled={pending}>
        {pending ? 'Deleting…' : 'Yes, delete'}
      </Button>
      <Button type="button" variant="outline" size={size} onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </Button>
    </div>
  )
}
