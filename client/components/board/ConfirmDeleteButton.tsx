'use client'

import { useEffect, useRef, useState } from 'react'
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // Set only by Cancel, so focus goes back to the trigger after a cancel and not after a delete.
  const cancelledRef = useRef(false)

  // The trigger unmounts while confirming, so focus moves after the render that swaps the buttons:
  // to Cancel (the safe choice) when the question opens, back to the trigger when it is cancelled.
  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus()
    } else if (cancelledRef.current) {
      cancelledRef.current = false
      triggerRef.current?.focus()
    }
  }, [confirming])

  function cancel() {
    cancelledRef.current = true
    setConfirming(false)
  }

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
      <Button ref={triggerRef} type="button" variant="outline" size={size} onClick={() => setConfirming(true)}>
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
      <Button ref={cancelRef} type="button" variant="outline" size={size} onClick={cancel} disabled={pending}>
        Cancel
      </Button>
    </div>
  )
}
