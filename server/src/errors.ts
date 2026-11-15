import type { GraphQLFormattedError } from 'graphql';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

// Extension fields that are safe to show clients. Everything else (stacktrace, exception
// details, ...) is dropped, so a changed server setting can never leak them.
const SAFE_EXTENSIONS = ['code', 'retryAfterSeconds'] as const;

/**
 * Decides what an API client sees when something goes wrong.
 *
 * Errors the resolvers throw on purpose ("Already voted", "Not authenticated", ...) carry a
 * specific code and a message written for users, so they pass through. Anything unexpected
 * (a database failure, a bug) has its message replaced, because those messages can contain
 * query text and table or column names. The real error is logged here instead.
 */
export function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const code = formatted.extensions?.code;
  const isInternal = code === undefined || code === 'INTERNAL_SERVER_ERROR';

  const extensions: Record<string, unknown> = {};
  for (const key of SAFE_EXTENSIONS) {
    if (formatted.extensions && key in formatted.extensions) extensions[key] = formatted.extensions[key];
  }

  if (isInternal) {
    console.error('[graphql] internal error:', error);
    return {
      ...formatted,
      message: GENERIC_MESSAGE,
      extensions: { ...extensions, code: 'INTERNAL_SERVER_ERROR' },
    };
  }
  return { ...formatted, extensions };
}
