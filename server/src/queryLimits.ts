import {
  GraphQLError,
  Kind,
  type ASTVisitor,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  type ValidationContext,
} from 'graphql';

export interface QueryLimits {
  maxDepth: number;
  maxFields: number;
}

/** Thrown internally to stop walking as soon as a limit is crossed. */
class LimitExceeded extends Error {}

/**
 * What a fragment adds wherever it is spread, worked out once.
 * `fields` is capped at `maxFields + 1` (all that is needed to know the cap is crossed), so a
 * fragment chain that expands to 2^1000 fields stays an ordinary number.
 * `depth` is how many levels below the spread point its deepest field sits (0 = the same
 * level), or -1 when it has no countable field.
 */
interface Summary {
  fields: number;
  depth: number;
}

/**
 * Upper bound on the selections looked at while summarising fragments. A valid document needs
 * one look per selection; only a fragment cycle (which the standard rules reject anyway) can
 * make the work grow past that, and this stops it.
 */
const MAX_SUMMARY_WORK = 200_000;

/**
 * A GraphQL validation rule that refuses queries that are too deep or ask for
 * too many fields.
 *
 * GraphQL lets a client nest and alias freely, so a tiny request can ask the
 * server for an enormous amount of work. Fragments make it worse: a few short
 * fragments that each spread the next can expand into thousands of fields.
 * This counts fields AFTER expanding fragments, and gives up as soon as the
 * limit is crossed. Each fragment is measured once (not once per spread), so
 * checking even an abusive document takes time proportional to its size, and
 * the walk only descends into a fragment when it would cross a limit.
 *
 * Introspection (`__schema`, `__type`) is exempt so tooling keeps working.
 */
export function createQueryLimitRule({ maxDepth, maxFields }: QueryLimits) {
  return (context: ValidationContext): ASTVisitor => {
    let fragments: Map<string, FragmentDefinitionNode> | undefined;
    const summaries = new Map<string, Summary>();
    // The fragments being expanded right now, shared by the walk and the summaries so that
    // checking a spread never copies the path.
    const stack = new Set<string>();
    let work = 0;
    // Counts spreads skipped because the fragment was already being expanded (a cycle).
    let cyclesSkipped = 0;
    const fieldCap = maxFields + 1;

    const getFragments = () => {
      if (!fragments) {
        fragments = new Map();
        for (const def of context.getDocument().definitions) {
          if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
        }
      }
      return fragments;
    };

    /**
     * The summary of a fragment spread while `stack` is being expanded, or undefined if it
     * cannot be stated once for all places: skipping a cycle's way back in depends on where the
     * walk entered the cycle, so anything that touched a cycle is walked the long way instead.
     */
    const summarise = (name: string): Summary | undefined => {
      const known = summaries.get(name);
      if (known) return known;
      const fragment = getFragments().get(name);
      if (!fragment) return { fields: 0, depth: -1 };

      const cyclesBefore = cyclesSkipped;
      stack.add(name);
      const result = summariseSet(fragment.selectionSet);
      stack.delete(name);
      if (cyclesSkipped !== cyclesBefore) return undefined;
      summaries.set(name, result);
      return result;
    };

    const summariseSet = (set: SelectionSetNode): Summary => {
      let fields = 0;
      let depth = -1;
      for (const selection of set.selections) {
        if (++work > MAX_SUMMARY_WORK) {
          throw new LimitExceeded('Query is too complex: its fragments expand too many times.');
        }
        if (selection.kind === Kind.FIELD) {
          if (selection.name.value.startsWith('__')) continue;
          fields = Math.min(fields + 1, fieldCap);
          depth = Math.max(depth, 0);
          if (selection.selectionSet) {
            const inner = summariseSet(selection.selectionSet);
            fields = Math.min(fields + inner.fields, fieldCap);
            if (inner.depth >= 0) depth = Math.max(depth, inner.depth + 1);
          }
        } else if (selection.kind === Kind.INLINE_FRAGMENT) {
          const inner = summariseSet(selection.selectionSet);
          fields = Math.min(fields + inner.fields, fieldCap);
          depth = Math.max(depth, inner.depth);
        } else {
          const name = selection.name.value;
          if (stack.has(name)) {
            cyclesSkipped++;
            continue;
          }
          const inner = summarise(name);
          // No summary means a cycle was touched below, so this fragment gets none either
          // (cyclesSkipped has moved); the caller falls back to the long way.
          if (!inner) continue;
          fields = Math.min(fields + inner.fields, fieldCap);
          depth = Math.max(depth, inner.depth);
        }
      }
      return { fields, depth };
    };

    return {
      OperationDefinition(operation) {
        let fields = 0;
        // A walk that stopped early (limit reached) can leave names behind.
        stack.clear();
        const walk = (set: SelectionSetNode, depth: number) => {
          for (const selection of set.selections) {
            if (selection.kind === Kind.FIELD) {
              if (selection.name.value.startsWith('__')) continue;
              if (depth > maxDepth) throw new LimitExceeded(`Query is too deep (more than ${maxDepth} levels).`);
              if (++fields > maxFields) {
                throw new LimitExceeded(`Query is too complex: too many fields (more than ${maxFields}).`);
              }
              if (selection.selectionSet) walk(selection.selectionSet, depth + 1);
            } else if (selection.kind === Kind.INLINE_FRAGMENT) {
              walk(selection.selectionSet, depth);
            } else {
              const name = selection.name.value;
              // Unknown fragments and cycles are reported by the standard rules.
              if (stack.has(name)) continue;
              const fragment = getFragments().get(name);
              if (!fragment) continue;
              const summary = summaries.get(name) ?? summarise(name);
              // A fragment that stays within both limits is added in one step; one that would
              // cross a limit is walked, so the error is the one the plain walk would give.
              if (summary && depth + summary.depth <= maxDepth && fields + summary.fields <= maxFields) {
                fields += summary.fields;
                continue;
              }
              stack.add(name);
              walk(fragment.selectionSet, depth);
              stack.delete(name);
            }
          }
        };

        try {
          walk(operation.selectionSet, 1);
        } catch (e) {
          if (e instanceof LimitExceeded) {
            context.reportError(new GraphQLError(e.message, { nodes: [operation] }));
          } else if (e instanceof RangeError) {
            // A fragment chain so long that the walk ran out of call stack. Refuse it like any
            // other limit instead of letting the error escape (Apollo would log it and answer 500).
            // Whatever the abandoned walk left in `stack` is dropped so nothing leaks to the next
            // operation (it is also cleared when each operation starts); `summaries` only ever
            // holds finished results, so it is safe to keep.
            stack.clear();
            context.reportError(
              new GraphQLError('Query is too complex: its fragments expand too many times.', { nodes: [operation] })
            );
          } else throw e;
        }
      },
    };
  };
}
