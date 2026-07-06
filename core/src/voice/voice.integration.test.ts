import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadContextPack } from '@sycamore/packs';
import { createLlmRouter, mockAsr, mockProvider } from '@sycamore/adapters';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { applyGlossary, glossaryStore } from './glossary.js';
import { voicePipeline } from './pipeline.js';
import type { Intent } from '../conversations/intents.js';

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
if (!reachable) console.warn('⚠ P12 gate tests SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');

/**
 * The 20-sample patois voice-note fixture set: what a self-hosted Whisper
 * plausibly outputs (including characteristic mishears) + the intent the
 * SPEAKER meant. The gate is INTENT accuracy ≥90%, not word accuracy.
 */
const FIXTURES: { ref: string; asrOutput: string; expected: Intent }[] = [
  { ref: 'vn-01', asrOutput: 'mi waan book two seat fi satday cruise', expected: 'book' },
  { ref: 'vn-02', asrOutput: 'buk mi a table fi six people sunday', expected: 'book' }, // mishear: buk
  { ref: 'vn-03', asrOutput: 'reserve three plate a curry goat fi friday', expected: 'book' },
  { ref: 'vn-04', asrOutput: 'mi need fi cancel di ting mi book yesterday', expected: 'cancel' },
  { ref: 'vn-05', asrOutput: 'kyansel mi order please an thanks', expected: 'cancel' }, // mishear: kyansel
  {
    ref: 'vn-06',
    asrOutput: 'call off di booking fi tomorrow mi cyaan mek it',
    expected: 'cancel',
  },
  { ref: 'vn-07', asrOutput: 'can mi move di tour to next week instead', expected: 'reschedule' },
  { ref: 'vn-08', asrOutput: 'mi waan switch di time from two to four', expected: 'reschedule' },
  { ref: 'vn-09', asrOutput: 'change mi booking to sunday evening', expected: 'reschedule' },
  { ref: 'vn-10', asrOutput: 'any space lef pon di boat tomorrow', expected: 'stock' },
  { ref: 'vn-11', asrOutput: 'unnu have any room fi four more people', expected: 'stock' },
  {
    ref: 'vn-12',
    asrOutput: 'is how much seat still available fi di sunset run',
    expected: 'stock',
  },
  { ref: 'vn-13', asrOutput: 'ow much fi di snorkel trip fi two', expected: 'price' }, // mishear: ow much
  { ref: 'vn-14', asrOutput: 'wah di price fi di family package', expected: 'price' },
  { ref: 'vn-15', asrOutput: 'how much it cost fi book di whole boat', expected: 'price' },
  {
    ref: 'vn-16',
    asrOutput: 'di food did stone cold an di service slow bad',
    expected: 'complaint',
  },
  { ref: 'vn-17', asrOutput: 'mi vex! di captain rude to mi madda', expected: 'complaint' },
  {
    ref: 'vn-18',
    asrOutput: 'terrible experience man di boat late two hour',
    expected: 'complaint',
  },
  { ref: 'vn-19', asrOutput: 'blessings big up unnu self', expected: 'other' },
  { ref: 'vn-20', asrOutput: 'wah gwaan mi soon come back', expected: 'other' },
];

/**
 * A competent intent model, simulated deterministically: keyword
 * classification over the CORRECTED transcript. Real-model accuracy is a
 * staging measurement; the pipeline mechanics are what this gate pins.
 */
function classify(text: string): Intent {
  const t = text.toLowerCase();
  if (/\b(cancel|call off)\b/.test(t)) return 'cancel';
  if (/\b(move|switch|change)\b/.test(t)) return 'reschedule';
  if (/\b(how much|price|cost)\b/.test(t)) return 'price';
  if (/\b(space|room|available|lef pon)\b/.test(t)) return 'stock';
  if (/\b(book|reserve)\b/.test(t)) return 'book';
  if (/\b(cold|rude|late|terrible|vex|slow)\b/.test(t)) return 'complaint';
  return 'other';
}

function scriptedRouter() {
  const provider = mockProvider({
    id: 'classifier',
    reply: (req) => {
      // The user text sits between the data delimiters; classify only it.
      const match = /USER_MESSAGE_DATA\n([\s\S]*?)\nUSER_MESSAGE_DATA/.exec(req.prompt);
      return JSON.stringify({ intent: classify(match?.[1] ?? req.prompt) });
    },
  });
  return createLlmRouter([{ provider, dpaSigned: true }], {
    'routine-reply': { primary: 'classifier', fallbacks: [] },
    'intent-detection': { primary: 'classifier', fallbacks: [] },
    'money-math': { primary: 'classifier', fallbacks: [] },
    compliance: { primary: 'classifier', fallbacks: [] },
    creative: { primary: 'classifier', fallbacks: [] },
  });
}

describe.runIf(reachable)('P12 — voice pipeline (gate: ≥90% intent accuracy on 20 samples)', () => {
  const db = createDb(databaseUrl());
  const glossary = glossaryStore(db, 'jm');

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('glossary applies only founder-APPROVED corrections, word-boundary safe', async () => {
    await glossary.propose('buk', 'book');
    // Not approved yet → not applied.
    expect(applyGlossary('buk mi a seat', await glossary.approvedEntries())).toBe('buk mi a seat');
    await glossary.approve('buk');
    const entries = await glossary.approvedEntries();
    expect(applyGlossary('buk mi a seat', entries)).toBe('book mi a seat');
    // Word boundary: "rebuke" must not become "rebooke".
    expect(applyGlossary('no rebuke here', entries)).toBe('no rebuke here');
  });

  it('GATE: 20 patois voice notes → ≥90% intent accuracy (with corrections)', async () => {
    // The founder-approved patois glossary, accumulated from feedback.
    await glossary.propose('kyansel', 'cancel');
    await glossary.approve('kyansel');
    await glossary.propose('ow much', 'how much');
    await glossary.approve('ow much');
    // ('buk' → 'book' approved in the previous test.)

    const asr = mockAsr(Object.fromEntries(FIXTURES.map((f) => [f.ref, f.asrOutput])));
    const pipeline = voicePipeline({ asr, router: scriptedRouter(), pack: jm, glossary });

    let correct = 0;
    const misses: string[] = [];
    for (const fixture of FIXTURES) {
      const result = await pipeline.voiceNoteToIntent(fixture.ref);
      if (result.intent === fixture.expected) correct++;
      else misses.push(`${fixture.ref}: got ${result.intent}, wanted ${fixture.expected}`);
    }
    const accuracy = correct / FIXTURES.length;
    expect(FIXTURES).toHaveLength(20);
    expect(accuracy, `misses:\n${misses.join('\n')}`).toBeGreaterThanOrEqual(0.9);
  });

  it('corrections demonstrably matter: without the glossary, accuracy drops', async () => {
    const asr = mockAsr(Object.fromEntries(FIXTURES.map((f) => [f.ref, f.asrOutput])));
    const emptyGlossary = {
      ...glossaryStore(db, 'jm'),
      approvedEntries: () => Promise.resolve([]),
    };
    const pipeline = voicePipeline({
      asr,
      router: scriptedRouter(),
      pack: jm,
      glossary: emptyGlossary,
    });
    let correct = 0;
    for (const fixture of FIXTURES) {
      const result = await pipeline.voiceNoteToIntent(fixture.ref);
      if (result.intent === fixture.expected) correct++;
    }
    expect(correct / FIXTURES.length).toBeLessThan(0.9); // the store earns its keep
  });
});
