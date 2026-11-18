import type { Prisma } from '@prisma/client'

/**
 * "This battle is a regular battle": it has no Challenge row. A head to head duel is a Battle
 * with a linked Challenge (`Challenge.battleId`), so duels are found by that relation and
 * NEVER by `Battle.type`, which is free text any battle creator can type. Every query that
 * decides wins, places or standings filters with this, so a duel can never count toward them.
 */
export const regularBattleWhere = { challenge: { is: null } } satisfies Prisma.BattleWhereInput

/** The opposite of `regularBattleWhere`: a battle that has a Challenge row is a head to head duel. */
export const duelBattleWhere = { challenge: { isNot: null } } satisfies Prisma.BattleWhereInput

/** The display label of a duel's `Battle.type`. Reserved: `createBattle` refuses it, so it is never a regular battle's type. */
export const HEAD_TO_HEAD_TYPE = 'Head to Head'
