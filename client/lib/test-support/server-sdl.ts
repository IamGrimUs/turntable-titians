/**
 * Test-only helper: builds the server's GraphQL schema from `server/src/schema.ts` so
 * client documents can be validated against the real SDL. The client and server share no
 * code, so this reads the file as text and never imports it.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildASTSchema, parse, type GraphQLSchema } from 'graphql'

const SCHEMA_PATH = fileURLToPath(new URL('../../../server/src/schema.ts', import.meta.url))

/** The SDL between the opening backtick of the `typeDefs` gql template and its last backtick. */
export function extractServerSdl(source: string): string {
  const tag = source.search(/typeDefs\s*=\s*gql\s*`/)
  if (tag === -1) throw new Error('Could not find the typeDefs gql template in server/src/schema.ts')
  const start = source.indexOf('`', tag) + 1
  const end = source.lastIndexOf('`')
  if (end <= start) throw new Error('Could not find the end of the typeDefs gql template')
  return source.slice(start, end).replace(/\\`/g, '`')
}

export function loadServerSchema(): GraphQLSchema {
  return buildASTSchema(parse(extractServerSdl(readFileSync(SCHEMA_PATH, 'utf8'))))
}
