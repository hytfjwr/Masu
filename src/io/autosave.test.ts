import { describe, it, expect } from 'vitest';
import { isAutosaveAvailable } from './autosave';

describe('isAutosaveAvailable', () => {
  it('returns false in the node test environment (no IndexedDB)', () => {
    expect(isAutosaveAvailable()).toBe(false);
  });
});
