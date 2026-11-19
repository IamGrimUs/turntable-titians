'use client'

import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserSearchRow } from '@/components/UserSearchRow'
import { fieldClass } from '@/lib/form-styles'
import { SEARCH_LIMITS, moveActive, resultsAnnouncement, type UserSearchResult } from '@/lib/user-search'
import { useUserSearch } from '@/lib/use-user-search'

const ERROR_MESSAGE = 'Search is not working right now. Please try again.'

/**
 * The content of the "Find a DJ" dialog: a search box (an ARIA combobox) and the matching DJs as
 * links to their profiles. Focus stays in the box; the arrow keys move a highlight through the rows
 * and Enter opens the highlighted profile. Following a link or pressing Enter closes the panel.
 */
export function UserSearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [value, setValue] = useState('')
  // The highlighted row belongs to one results list; a new list starts with nothing highlighted.
  const [highlight, setHighlight] = useState<{ list: UserSearchResult[]; index: number } | null>(null)
  const { state, results } = useUserSearch(value)
  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const optionId = (index: number) => `${baseId}-option-${index}`
  const activeIndex = highlight && highlight.list === results ? highlight.index : -1
  const expanded = state === 'results'

  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${baseId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, baseId])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!expanded) return
      e.preventDefault()
      setHighlight({ list: results, index: moveActive(activeIndex, e.key, results.length) })
    } else if (e.key === 'Enter') {
      // Not a form: Enter only does something while a row is highlighted.
      if (expanded && activeIndex >= 0) {
        e.preventDefault()
        router.push(`/users/${results[activeIndex].id}`)
        onClose()
      }
    }
  }

  const announcement =
    state === 'results' || state === 'empty'
      ? resultsAnnouncement(results.length)
      : state === 'error'
        ? ERROR_MESSAGE
        : ''

  return (
    <div>
      <label htmlFor={`${baseId}-input`} className="sr-only">
        Search for a DJ
      </label>
      <input
        id={`${baseId}-input`}
        data-autofocus
        type="text"
        role="combobox"
        value={value}
        onChange={(e) => {
          setHighlight(null)
          setValue(e.target.value)
        }}
        onKeyDown={handleKeyDown}
        maxLength={SEARCH_LIMITS.maxChars}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Search by username"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listboxId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        className={fieldClass}
      />

      <div role="status" className="sr-only">
        {announcement}
      </div>

      <div className="mt-3">
        {state === 'idle' && (
          <p className="px-1 py-2 text-base text-muted-foreground">Type at least {SEARCH_LIMITS.minChars} characters.</p>
        )}
        {state === 'loading' && <p className="px-1 py-2 text-base text-muted-foreground">Searching…</p>}
        {state === 'empty' && <p className="px-1 py-2 text-base text-muted-foreground">No DJs found.</p>}
        {state === 'error' && (
          <p className="px-1 py-2 text-base text-muted-foreground">{ERROR_MESSAGE}</p>
        )}
        {state === 'results' && (
          <ul id={listboxId} role="listbox" aria-label="DJs" className="space-y-1.5">
            {results.map((user, index) => (
              <li
                key={user.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onMouseMove={() => {
                  if (index !== activeIndex) setHighlight({ list: results, index })
                }}
              >
                {/* Focus stays in the box (the combobox drives the rows), so the link is not a tab stop. */}
                <Link href={`/users/${user.id}`} tabIndex={-1} onClick={onClose} className="block">
                  <UserSearchRow user={user} active={index === activeIndex} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
