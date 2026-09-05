import { describe, expect, it } from 'vitest';
import { loadContextPack, loadVerticalPack, parseContextPack, PackLoadError } from './loader.js';
import { formatAmount, unitLabel } from './format.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const jmYaml = readFileSync(fileURLToPath(new URL('../context/jm.yaml', import.meta.url)), 'utf8');

describe('P3 — pack loaders (gate)', () => {
  describe('valid packs load as typed objects', () => {
    it('loads the jm context pack with the required blocks', () => {
      const jm = loadContextPack('jm');
      expect(jm.currency.code).toBe('JMD');
      expect(jm.currency.symbol).toBe('J$');
      expect(jm.language.dialect).toBe('patois');
      expect(jm.compliance.data_protection.law).toBe('Jamaica Data Protection Act 2020');
      expect(jm.compliance.data_protection.dpa_signature_required).toBe(true);
      expect(jm.tax.gct_registration_threshold.amount_minor).toBe(1_000_000_000);
      expect(jm.payments.providers.map((p) => p.id)).toEqual(['lynk', 'cardnet']);

      const holidayNames = jm.calendar.holidays.map((h) => h.name).join(' ');
      expect(holidayNames).toContain('Carnival');
      expect(holidayNames).toContain('Easter');
      expect(holidayNames).toContain('Christmas');
    });

    it('loads the food and tours vertical packs', () => {
      const food = loadVerticalPack('food');
      const tours = loadVerticalPack('tours');
      expect(food.capacity.unit_singular).toBe('plate');
      expect(food.capacity.time_granularity_minutes).toBe(30);
      expect(food.booking.deposit_default_bps).toBe(0);
      expect(tours.capacity.unit_singular).toBe('seat');
      expect(tours.capacity.time_granularity_minutes).toBe(60);
      expect(tours.booking.deposit_default_bps).toBe(2000);
      expect(tours.booking.completion_proof).toContain('geo_checkin');
      expect(food.mentor.review_heuristics.map((h) => h.signal)).toContain('temperature');
    });
  });

  describe('invalid packs fail load with a human-readable error', () => {
    it('a missing field names the exact path — no silent default', () => {
      const withoutSymbol = jmYaml.replace(/^\s*symbol: J\$\n/m, '');
      let error: unknown;
      try {
        parseContextPack(withoutSymbol, 'jm-without-symbol');
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(PackLoadError);
      expect((error as Error).message).toContain('currency.symbol');
    });

    it('an unknown key is a load error, not ignored', () => {
      const withTypo = jmYaml.replace('timezone:', 'timzone_oops: x\ntimezone:');
      expect(() => parseContextPack(withTypo, 'jm-with-typo')).toThrowError(PackLoadError);
    });

    it('broken YAML syntax reports plainly', () => {
      expect(() => parseContextPack('currency: [unclosed', 'broken')).toThrowError(
        /not valid YAML/,
      );
    });

    it('a holiday with both date and rule is rejected', () => {
      const both = jmYaml.replace(
        /- name: Christmas Day\n {6}date: 12-25/,
        '- name: Christmas Day\n      date: 12-25\n      rule: fixed',
      );
      expect(() => parseContextPack(both, 'jm-holiday-both')).toThrowError(
        /exactly one of "date" or "rule"/,
      );
    });

    it('a missing pack file is a load error', () => {
      expect(() => loadContextPack('zz')).toThrowError(PackLoadError);
    });
  });

  describe('pack fields drive behavior — zero hardcoded fallbacks', () => {
    it('currency rendering comes from the pack, not from code', () => {
      const jm = loadContextPack('jm');
      expect(formatAmount(jm, 125_000)).toBe('J$1,250.00');

      // A different market's pack produces a different symbol with the SAME code path.
      const doLike = parseContextPack(
        jmYaml
          .replace('market_id: jm', 'market_id: do')
          .replace('symbol: J$', 'symbol: RD$')
          .replace('code: JMD', 'code: DOP'),
        'do-fixture',
      );
      expect(formatAmount(doLike, 125_000)).toBe('RD$1,250.00');
    });

    it('unit names come from the vertical pack, not from code', () => {
      const food = loadVerticalPack('food');
      const tours = loadVerticalPack('tours');
      expect(unitLabel(food, 1)).toBe('1 plate');
      expect(unitLabel(food, 12)).toBe('12 plates');
      expect(unitLabel(tours, 12)).toBe('12 seats');
    });

    it('money helpers refuse non-integer minor units', () => {
      const jm = loadContextPack('jm');
      expect(() => formatAmount(jm, 12.5)).toThrowError(/integer minor units/);
    });
  });
});
