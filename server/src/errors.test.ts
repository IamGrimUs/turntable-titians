import { describe, it, expect, vi } from 'vitest';
import { GraphQLError } from 'graphql';
import { formatError } from './errors';

const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('formatError', () => {
  it('passes deliberate user-facing errors through unchanged', () => {
    const formatted = { message: 'Already voted in this battle', extensions: { code: 'CONFLICT' } };
    expect(formatError(formatted, new GraphQLError('x'))).toEqual(formatted);
  });

  it('keeps validation errors readable (the client needs them)', () => {
    const formatted = { message: 'Query is too deep (more than 6 levels).', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } };
    expect(formatError(formatted, new GraphQLError('x')).message).toBe(formatted.message);
  });

  it('hides the message of unexpected internal errors, keeping a generic one', () => {
    const spy = quiet();
    const formatted = {
      message: 'Invalid `prisma.vote.create()` invocation: column "secret_col" does not exist',
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    };
    const out = formatError(formatted, new GraphQLError(formatted.message));
    expect(out.message).toBe('Something went wrong. Please try again.');
    expect(out.extensions?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(out)).not.toContain('secret_col');
    spy.mockRestore();
  });

  it('removes stack traces and other internals from every error', () => {
    const formatted = {
      message: 'Not authenticated',
      extensions: { code: 'UNAUTHENTICATED', stacktrace: ['at secret (/app/dist/x.js:1:1)'], exception: { a: 1 } },
    };
    const out = formatError(formatted, new GraphQLError('x'));
    expect(out.extensions).toEqual({ code: 'UNAUTHENTICATED' });
  });

  it('logs the real error on the server so it can still be debugged', () => {
    const spy = quiet();
    const original = new GraphQLError('real database failure');
    formatError({ message: 'real database failure', extensions: { code: 'INTERNAL_SERVER_ERROR' } }, original);
    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).toContain('real database failure');
    spy.mockRestore();
  });

  it('treats an error with no code as internal', () => {
    const spy = quiet();
    const out = formatError({ message: 'boom with internals' }, new Error('boom with internals'));
    expect(out.message).toBe('Something went wrong. Please try again.');
    spy.mockRestore();
  });

  it('keeps retryAfterSeconds on rate-limit errors', () => {
    const formatted = { message: 'slow down', extensions: { code: 'RATE_LIMITED', retryAfterSeconds: 30 } };
    expect(formatError(formatted, new GraphQLError('x')).extensions).toEqual({ code: 'RATE_LIMITED', retryAfterSeconds: 30 });
  });
});
