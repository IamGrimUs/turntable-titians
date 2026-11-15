/**
 * True when the request failed because the caller may not use the admin API (not signed in, or
 * no longer allowed): the pages then show "You don't have access" instead of a retry prompt.
 */
export function hasAccessError(error: {
  graphQLErrors?: readonly { extensions?: Record<string, unknown> }[]
}): boolean {
  return (error.graphQLErrors ?? []).some(
    (e) => e.extensions?.code === 'FORBIDDEN' || e.extensions?.code === 'UNAUTHENTICATED'
  )
}
