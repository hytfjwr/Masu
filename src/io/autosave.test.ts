import { describe, it, expect } from 'vite-plus/test';
import { isAutosaveAvailable } from './autosave';

describe('isAutosaveAvailable', () => {
  it('returns false in the node test environment (no IndexedDB)', () => {
    expect(isAutosaveAvailable()).toBe(false);
  });
});
