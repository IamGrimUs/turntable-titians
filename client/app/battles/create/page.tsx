'use client'

import { gql, useMutation } from '@apollo/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const BATTLE_TYPES = ['Skratch Battle', 'Mix Battle', 'Beat Battle', 'Match a Skratch Battle', 'Open Format']

const CREATE_BATTLE = gql`
  mutation CreateBattle($title: String!, $type: String!, $description: String, $startDate: String!, $endDate: String!) {
    createBattle(title: $title, type: $type, description: $description, startDate: $startDate, endDate: $endDate) {
      id
      title
    }
  }
`

const fieldClass =
  'w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors'

const labelClass = 'block text-xs font-bold tracking-widest uppercase text-muted-foreground'

export default function CreateBattlePage() {
  const router = useRouter()
  const [createBattle, { loading, error }] = useMutation(CREATE_BATTLE)

  const [title, setTitle] = useState('')
  const [type, setType] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0])
  const [validationError, setValidationError] = useState('')

  const todayStr = new Date().toISOString().split('T')[0]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError('')

    if (!type) {
      setValidationError('Please select a battle type.')
      return
    }

    const start = new Date(`${startDate}T00:00:00`)
    const end = new Date(start.getTime() + 10 * 24 * 60 * 60 * 1000)

    const { data } = await createBattle({
      variables: {
        title,
        type,
        description: description || undefined,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    })

    if (data?.createBattle?.id) {
      router.push('/battles')
    }
  }

  const displayError = validationError || error?.message

  return (
    <div className="min-h-full p-8 flex items-start justify-center">
      <div className="w-full max-w-xl">

        <div className="mb-8">
          <p className="text-xl font-graffiti text-amber-500 mb-2">Battle Skratch</p>
          <h1 className="text-3xl font-black tracking-tight uppercase text-foreground">Drop a Battle</h1>
          <div className="mt-3 h-px bg-gradient-to-r from-amber-500 to-transparent" />
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <form onSubmit={handleSubmit} className="space-y-6">

            <div className="space-y-2">
              <label className={labelClass} htmlFor="title">
                Title <span className="text-amber-500">*</span>
              </label>
              <input
                id="title"
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Summer Scratch Showdown"
                className={fieldClass}
              />
            </div>

            <div className="space-y-2">
              <p className={labelClass}>
                Battle Type <span className="text-amber-500">*</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {BATTLE_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide transition-all border ${
                      type === t
                        ? 'bg-amber-500 text-black border-amber-500'
                        : 'bg-transparent text-muted-foreground border-border hover:border-amber-500/50 hover:text-foreground'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className={labelClass} htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What's this battle about?"
                rows={3}
                className={`${fieldClass} resize-none`}
              />
            </div>

            <div className="space-y-2">
              <label className={labelClass} htmlFor="startDate">
                Start Date <span className="text-amber-500">*</span>
              </label>
              <input
                id="startDate"
                type="date"
                required
                min={todayStr}
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className={fieldClass}
              />
              <p className="text-xs text-muted-foreground">Battle goes live on this date. Ends 10 days later.</p>
            </div>

            {displayError && (
              <p className="text-sm font-medium text-red-400">{displayError}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-md bg-amber-500 px-6 py-3 text-sm font-black uppercase tracking-widest text-black transition-all hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Dropping…' : 'Drop It'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/battles')}
                className="rounded-md border border-border px-6 py-3 text-sm font-semibold text-muted-foreground transition-all hover:border-foreground/40 hover:text-foreground"
              >
                Cancel
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  )
}
