'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@apollo/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  BOARD_LIMITS,
  IDEA_CATEGORIES,
  IDEA_TOPICS,
  categoryLabel,
  topicLabel,
  type IdeaCategory,
  type IdeaRow,
  type IdeaTopic,
} from '@/lib/board-view'
import { fieldClass, labelClass } from '@/lib/form-styles'
import { CREATE_IDEA, GET_IDEAS } from '@/lib/graphql/board'
import { plural } from '@/lib/plural'
import { canSubmitIdea, remainingChars } from '@/lib/post-idea-form'

interface PostIdeaFormProps {
  onPosted: (idea: IdeaRow) => void
  onCancel?: () => void
}

/**
 * Inline card for posting an idea. The caller renders it only for a signed-in user with a
 * username. Length caps are mirrored as `maxLength`; links, duplicates and the daily cap are
 * the server's rules and its message is shown as-is.
 *
 * Category has no default on purpose: the person has to pick one, so nothing is filed under
 * the wrong heading unnoticed. Submit stays disabled until it is chosen.
 */
export function PostIdeaForm({ onPosted, onCancel }: PostIdeaFormProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<IdeaCategory | null>(null)
  const [topic, setTopic] = useState<IdeaTopic | ''>('')
  const [error, setError] = useState<string | null>(null)

  // `loading` only updates after a render, so a fast double click could slip a second request
  // through; the ref closes that gap.
  const sendingRef = useRef(false)
  const [createIdea, { loading }] = useMutation<{ createIdea: IdeaRow }>(CREATE_IDEA, {
    // The page's list query is active while the form is open; refetching it brings the new
    // idea (and the right page count) into view.
    refetchQueries: [GET_IDEAS],
    awaitRefetchQueries: true,
  })

  const canSubmit = canSubmitIdea({ title, body, category }) && !loading

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (sendingRef.current || !canSubmit || !category) return
    sendingRef.current = true
    setError(null)
    try {
      const result = await createIdea({
        variables: { title: title.trim(), body: body.trim(), category, topic: topic || null },
      })
      const idea = result.data?.createIdea
      setTitle('')
      setBody('')
      setCategory(null)
      setTopic('')
      if (idea) onPosted(idea)
    } catch (err) {
      // Keep what was typed so the person can fix it (remove a link, change the title).
      setError(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.')
    } finally {
      sendingRef.current = false
    }
  }

  return (
    <Card className="p-4 sm:p-6 mb-6">
      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
        <h2 className="text-2xl font-graffiti text-foreground">Post an idea</h2>
        <p className="text-base text-muted-foreground">
          Links are not allowed in ideas, and you can post up to 5 ideas a day.
        </p>

        <div className="space-y-2">
          <label htmlFor="idea-title" className={labelClass}>
            Title <span aria-hidden="true">*</span>
          </label>
          <input
            id="idea-title"
            type="text"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={BOARD_LIMITS.ideaTitle}
            aria-describedby="idea-title-hint"
            placeholder="A short summary"
            disabled={loading}
            className={fieldClass}
          />
          <p id="idea-title-hint" className="text-base text-muted-foreground">
            {plural(remainingChars(title, BOARD_LIMITS.ideaTitle), 'character')} left
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="idea-body" className={labelClass}>
            Description <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="idea-body"
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={BOARD_LIMITS.ideaBody}
            rows={5}
            aria-describedby="idea-body-hint"
            placeholder="Explain the idea, or what went wrong and how to see it"
            disabled={loading}
            className={fieldClass}
          />
          <p id="idea-body-hint" className="text-base text-muted-foreground">
            {plural(remainingChars(body, BOARD_LIMITS.ideaBody), 'character')} left
          </p>
        </div>

        <fieldset className="space-y-2 min-w-0" disabled={loading}>
          <legend className={labelClass}>
            Category <span aria-hidden="true">*</span>
          </legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2" role="radiogroup" aria-required="true">
            {IDEA_CATEGORIES.map((c) => (
              <label key={c} className="inline-flex items-center gap-2 text-base text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="idea-category"
                  value={c}
                  checked={category === c}
                  onChange={() => setCategory(c)}
                  className="h-5 w-5 accent-amber-500"
                />
                {categoryLabel(c)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="idea-topic" className={labelClass}>
            Topic (optional)
          </label>
          <select
            id="idea-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value as IdeaTopic | '')}
            disabled={loading}
            className={fieldClass}
          >
            <option value="">No topic</option>
            {IDEA_TOPICS.map((t) => (
              <option key={t} value={t}>
                {topicLabel(t)}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p role="alert" className="text-base font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={!canSubmit}>
            {loading ? 'Posting…' : 'Post idea'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
