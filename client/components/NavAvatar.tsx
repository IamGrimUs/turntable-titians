'use client'

import { useState } from 'react'
import { User } from 'lucide-react'

/**
 * The signed-in user's avatar in the navigation.
 *
 * The avatar file can be gone (replaced from another browser, then cleaned up) while this
 * session still holds its URL. A failed load shows the generic icon instead of the alt text
 * clipped to 20px. Callers key this on `src`, so a new avatar gets a fresh attempt.
 * The image is decorative: the link around it carries the accessible name.
 */
export function NavAvatar({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <User className="h-5 w-5" />
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-5 w-5 rounded-full object-cover"
    />
  )
}
