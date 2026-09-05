import { describe, expect, it } from 'vitest';
import {
  hasVerifiedSurface,
  initialSellerState,
  InvalidTransitionError,
  READINESS_STEPS,
  transition,
  type ReadinessEvent,
  type SellerState,
} from './readiness.js';

const EVENTS: ReadinessEvent[] = [
  'profile_completed',
  'catalog_added',
  'capacity_configured',
  'order_completed',
  'suspended',
  'reinstated',
];

function at(
  readiness: SellerState['readiness'],
  overrides: Partial<SellerState> = {},
): SellerState {
  return { readiness, standing: 'active', completedOrders: 0, ...overrides };
}

describe('P7 — readiness state machine (gate: every transition covered)', () => {
  it('walks the happy path: profile → catalog → capacity → 3 orders → Verified', () => {
    let s = initialSellerState();
    expect(hasVerifiedSurface(s)).toBe(false);
    s = transition(s, 'profile_completed');
    expect(s.readiness).toBe('catalog');
    s = transition(s, 'catalog_added');
    expect(s.readiness).toBe('capacity');
    s = transition(s, 'capacity_configured');
    expect(s.readiness).toBe('first_orders');
    s = transition(s, 'order_completed');
    s = transition(s, 'order_completed');
    expect(s.readiness).toBe('first_orders'); // two is not three
    s = transition(s, 'order_completed');
    expect(s.readiness).toBe('verified');
    expect(s.completedOrders).toBe(3);
    expect(hasVerifiedSurface(s)).toBe(true);
  });

  it('exhaustive matrix: every state × event is either a defined move or a typed error', () => {
    for (const readiness of READINESS_STEPS) {
      for (const standing of ['active', 'suspended'] as const) {
        for (const event of EVENTS) {
          const state = at(readiness, { standing });
          const attempt = () => transition(state, event);
          const legal =
            (event === 'suspended' && standing === 'active') ||
            (event === 'reinstated' && standing === 'suspended') ||
            (standing === 'active' &&
              ((event === 'profile_completed' && readiness === 'profile') ||
                (event === 'catalog_added' && readiness === 'catalog') ||
                (event === 'capacity_configured' && readiness === 'capacity') ||
                (event === 'order_completed' &&
                  readiness !== 'profile' &&
                  readiness !== 'catalog')));
          if (legal) {
            expect(attempt, `${readiness}/${standing} + ${event}`).not.toThrow();
          } else {
            expect(attempt, `${readiness}/${standing} + ${event}`).toThrowError(
              InvalidTransitionError,
            );
          }
        }
      }
    }
  });

  it('GATE regression: suspension strips the Verified surface but keeps ALL data', () => {
    let s = at('verified', { completedOrders: 41 });
    expect(hasVerifiedSurface(s)).toBe(true);

    s = transition(s, 'suspended');
    expect(hasVerifiedSurface(s)).toBe(false); // surface gone
    expect(s.readiness).toBe('verified'); // progress kept
    expect(s.completedOrders).toBe(41); // data kept

    // Progress is frozen while suspended.
    expect(() => transition(s, 'order_completed')).toThrowError(InvalidTransitionError);

    s = transition(s, 'reinstated');
    expect(hasVerifiedSurface(s)).toBe(true); // restored exactly
    expect(s.completedOrders).toBe(41);
  });

  it('suspension mid-progress freezes and reinstates at the same step', () => {
    let s = at('capacity');
    s = transition(s, 'suspended');
    expect(() => transition(s, 'capacity_configured')).toThrowError(InvalidTransitionError);
    s = transition(s, 'reinstated');
    s = transition(s, 'capacity_configured');
    expect(s.readiness).toBe('first_orders');
  });

  it('verified sellers keep completing orders without state change', () => {
    let s = at('verified', { completedOrders: 3 });
    s = transition(s, 'order_completed');
    expect(s.readiness).toBe('verified');
    expect(s.completedOrders).toBe(4);
  });

  it('double suspension and stray reinstatement are invalid', () => {
    const suspended = at('catalog', { standing: 'suspended' });
    expect(() => transition(suspended, 'suspended')).toThrowError(InvalidTransitionError);
    expect(() => transition(at('catalog'), 'reinstated')).toThrowError(InvalidTransitionError);
  });
});
