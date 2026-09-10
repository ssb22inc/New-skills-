/**
 * The seller readiness gate (P7): profile → catalog → capacity →
 * first-3-orders → Verified. Suspension is ORTHOGONAL to progress: a
 * suspended seller loses the Verified surface but keeps every bit of
 * progress and data, and reinstatement restores exactly where they were.
 */

export const READINESS_STEPS = [
  'profile',
  'catalog',
  'capacity',
  'first_orders',
  'verified',
] as const;
export type Readiness = (typeof READINESS_STEPS)[number];

export type Standing = 'active' | 'suspended';

export type ReadinessEvent =
  | 'profile_completed'
  | 'catalog_added'
  | 'capacity_configured'
  | 'order_completed'
  | 'suspended'
  | 'reinstated';

export interface SellerState {
  readiness: Readiness;
  standing: Standing;
  /** Counts toward the first-3-orders step only. */
  completedOrders: number;
}

export class InvalidTransitionError extends Error {
  constructor(state: SellerState, event: ReadinessEvent) {
    super(
      `invalid transition: event "${event}" in readiness "${state.readiness}" ` +
        `(standing "${state.standing}")`,
    );
    this.name = 'InvalidTransitionError';
  }
}

export const ORDERS_REQUIRED_FOR_VERIFIED = 3;

export function transition(state: SellerState, event: ReadinessEvent): SellerState {
  // Standing events are valid in any readiness state.
  if (event === 'suspended') {
    if (state.standing === 'suspended') throw new InvalidTransitionError(state, event);
    return { ...state, standing: 'suspended' };
  }
  if (event === 'reinstated') {
    if (state.standing !== 'suspended') throw new InvalidTransitionError(state, event);
    return { ...state, standing: 'active' };
  }
  // Progress is frozen while suspended.
  if (state.standing === 'suspended') throw new InvalidTransitionError(state, event);

  switch (event) {
    case 'profile_completed':
      if (state.readiness !== 'profile') throw new InvalidTransitionError(state, event);
      return { ...state, readiness: 'catalog' };
    case 'catalog_added':
      if (state.readiness !== 'catalog') throw new InvalidTransitionError(state, event);
      return { ...state, readiness: 'capacity' };
    case 'capacity_configured':
      if (state.readiness !== 'capacity') throw new InvalidTransitionError(state, event);
      return { ...state, readiness: 'first_orders' };
    case 'order_completed': {
      // Orders complete in any post-capacity state (verified sellers keep
      // completing orders); they only ADVANCE readiness in first_orders.
      if (state.readiness === 'profile' || state.readiness === 'catalog') {
        throw new InvalidTransitionError(state, event);
      }
      const completedOrders = state.completedOrders + 1;
      if (state.readiness === 'first_orders' && completedOrders >= ORDERS_REQUIRED_FOR_VERIFIED) {
        return { ...state, completedOrders, readiness: 'verified' };
      }
      return { ...state, completedOrders };
    }
  }
}

/** The only question surfaces may ask: does this seller get Verified UI? */
export function hasVerifiedSurface(state: SellerState): boolean {
  return state.readiness === 'verified' && state.standing === 'active';
}

export function initialSellerState(): SellerState {
  return { readiness: 'profile', standing: 'active', completedOrders: 0 };
}
