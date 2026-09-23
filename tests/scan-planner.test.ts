import { describe, expect, it } from 'vitest';
import { planRelationshipScan } from '../src/instagram/scan-planner';

describe('scan planner', () => {
  it('avoids downloading a million followers when verifying following is cheaper', () => {
    const plan = planRelationshipScan({
      followersTotal: 1_000_000,
      loadedFollowers: 0,
      unresolvedFollowing: 1_000,
    });

    expect(plan.strategy).toBe('verify-following');
    expect(plan.estimatedFollowerPageRequests).toBe(41_667);
    expect(plan.estimatedRelationshipRequests).toBe(1_000);
  });

  it('uses full follower pagination when it costs fewer requests', () => {
    const plan = planRelationshipScan({
      followersTotal: 500,
      loadedFollowers: 0,
      unresolvedFollowing: 2_000,
    });

    expect(plan.strategy).toBe('full-lists');
    expect(plan.estimatedFollowerPageRequests).toBe(21);
  });

  it('uses the observed follower page size after the first page', () => {
    const plan = planRelationshipScan({
      followersTotal: 500,
      loadedFollowers: 0,
      unresolvedFollowing: 10,
      observedFollowerPageSize: 100,
    });

    expect(plan.strategy).toBe('full-lists');
    expect(plan.estimatedFollowerPageRequests).toBe(5);
  });

  it('preserves full-list behavior when follower count is unknown', () => {
    const plan = planRelationshipScan({
      followersTotal: null,
      loadedFollowers: 0,
      unresolvedFollowing: 100,
    });

    expect(plan.strategy).toBe('full-lists');
    expect(plan.estimatedFollowerPageRequests).toBeNull();
  });
});
