import { describe, it, expect } from 'vitest';
import { parse, validate, buildSchema, buildASTSchema } from 'graphql';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { typeDefs } from './schema';
import { createQueryLimitRule } from './queryLimits';

const schema = buildSchema(
  `type Query { a: A }
   type A { name: String, child: A, kids: [A] }`
);
const run = (query: string, opts = { maxDepth: 4, maxFields: 10 }) =>
  validate(schema, parse(query), [createQueryLimitRule(opts)]).map((e) => e.message);

describe('createQueryLimitRule', () => {
  it('accepts a modest query', () => {
    expect(run('{ a { name child { name } } }')).toEqual([]);
  });

  it('rejects a query nested too deeply', () => {
    const errors = run('{ a { child { child { child { child { name } } } } } }');
    expect(errors.join()).toMatch(/too deep/i);
  });

  it('rejects a query asking for too many fields (including aliases)', () => {
    const fields = Array.from({ length: 12 }, (_, i) => `f${i}: name`).join(' ');
    expect(run(`{ a { ${fields} } }`).join()).toMatch(/too many fields|complex/i);
  });

  it('counts fields reached through fragments', () => {
    const q = `
      query { a { ...F } }
      fragment F on A { n1: name n2: name n3: name n4: name n5: name n6: name n7: name n8: name n9: name n10: name }`;
    expect(run(q).join()).toMatch(/too many fields|complex/i);
  });

  it('is not fooled by fragments that expand exponentially', () => {
    const q = `
      query { a { ...F0 } }
      fragment F0 on A { child { ...F1 } kids { ...F1 } }
      fragment F1 on A { child { ...F2 } kids { ...F2 } }
      fragment F2 on A { child { ...F3 } kids { ...F3 } }
      fragment F3 on A { name }`;
    expect(run(q, { maxDepth: 20, maxFields: 10 }).join()).toMatch(/too many fields|complex/i);
  });

  it('does not loop forever on a fragment cycle', () => {
    const q = `query { a { ...F } } fragment F on A { child { ...F } }`;
    expect(() => run(q, { maxDepth: 50, maxFields: 1000 })).not.toThrow();
  });

  it('lets introspection through (tools and the sandbox need it)', () => {
    const fields = Array.from({ length: 30 }, () => 'name').join(' ');
    const q = `{ __schema { types { ${fields} } } }`;
    expect(run(q)).toEqual([]);
  });
});

describe('real client queries', () => {
  it('every query and mutation the app sends is within the production limits', () => {
    const source = readFileSync(resolve(__dirname, '../../client/lib/graphql/queries.ts'), 'utf8');
    const docs = [...source.matchAll(/gql`([\s\S]*?)`/g)].map((m) => m[1]);
    expect(docs.length).toBeGreaterThan(0);
    const real = buildASTSchema(typeDefs);
    for (const doc of docs) {
      const errors = validate(real, parse(doc), [createQueryLimitRule({ maxDepth: 6, maxFields: 150 })]);
      expect(errors.map((e) => e.message)).toEqual([]);
    }
  });
});
