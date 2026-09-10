import { describe, expect, it } from 'vitest';
import { WORKSPACE } from './index.js';

describe('@sycamore/adapters', () => {
  it('is wired into the toolchain', () => {
    expect(WORKSPACE).toBe('@sycamore/adapters');
  });
});
