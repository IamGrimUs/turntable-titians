'use client'

import { useCallback, useRef, useState } from 'react'
import { adminErrorMessage } from '@/lib/admin-user-dialogs'

/**
 * The submit flow every admin dialog shares: one request at a time (a double click sends one),
 * the failure message kept for the dialog to show, and `onSuccess(message)` called on success.
 * After a success the dialog stays "submitting" so it can not be sent twice while it closes.
 */
export function useDialogSubmit(onSuccess: (message: string) => void) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const submit = useCallback(
    async (run: () => Promise<string>) => {
      if (inFlight.current) return
      inFlight.current = true
      setSubmitting(true)
      setError(null)
      let message: string
      try {
        message = await run()
      } catch (e) {
        setError(adminErrorMessage(e))
        inFlight.current = false
        setSubmitting(false)
        return
      }
      onSuccess(message)
    },
    [onSuccess],
  )

  return { submitting, error, setError, submit }
}
