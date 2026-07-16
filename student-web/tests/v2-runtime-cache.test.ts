// tests/v2-runtime-cache.test.ts
//
// Unit tests for the synchronous restrict-only runtime cache gate.
// Covers: cold-cache fail-open, v2+kill-off → true, v1 → false, kill on → false.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedSnapshot,
  setCachedSnapshot,
  clearCachedSnapshot,
  isV2ActiveCached,
  _setCachedSnapshotForTest,
  _resetForTest
} from '../src/lib/v2-runtime-cache';

describe('v2-runtime-cache', () => {
  beforeEach(() => {
    _resetForTest();
  });

  it('is fail-open when the cache is cold (no snapshot)', () => {
    expect(isV2ActiveCached()).toBe(true);
    expect(getCachedSnapshot()).toBe(null);
  });

  it('returns true when activeMode=v2 and killSwitch off', () => {
    _setCachedSnapshotForTest({ activeMode: 'v2', killSwitch: false, source: 'db', ok: true });
    expect(isV2ActiveCached()).toBe(true);
  });

  it('returns false when activeMode=v1 (owner flipped to V1)', () => {
    _setCachedSnapshotForTest({ activeMode: 'v1', killSwitch: false, source: 'db', ok: true });
    expect(isV2ActiveCached()).toBe(false);
  });

  it('returns false when killSwitch is on (even if activeMode=v2)', () => {
    _setCachedSnapshotForTest({ activeMode: 'v2', killSwitch: true, source: 'db_kill_switch', ok: true });
    expect(isV2ActiveCached()).toBe(false);
  });

  it('clearCachedSnapshot resets to cold (fail-open)', () => {
    _setCachedSnapshotForTest({ activeMode: 'v1', killSwitch: false, source: 'db', ok: true });
    expect(isV2ActiveCached()).toBe(false);
    clearCachedSnapshot();
    expect(isV2ActiveCached()).toBe(true);
  });

  it('setCachedSnapshot respects TTL expiry (reverts to cold fail-open)', async () => {
    setCachedSnapshot({ activeMode: 'v1', killSwitch: false, source: 'db', ok: true }, 0);
    // TTL 0 → expired on next read
    await new Promise((r) => setTimeout(r, 5));
    expect(isV2ActiveCached()).toBe(true);
  });
});
