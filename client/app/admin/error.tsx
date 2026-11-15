'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Shown when an admin page fails while rendering (for example the database is unreachable
 * during the access check). The error itself is never shown: its text can hold internals.
 * Next.js logs it on the server; `reset` re-renders the page.
 */
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-8">
      <h1 className="font-graffiti text-4xl">Something went wrong</h1>
      <Card className="mt-6 max-w-xl">
        <CardContent className="p-6">
          <p role="alert" className="text-base text-muted-foreground">
            We couldn&apos;t load this admin page. Please try again. If it keeps happening, try again in a few minutes.
          </p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => reset()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
