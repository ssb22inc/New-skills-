import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/**
 * P35c — identity escrow. A user's channel-independent identity is the
 * phone number plus the state Sycamore already owns: opt-in status
 * (autopilot), role, and conversation state. All of it exports in one
 * call and rebinds to ANY channel adapter — migration is a rebind, not
 * a rebuild. WhatsApp is the door, not the house.
 */
export interface EscrowedIdentity {
  userId: string;
  phone: string;
  displayName: string;
  role: string;
  optedIn: boolean;
  conversationState: Record<string, unknown> | null;
}

export async function exportIdentities(
  db: Kysely<Database>,
  marketId: string,
): Promise<EscrowedIdentity[]> {
  const rows = await db
    .selectFrom('users')
    .leftJoin('conversation_sessions', (join) =>
      join
        .onRef('conversation_sessions.user_id', '=', 'users.id')
        .onRef('conversation_sessions.market_id', '=', 'users.market_id'),
    )
    .where('users.market_id', '=', marketId)
    .select([
      'users.id',
      'users.phone',
      'users.display_name',
      'users.role',
      'conversation_sessions.autopilot',
      'conversation_sessions.state',
    ])
    .execute();
  return rows.map((r) => ({
    userId: r.id,
    phone: r.phone,
    displayName: r.display_name,
    role: r.role,
    optedIn: r.autopilot ?? true,
    conversationState: r.state ?? null,
  }));
}

/**
 * Rebinding: identities attach to a new channel by address — nothing in
 * them was ever channel-specific. Returns the delivery plan the new
 * adapter executes; the count invariant (every identity rebinds) is the
 * migration's pass condition.
 */
export function rebindToChannel(
  identities: EscrowedIdentity[],
  channelId: string,
): { channel: string; to: string; userId: string; carriesState: boolean }[] {
  return identities.map((i) => ({
    channel: channelId,
    to: i.phone,
    userId: i.userId,
    carriesState: i.conversationState !== null,
  }));
}
