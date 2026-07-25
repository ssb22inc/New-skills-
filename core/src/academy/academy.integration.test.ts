import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { academyService } from './academy.js';

/** Flip a user's autopilot the way STOP/RESUME do, without a full engine. */
async function setAutopilot(
  db: ReturnType<typeof createDb>,
  userId: string,
  autopilot: boolean,
): Promise<void> {
  await db
    .insertInto('conversation_sessions')
    .values({ market_id: 'jm', user_id: userId, autopilot })
    .onConflict((oc) => oc.columns(['market_id', 'user_id']).doUpdateSet({ autopilot }))
    .execute();
}

async function postgresReachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: databaseUrl(), connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const reachable = await postgresReachable();
if (!reachable) console.warn('⚠ Academy tests SKIPPED: Postgres unreachable.');

const DAY1 = new Date('2026-07-10T21:00:00Z');
const DAY2 = new Date('2026-07-11T21:00:00Z');

describe.runIf(reachable)('Academy — sign-up, daily reminders, consent-gated marketing', () => {
  const db = createDb(databaseUrl());
  const academy = academyService(db, 'jm');
  const userIds: string[] = [];

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    // Three learners: 0 opts into marketing, 1 opts in, 2 declines.
    for (let i = 0; i < 3; i++) {
      const { userId } = await academy.signUp({
        name: `Learner ${i}`,
        phone: `+1876590000${i}`,
        email: `learner${i}@example.com`,
        course: 'patois for business',
        marketingOptIn: i <= 1,
      });
      userIds.push(userId);
    }
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('sign-up captures name, phone AND email; bad input is refused', async () => {
    const user = await db
      .selectFrom('users')
      .where('id', '=', userIds[0]!)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(user.display_name).toBe('Learner 0');
    expect(user.phone).toBe('+18765900000');
    expect(user.email).toBe('learner0@example.com');
    expect(user.marketing_opt_in).toBe(true);

    await expect(
      academy.signUp({ name: '', phone: 'not-a-phone', email: 'nope', course: 'x' }),
    ).rejects.toThrow(); // zod refuses all three at the door

    // Same phone twice = same person, enrollment updated, no duplicate.
    // Consent is NEVER inherited: re-signing up without ticking the box
    // revokes it, because silence must always mean "no".
    const again = await academy.signUp({
      name: 'Learner 0',
      phone: '+18765900000',
      email: 'learner0@example.com',
      course: 'spanish',
    });
    expect(again.userId).toBe(userIds[0]);
    expect(again.enrollment.course).toBe('spanish');
    const afterResignup = await db
      .selectFrom('users')
      .where('id', '=', userIds[0]!)
      .select('marketing_opt_in')
      .executeTakeFirstOrThrow();
    expect(afterResignup.marketing_opt_in).toBe(false);

    // They tick the box on a later visit — consent granted deliberately.
    await academy.signUp({
      name: 'Learner 0',
      phone: '+18765900000',
      email: 'learner0@example.com',
      course: 'spanish',
      marketingOptIn: true,
    });
  });

  it('daily reminders: one per learner per day, skipped for studiers and STOPped users', async () => {
    // Learner 2 studied today; learner 1 said STOP.
    await academy.recordStudySession(userIds[2]!, DAY1);
    await setAutopilot(db, userIds[1]!, false);

    const first = await academy.reminderTick(DAY1);
    expect(first.sent).toBe(1); // only learner 0 is due

    // Same day, tick runs again (the worker fires every few seconds).
    const rerun = await academy.reminderTick(DAY1);
    expect(rerun.sent).toBe(0); // idempotent per day — no double nag

    const reminders = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'academy.reminder')
      .selectAll()
      .execute();
    expect(reminders).toHaveLength(1);
    expect(JSON.stringify(reminders[0]!.payload)).toContain('Learner 0');

    // Next day: learner 0 is due again; learner 2's study lapsed → due too.
    await setAutopilot(db, userIds[1]!, true); // RESUME
    const nextDay = await academy.reminderTick(DAY2);
    expect(nextDay.sent).toBe(3);
  });

  it('marketing: consent-gated, exactly once per campaign, always with a way out', async () => {
    const launch = await academy.marketingBroadcast({
      campaignId: 'july-sale',
      text: 'New course bundle: 3 skills for the price of 2 this week.',
    });
    expect(launch.sent).toBe(2); // learners 0 and 1 opted in; learner 2 NEVER hears from us
    expect(launch.skipped).toBe(0);

    // The campaign re-runs (retry, cron double-fire) — nobody gets it twice.
    const rerun = await academy.marketingBroadcast({
      campaignId: 'july-sale',
      text: 'New course bundle: 3 skills for the price of 2 this week.',
    });
    expect(rerun.sent).toBe(0);
    expect(rerun.skipped).toBe(2);

    const sends = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'academy.marketing')
      .selectAll()
      .execute();
    expect(sends).toHaveLength(2);
    for (const s of sends) {
      expect(JSON.stringify(s.payload)).toContain('Reply STOP to opt out');
    }

    // Consent is revocable: learner 1 opts out, next campaign excludes them.
    await academy.optOutMarketing(userIds[1]!);
    const august = await academy.marketingBroadcast({
      campaignId: 'august-push',
      text: 'Back-to-school specials.',
    });
    expect(august.sent).toBe(1); // only learner 0 remains opted in
  });
});
