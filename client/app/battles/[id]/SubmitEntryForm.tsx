'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@apollo/client'
import { CREATE_SUBMISSION } from '@/lib/graphql/queries'

const fieldClass =
  'w-full rounded-md border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors'
const labelClass = 'block text-base font-bold tracking-widest uppercase text-muted-foreground'

interface Props {
  battleId: string
  onSuccess: () => void
  onClose: () => void
}

export function SubmitEntryForm({ battleId, onSuccess, onClose }: Props) {
  const [videoUrl, setVideoUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [entered, setEntered] = useState(false)

  const [createSubmission, { loading }] = useMutation(CREATE_SUBMISSION)

  // Trigger slide-up on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const handleClose = useCallback(() => {
    setEntered(false)
    setTimeout(onClose, 300)
  }, [onClose])

  // Escape key dismissal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await createSubmission({
        variables: {
          battleId,
          videoUrl,
          title: title || undefined,
          description: description || undefined,
        },
      })
      onSuccess()
      handleClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    }
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 transition-opacity duration-300 ${entered ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Sheet panel */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-xl border border-border bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl transition-transform duration-300 ease-out ${
          entered ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-graffiti text-foreground">Submit Your Entry</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="p-2 text-muted-foreground hover:text-foreground text-2xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className={labelClass} htmlFor="videoUrl">Video URL (YouTube) *</label>
            <input
              id="videoUrl"
              type="url"
              required
              autoFocus
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className={fieldClass}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass} htmlFor="title">Title (optional)</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your set a name"
              className={fieldClass}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass} htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell the community about your set..."
              rows={3}
              className={fieldClass}
            />
          </div>
          {error && <p className="text-base font-medium text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-amber-500 px-6 py-3 text-base font-black uppercase tracking-widest text-black hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Submitting…' : 'Submit Entry'}
          </button>
        </form>
      </div>
    </>,
    document.body
  )
}
