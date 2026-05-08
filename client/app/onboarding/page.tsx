'use client'

import { useSession } from 'next-auth/react'
import { useMutation } from '@apollo/client'
import { useRouter } from 'next/navigation'
import { useState, useRef } from 'react'
import { UPDATE_PROFILE_MUTATION } from '@/lib/graphql/queries'

const fieldClass =
  'w-full rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500/60 transition-colors'
const labelClass = 'block text-xs font-bold tracking-widest uppercase text-muted-foreground'

export default function OnboardingPage() {
  const { data: session, update } = useSession()
  const router = useRouter()
  const [updateProfile, { loading }] = useMutation(UPDATE_PROFILE_MUTATION)

  const [username, setUsername] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [crews, setCrews] = useState<string[]>([])
  const [crewInput, setCrewInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [seeded, setSeeded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (session?.user && !seeded) {
    setUsername(session.user.name?.replace(/\s+/g, '').toLowerCase() ?? '')
    setImageUrl(session.user.image ?? '')
    setSeeded(true)
  }

  async function handleImageUpload(file: File) {
    setUploading(true)
    setError('')
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      })
      const { url, publicUrl } = await res.json()
      await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      setImageUrl(publicUrl)
    } catch {
      setError('Image upload failed. Try again.')
    } finally {
      setUploading(false)
    }
  }

  function addCrew() {
    const trimmed = crewInput.trim()
    if (trimmed && !crews.includes(trimmed)) {
      setCrews([...crews, trimmed])
    }
    setCrewInput('')
  }

  function removeCrew(crew: string) {
    setCrews(crews.filter((c) => c !== crew))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await updateProfile({
        variables: {
          username: username || undefined,
          image: imageUrl || undefined,
          externalCrews: crews,
        },
      })
      await update()
      router.push('/battles')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <div className="min-h-full p-8 flex items-start justify-center">
      <div className="w-full max-w-xl">
        <div className="mb-8">
          <p className="text-xs font-bold tracking-[0.3em] uppercase text-amber-500 mb-2">
            Turntable Titans
          </p>
          <h1 className="text-3xl font-black tracking-tight uppercase text-foreground">
            Set Up Your Profile
          </h1>
          <div className="mt-3 h-px bg-gradient-to-r from-amber-500 to-transparent" />
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <form onSubmit={handleSubmit} className="space-y-6">

            <div className="space-y-2">
              <label className={labelClass} htmlFor="username">
                Username <span className="text-amber-500">*</span>
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_dj_handle"
                className={fieldClass}
              />
            </div>

            <div className="space-y-2">
              <p className={labelClass}>Profile Image</p>
              <div className="flex items-center gap-4">
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="Profile preview"
                    className="h-16 w-16 rounded-full object-cover border border-border"
                  />
                )}
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleImageUpload(file)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-all disabled:opacity-50"
                  >
                    {uploading ? 'Uploading…' : imageUrl ? 'Replace Image' : 'Upload Image'}
                  </button>
                  <p className="text-xs text-muted-foreground mt-1">Optional. JPG, PNG, WebP.</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className={labelClass}>DJ Crews (external)</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={crewInput}
                  onChange={(e) => setCrewInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCrew() } }}
                  placeholder="e.g. Rock Steady Crew"
                  className={`${fieldClass} flex-1`}
                />
                <button
                  type="button"
                  onClick={addCrew}
                  className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-all"
                >
                  Add
                </button>
              </div>
              {crews.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {crews.map((crew) => (
                    <span
                      key={crew}
                      className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-500"
                    >
                      {crew}
                      <button
                        type="button"
                        onClick={() => removeCrew(crew)}
                        className="hover:text-amber-300"
                        aria-label={`Remove ${crew}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-sm font-medium text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || uploading}
              className="w-full rounded-md bg-amber-500 px-6 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Saving…' : 'Save Profile'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
