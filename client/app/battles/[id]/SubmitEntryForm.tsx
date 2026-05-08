'use client'

import { useState } from 'react'
import { useMutation } from '@apollo/client'
import { CREATE_SUBMISSION } from '@/lib/graphql/queries'

const fieldClass =
  'w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors'
const labelClass = 'block text-xs font-bold tracking-widest uppercase text-muted-foreground'

interface Props {
  battleId: string
  onSuccess: () => void
}

export function SubmitEntryForm({ battleId, onSuccess }: Props) {
  const [videoUrl, setVideoUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const [createSubmission, { loading }] = useMutation(CREATE_SUBMISSION)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await createSubmission({
        variables: { battleId, videoUrl, title: title || undefined, description: description || undefined },
      })
      setVideoUrl('')
      setTitle('')
      setDescription('')
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 mb-8">
      <h2 className="text-lg font-black uppercase tracking-wide text-foreground mb-4">
        Submit Your Entry
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className={labelClass} htmlFor="videoUrl">Video URL (YouTube) *</label>
          <input
            id="videoUrl"
            type="url"
            required
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
        {error && <p className="text-sm font-medium text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-amber-500 px-6 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? 'Submitting…' : 'Submit Entry'}
        </button>
      </form>
    </div>
  )
}
