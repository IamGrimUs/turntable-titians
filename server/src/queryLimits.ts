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
 * A GraphQL validation rule that refuses queries that are too deep or ask for
 * too many fields.
 *
 * GraphQL lets a client nest and alias freely, so a tiny request can ask the
 * server for an enormous amount of work. Fragments make it worse: a few short
 * fragments that each spread the next can expand into thousands of fields.
 * This counts fields AFTER expanding fragments, and gives up as soon as the
 * limit is crossed, so checking an abusive query is itself cheap.
 *
 * Introspection (`__schema`, `__type`) is exempt so tooling keeps working.
 */
export function createQueryLimitRule({ maxDepth, maxFields }: QueryLimits) {
  return (context: ValidationContext): ASTVisitor => ({
    OperationDefinition(operation) {
      const fragments = new Map<string, FragmentDefinitionNode>();
      for (const def of context.getDocument().definitions) {
        if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
      }

      let fields = 0;
      const walk = (set: SelectionSetNode, depth: number, spreading: string[]) => {
        for (const selection of set.selections) {
          if (selection.kind === Kind.FIELD) {
            if (selection.name.value.startsWith('__')) continue;
            if (depth > maxDepth) throw new LimitExceeded(`Query is too deep (more than ${maxDepth} levels).`);
            if (++fields > maxFields) {
              throw new LimitExceeded(`Query is too complex: too many fields (more than ${maxFields}).`);
            }
            if (selection.selectionSet) walk(selection.selectionSet, depth + 1, spreading);
          } else if (selection.kind === Kind.INLINE_FRAGMENT) {
            walk(selection.selectionSet, depth, spreading);
          } else {
            const name = selection.name.value;
            const fragment = fragments.get(name);
            // Unknown fragments and cycles are reported by the standard rules.
            if (!fragment || spreading.includes(name)) continue;
            walk(fragment.selectionSet, depth, [...spreading, name]);
          }
        }
      };

      try {
        walk(operation.selectionSet, 1, []);
      } catch (e) {
        if (e instanceof LimitExceeded) context.reportError(new GraphQLError(e.message, { nodes: [operation] }));
        else throw e;
      }
    },
  });
}
