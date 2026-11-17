export type BoardListState = 'loading' | 'error' | 'empty' | 'rows'

/**
 * What the board list area should show.
 *
 * `hasData` means the query for the CURRENT filters/page returned data; `hasPrevious` means an
 * earlier result (other filters or page) is still around. An error with no fresh data always wins:
 * the previous result must never be shown as if it were the answer to the newly chosen filter.
 * While loading, the previous result may stay on screen so the list does not jump.
 */
export function boardListState(input: {
  hasError: boolean
  hasData: boolean
  hasPrevious: boolean
  loading: boolean
  rowCount: number
}): BoardListState {
  if (input.hasError && !input.hasData) return 'error'
  if (!input.hasData && !(input.loading && input.hasPrevious)) return 'loading'
  return input.rowCount === 0 ? 'empty' : 'rows'
}
