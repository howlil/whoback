import { describe, expect, it } from 'vitest';
import { planFollowingCountRecovery } from '../src/instagram/scan-recovery';

describe('following count recovery', () => {
  it('continues through small count drift instead of deadlocking', () => {
    expect(planFollowingCountRecovery(616, 617, 0)).toEqual({
      action: 'continue',
      gap: 1,
    });
  });

  it('retries a materially incomplete list once', () => {
    expect(planFollowingCountRecovery(600, 617, 0)).toEqual({
      action: 'retry',
      gap: 17,
    });
  });

  it('never loops forever after the reconciliation retry', () => {
    expect(planFollowingCountRecovery(600, 617, 1)).toEqual({
      action: 'continue',
      gap: 17,
    });
  });

  it('does not treat a stale lower reported count as incomplete', () => {
    expect(planFollowingCountRecovery(617, 616, 0)).toEqual({
      action: 'continue',
      gap: 0,
    });
  });
});
