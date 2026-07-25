/**
 * THE CONSTITUTION, AS TESTS.
 *
 * CLAUDE.md lists seven non-negotiable product laws. Four had enforcing
 * tests scattered across the suite; laws 5 (in one respect), 6 and 7 had
 * none, and a law with no test is a preference. This file closes that,
 * and the map at the bottom of BUILD_STATUS.md points at each one.
 *
 * These are structural proofs about the codebase — cheap, fast, and they
 * fail the moment somebody writes the code that breaks the promise.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEDGER_ACCOUNTS } from '@sycamore/core';

const repo = new URL('../../../', import.meta.url).pathname;
const CORE_SRC = join(repo, 'core/src');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Comments may discuss anything; code may not depend on it. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const productionFiles = tsFiles(CORE_SRC).filter((f) => !f.includes('.test.'));

describe('Constitution §5 — trust is never traded', () => {
  it('NO code path anywhere deletes or hides a genuine review', () => {
    // The audit could confirm this only by grepping. Now it is a law:
    // reviews may be HELD for verification (an honest, visible state)
    // and may be REVISED by their author, but nothing may erase one.
    const offenders: string[] = [];
    for (const file of productionFiles) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      // Any delete targeting the reviews table.
      if (/deleteFrom\(\s*['"]reviews['"]\s*\)/.test(code)) {
        offenders.push(`${file.replace(repo, '')}: deletes from reviews`);
      }
      if (/deleteFrom\(\s*['"]review_revisions['"]\s*\)/.test(code)) {
        offenders.push(`${file.replace(repo, '')}: deletes review history`);
      }
      // A "hidden"/"suppressed"/"removed" status would do the same job
      // quietly. The only statuses a review may hold are published/held.
      if (/status:\s*['"](hidden|suppressed|removed|deleted)['"]/.test(code)) {
        offenders.push(`${file.replace(repo, '')}: hides a review by status`);
      }
    }
    expect(
      offenders,
      `A review-suppression path exists:\n${offenders.join('\n')}\n` +
        `Sycamore does not remove genuine reviews. Ever. (Constitution §5)`,
    ).toEqual([]);
  });

  it('sellers never touch an ad account — the platform is agency of record', () => {
    // A seller-supplied credential reaching an ad adapter is the failure
    // mode this forbids: sellers hand over money decisions, never keys.
    const adapters = tsFiles(join(repo, 'adapters/src/ads')).filter((f) => !f.includes('.test.'));
    for (const file of adapters) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      expect(
        /sellerToken|sellerCredential|sellerAccessToken|sellerAdAccount/i.test(code),
        `${file.replace(repo, '')} takes a seller credential — sellers must never hold ad keys`,
      ).toBe(false);
    }
    // And the co-op path charges the PLATFORM's ledger, not a seller's card.
    const coop = codeOnly(readFileSync(join(CORE_SRC, 'pulse/coop.ts'), 'utf8'));
    expect(coop).toContain('ledger');
  });
});

describe('Constitution §6 — hold the trust, never hold the float', () => {
  it('the chart of accounts models custody, not a Sycamore bank balance', () => {
    // Money in flight sits in buyer_escrow (owed to a buyer until the
    // job is done) or seller_payable (owed to a seller). Sycamore's own
    // money is fee revenue only. There is deliberately no
    // "sycamore_cash"/"float"/"house" account to accumulate in.
    expect(LEDGER_ACCOUNTS).toContain('buyer_escrow');
    expect(LEDGER_ACCOUNTS).toContain('seller_payable');
    for (const forbidden of ['sycamore_cash', 'float', 'house', 'treasury', 'company_balance']) {
      expect(
        LEDGER_ACCOUNTS as readonly string[],
        `"${forbidden}" would be a float account — licensed partners custody money, not us`,
      ).not.toContain(forbidden);
    }
  });

  it('core never moves money itself — every rail is behind an adapter port', () => {
    // Holding the float starts with core learning to talk to a bank.
    // It cannot: no payment vendor SDK may be imported in core.
    const offenders: string[] = [];
    const VENDOR_SDKS = /from\s+['"](stripe|plaid|dwolla|wise|paypal|square|braintree)/i;
    for (const file of productionFiles) {
      if (VENDOR_SDKS.test(codeOnly(readFileSync(file, 'utf8')))) {
        offenders.push(file.replace(repo, ''));
      }
    }
    expect(
      offenders,
      `core imports a money vendor directly:\n${offenders.join('\n')}\n` +
        `Licensed partners custody money; core owns split logic and the ledger.`,
    ).toEqual([]);
  });
});

describe('Constitution §7 — boring by default', () => {
  it('every declared dependency is actually imported by source', () => {
    // The audit found @opentelemetry/api declared in the gateway and
    // imported nowhere: a moving part with no justification, which is
    // exactly what this law forbids. An unused dependency is either a
    // job someone forgot to finish or one they should not have started.
    const workspaces = ['core', 'packs', 'design', 'adapters', 'apps/gateway', 'apps/worker'];
    const unused: string[] = [];
    for (const ws of workspaces) {
      const pkg = JSON.parse(readFileSync(join(repo, ws, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      const sources = tsFiles(join(repo, ws, 'src')).map((f) => readFileSync(f, 'utf8'));
      for (const dep of Object.keys(pkg.dependencies ?? {})) {
        const imported = sources.some((s) => s.includes(`'${dep}`) || s.includes(`"${dep}`));
        if (!imported) unused.push(`${ws}: ${dep}`);
      }
    }
    expect(
      unused,
      `Declared but never imported:\n${unused.join('\n')}\n` +
        `Justify it in one sentence and use it, or drop it (Constitution §7).`,
    ).toEqual([]);
  });
});
