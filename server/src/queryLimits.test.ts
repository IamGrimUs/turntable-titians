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
// Length of the chained fragments in the pathological documents.
const CHAIN = 40;
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

  it('counts a fragment every time it is spread', () => {
    const five = Array.from({ length: 5 }, (_, i) => `f${i}: name`).join(' ');
    const doc = (spreads: string) => `query { a { ${spreads} } } fragment F on A { ${five} }`;
    // `a` itself is one field: 1 + 5 + 5 = 11 is over a cap of 10, 1 + 5 + 4 is not.
    expect(run(doc('...F ...F')).join()).toMatch(/too many fields/i);
    expect(run(doc('...F ...F'), { maxDepth: 4, maxFields: 11 })).toEqual([]);
    expect(run(doc('...F ... on A { name }'), { maxDepth: 4, maxFields: 6 }).join()).toMatch(/too many fields/i);
    expect(run(doc('...F ... on A { __typename }'), { maxDepth: 4, maxFields: 6 })).toEqual([]);
  });

  it('reports whichever limit is crossed first, as the plain walk would', () => {
    const wide = Array.from({ length: 12 }, (_, i) => `f${i}: name`).join(' ');
    const q = (first: string, second: string) => `
      query { a { ...${first} ...${second} } }
      fragment Wide on A { ${wide} }
      fragment Deep on A { child { child { child { child { name } } } } }`;
    expect(run(q('Wide', 'Deep')).join()).toMatch(/too many fields/i);
    expect(run(q('Deep', 'Wide')).join()).toMatch(/too deep/i);
  });

  it('measures depth through a fragment from where it is spread', () => {
    const q = (at: string) => `
      query { a { ${at} } }
      fragment D on A { child { child { name } } }`;
    expect(run(q('...D'), { maxDepth: 4, maxFields: 50 })).toEqual([]);
    expect(run(q('child { ...D }'), { maxDepth: 4, maxFields: 50 }).join()).toMatch(/too deep/i);
    expect(run(q('child { child { ...D } }'), { maxDepth: 4, maxFields: 50 }).join()).toMatch(/too deep/i);
  });

  it('ignores unknown fragments', () => {
    expect(run('query { a { ...Nope name } }')).toEqual([]);
  });

  it('counts mutually recursive fragments once per path, ignoring the way back in', () => {
    const q = `
      query { a { ...A } }
      fragment A on A { n1: name ...B }
      fragment B on A { n2: name ...A }`;
    // a, n1, n2 and nothing more: 3 fields.
    expect(run(q, { maxDepth: 5, maxFields: 3 })).toEqual([]);
    expect(run(q, { maxDepth: 5, maxFields: 2 }).join()).toMatch(/too many fields/i);
  });

  describe('fragments that spread the next one twice', () => {
    const chain = (n: number, last: string, on = 'A') =>
      Array.from({ length: n }, (_, i) => `fragment F${i} on ${on} { ...F${i + 1} ...F${i + 1} }`).join('\n') +
      `\nfragment F${n} on ${on} { ${last} }`;
    const prod = { maxDepth: 6, maxFields: 150 };

    it('is checked in linear time when the expansion is free', () => {
      const doc = parse(`query { a { ...F0 } } ${chain(CHAIN, '__typename')}`);
      const start = performance.now();
      const errors = validate(schema, doc, [createQueryLimitRule(prod)]);
      const ms = performance.now() - start;
      expect(errors).toEqual([]);
      expect(ms).toBeLessThan(100);
    });

    it('is checked in linear time when only the last fragment holds a real field', () => {
      const doc = parse(`query { a { ...F0 } } ${chain(CHAIN, 'name')}`);
      const start = performance.now();
      const errors = validate(schema, doc, [createQueryLimitRule(prod)]).map((e) => e.message);
      const ms = performance.now() - start;
      expect(errors.join()).toMatch(/too many fields \(more than 150\)/i);
      expect(ms).toBeLessThan(100);
    });

    it('still reports "too many fields" when the count is beyond any number (2^1100)', () => {
      const doc = parse(`query { a { ...F0 } } ${chain(1100, 'name')}`);
      const errors = validate(schema, doc, [createQueryLimitRule(prod)]).map((e) => e.message);
      expect(errors).toEqual(['Query is too complex: too many fields (more than 150).']);
    });

    // How much call stack a request has left depends on the machine and on how warm the code is,
    // so these tests use up the stack in steps until the walk really does run out of it. Whatever
    // the step, validation must never throw; at some step it must give the clean refusal.
    const TOO_COMPLEX = 'Query is too complex: its fragments expand too many times.';
    const links = 3000;
    const distinctChain = (...operations: string[]) =>
      operations.join('\n') +
      '\n' +
      Array.from({ length: links }, (_, i) => `fragment F${i} on A{...F${i + 1}}`).join('\n') +
      `\nfragment F${links} on A{name}`;
    const burn = (frames: number, fn: () => unknown): unknown => (frames > 0 ? burn(frames - 1, fn) : fn());
    function validateWithStackLeft(doc: ReturnType<typeof parse>, frames: number) {
      let entered = false;
      try {
        return burn(frames, () => {
          entered = true;
          return validate(schema, doc, [createQueryLimitRule(prod)]).map((e) => e.message);
        }) as string[];
      } catch (e) {
        // Running out of stack while burning it is the test's own doing, not the rule's.
        if (!entered) return null;
        throw e;
      }
    }

    it('refuses a chain of 3,000 distinct fragments cleanly instead of running out of call stack', () => {
      const source = distinctChain('query { a { ...F0 } }');
      expect(source.length).toBeLessThan(100 * 1024);
      const doc = parse(source);
      const start = performance.now();
      let refused = false;
      for (let frames = 0; frames <= 9000 && !refused; frames += 250) {
        const errors = validateWithStackLeft(doc, frames);
        if (errors === null) break;
        refused = errors.length === 1 && errors[0] === TOO_COMPLEX;
        if (!refused) expect(errors).toEqual([]);
      }
      expect(refused).toBe(true);
      expect(performance.now() - start).toBeLessThan(500);
    });

    it('checks the next operation normally after a too-deep chain was abandoned', () => {
      const doc = parse(distinctChain('query Deep { a { ...F0 } }', 'query Small { a { name } }'));
      let refused = false;
      for (let frames = 0; frames <= 9000 && !refused; frames += 250) {
        const errors = validateWithStackLeft(doc, frames);
        if (errors === null) break;
        // Only the deep operation is ever refused (once); the small one adds no error of its own.
        expect(errors.length).toBeLessThanOrEqual(1);
        refused = errors.length === 1 && errors[0] === TOO_COMPLEX;
      }
      expect(refused).toBe(true);
    });

    it('is checked in linear time when the fragments are nested', () => {
      const nested =
        Array.from({ length: CHAIN }, (_, i) => `fragment F${i} on A { x: child { ...F${i + 1} } y: child { ...F${i + 1} } }`).join('\n') +
        `\nfragment F${CHAIN} on A { __typename }`;
      const doc = parse(`query { a { ...F0 } } ${nested}`);
      const start = performance.now();
      const errors = validate(schema, doc, [createQueryLimitRule({ maxDepth: 60, maxFields: 150 })]).map((e) => e.message);
      const ms = performance.now() - start;
      expect(errors.join()).toMatch(/too many fields/i);
      expect(ms).toBeLessThan(100);
    });

    it('is not slowed by a long chain of fragments whose last one spreads a leaf fragment thousands of times', () => {
      // About 90 KB, so it fits under express.json's 100 kb body limit. The deep selection at the
      // end forces the walk down the whole chain, and every spread of M must cost the same however
      // long the chain above it is.
      const length = 1500;
      const spreads = 9000;
      const chained = Array.from({ length }, (_, i) => `fragment f${i} on A { ...f${i + 1} }`).join('\n');
      const deep = 'child { '.repeat(7) + 'name' + ' }'.repeat(7);
      const source =
        `query { a { ...f0 } }\n${chained}\n` +
        `fragment f${length} on A { ${'...M '.repeat(spreads)} ${deep} }\n` +
        'fragment M on A { __typename }';
      expect(source.length).toBeLessThan(100_000);
      const doc = parse(source);
      const start = performance.now();
      const errors = validate(schema, doc, [createQueryLimitRule(prod)]).map((e) => e.message);
      const ms = performance.now() - start;
      expect(errors.join()).toMatch(/too deep/i);
      expect(ms).toBeLessThan(100);
    });

    it('stays fast when the chain also loops back on itself (an invalid document)', () => {
      const doc = parse(`query { a { ...F0 } } ${chain(CHAIN, '...F0')}`);
      const start = performance.now();
      expect(() => validate(schema, doc, [createQueryLimitRule(prod)])).not.toThrow();
      expect(performance.now() - start).toBeLessThan(500);
    });
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
