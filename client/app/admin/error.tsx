'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Shown when an admin page fails while rendering (for example the database is unreachable
 * during the access check in the page's `requireAdminViewer()`). The error itself is never
 * shown: its text can hold internals. Next.js logs it on the server.
 *
 * `retry` (Next 16.3+) re-fetches and re-renders the failed children from the server. Plain
 * `reset` would only clear the client error state and may reuse the failed server render.
 *
 * Only failures in a page below this folder land here. The same check also runs in
 * `layout.tsx`, which sits above this boundary: a failure there is not caught here and goes
 * to the parent error boundary.
 */
export default function AdminError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="p-8">
      <h1 className="font-graffiti text-4xl">Something went wrong</h1>
      <Card className="mt-6 max-w-xl">
        <CardContent className="p-6">
          <p role="alert" className="text-base text-muted-foreground">
            We couldn&apos;t load this admin page. Please try again. If it keeps happening, try again in a few minutes.
          </p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => retry()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
