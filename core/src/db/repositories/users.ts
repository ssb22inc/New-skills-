import type { Kysely, Selectable } from 'kysely';
import type { Database, UsersTable } from '../types.js';

export type User = Selectable<UsersTable>;

/**
 * Market-scoped by construction: every query this repository can express is
 * filtered to the market it was created for. Callers never pass market_id
 * per call, so no call site can forget it (CLAUDE.md data rules).
 */
export function usersRepo(db: Kysely<Database>, marketId: string) {
  return {
    async create(input: { phone: string; displayName: string }): Promise<User> {
      return db
        .insertInto('users')
        .values({ market_id: marketId, phone: input.phone, display_name: input.displayName })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async list(): Promise<User[]> {
      return db.selectFrom('users').where('market_id', '=', marketId).selectAll().execute();
    },

    async findByPhone(phone: string): Promise<User | undefined> {
      return db
        .selectFrom('users')
        .where('market_id', '=', marketId)
        .where('phone', '=', phone)
        .selectAll()
        .executeTakeFirst();
    },
  };
}

export type UsersRepo = ReturnType<typeof usersRepo>;
