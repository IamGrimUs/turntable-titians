'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { UserSearchRow } from '@/components/UserSearchRow'
import { CHALLENGE_LIMITS } from '@/lib/challenge-view'
import { fieldClass } from '@/lib/form-styles'
import { moveActive, resultsAnnouncement, type UserSearchResult } from '@/lib/user-search'
import { useUserSearch } from '@/lib/use-user-search'

const ERROR_MESSAGE = 'Search is not working right now. You can still type the exact username.'

interface DjPickerProps {
  /** The typed username (the form's `values.username`). */
  value: string
  onChange: (username: string) => void
  /** The DOM id of the control the form's label and focus-on-error code point at. */
  inputId: string
  describedBy?: string
  invalid?: boolean
}

/**
 * The "DJ to challenge" control: a text box that suggests DJs as the person types (an ARIA
 * combobox). Picking a suggestion fills the username and shows the chosen DJ with a button to
 * choose someone else. Typing a username without picking works as before; the server still checks it.
 * Enter only picks while a suggestion is highlighted, otherwise it submits the form as usual.
 */
export function DjPicker({ value, onChange, inputId, describedBy, invalid }: DjPickerProps) {
  const [chosen, setChosen] = useState<UserSearchResult | null>(null)
  const [open, setOpen] = useState(false)
  // The highlighted row belongs to one results list; a new list starts with nothing highlighted.
  const [highlight, setHighlight] = useState<{ list: UserSearchResult[]; index: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const refocusRef = useRef(false)
  // Set by pick(): the input is replaced by the chosen view, so focus has to follow it (to its clear button).
  const focusChosenRef = useRef(false)

  const chosenUser = chosen !== null && chosen.username === value ? chosen : null
  // Search only while the person is typing: not for a chosen DJ, and not for a `?to=` prefill
  // they have not touched.
  const { state, results } = useUserSearch(open && !chosenUser ? value : '')
  const listOpen = open && !chosenUser && state !== 'idle'
  const listboxId = `${inputId}-listbox`
  const optionId = (index: number) => `${inputId}-option-${index}`
  const activeIndex = highlight && highlight.list === results ? highlight.index : -1
  const expanded = listOpen && state === 'results'

  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${inputId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, inputId])

  // After "choose a different DJ" the input is mounted again; put the cursor in it.
  useEffect(() => {
    if (!chosenUser && refocusRef.current) {
      refocusRef.current = false
      inputRef.current?.focus()
    }
  }, [chosenUser])

  // After a pick the focused input is gone; move focus to the clear button.
  useEffect(() => {
    if (chosenUser && focusChosenRef.current) {
      focusChosenRef.current = false
      document.getElementById(`${inputId}-clear`)?.focus()
    }
  }, [chosenUser, inputId])

  function pick(user: UserSearchResult) {
    focusChosenRef.current = true
    setChosen(user)
    setOpen(false)
    setHighlight(null)
    onChange(user.username)
  }

  function clearChoice() {
    refocusRef.current = true
    setChosen(null)
    setOpen(true)
    onChange('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!expanded) {
        // Reopen a list that Escape closed; nothing to move through otherwise.
        if (!open) setOpen(true)
        return
      }
      e.preventDefault()
      setHighlight({ list: results, index: moveActive(activeIndex, e.key, results.length) })
    } else if (e.key === 'Enter') {
      // Only while a suggestion is highlighted; otherwise the form submits as it always did.
      if (expanded && activeIndex >= 0) {
        e.preventDefault()
        pick(results[activeIndex])
      } else {
        // The form is about to submit: close the list so a row cannot be clicked mid-send.
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      if (listOpen) {
        e.preventDefault()
        setOpen(false)
      }
    }
  }

  // The status region stays mounted across both views so the choice is announced.
  const announcement = chosenUser
    ? `Chosen: ${chosenUser.username}`
    : listOpen && (state === 'results' || state === 'empty')
      ? resultsAnnouncement(results.length)
      : listOpen && state === 'error'
        ? ERROR_MESSAGE
        : ''

  return (
    <div className="relative">
      {chosenUser ? (
        <div
          id={inputId}
          role="group"
          tabIndex={-1}
          aria-label={`DJ to challenge: ${chosenUser.username}`}
          aria-describedby={describedBy}
          className="flex items-center gap-2 focus-visible:outline-none"
        >
          <div className="min-w-0 flex-1">
            <UserSearchRow user={chosenUser} active />
          </div>
          <button
            type="button"
            id={`${inputId}-clear`}
            onClick={clearChoice}
            aria-label={`Choose a different DJ than ${chosenUser.username}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-amber-500/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          value={value}
          onChange={(e) => {
            setOpen(true)
            setHighlight(null)
            onChange(e.target.value)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          maxLength={CHALLENGE_LIMITS.usernameMax}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Their username"
          aria-required="true"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listboxId : undefined}
          aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          className={fieldClass}
        />
      )}

      <div role="status" className="sr-only">
        {announcement}
      </div>

      {listOpen && (
        <div
          className="absolute left-0 right-0 z-20 mt-1 rounded-lg border border-border/60 bg-card shadow-sm"
          // Keep focus in the input (also for the scrollbar, padding and gaps) so its blur does not close the list.
          onMouseDown={(e) => e.preventDefault()}
        >
          {state === 'loading' && <p className="px-4 py-3 text-base text-muted-foreground">Searching…</p>}
          {state === 'empty' && <p className="px-4 py-3 text-base text-muted-foreground">No DJs found.</p>}
          {state === 'error' && (
            <p className="px-4 py-3 text-base text-muted-foreground">
              {ERROR_MESSAGE}
            </p>
          )}
          {state === 'results' && (
            <ul id={listboxId} role="listbox" aria-label="DJs" className="max-h-80 space-y-1.5 overflow-y-auto p-1.5">
              {results.map((user, index) => (
                <li
                  key={user.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  className="cursor-pointer"
                  onMouseMove={() => {
                    if (index !== activeIndex) setHighlight({ list: results, index })
                  }}
                  onClick={() => pick(user)}
                >
                  <UserSearchRow user={user} active={index === activeIndex} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
