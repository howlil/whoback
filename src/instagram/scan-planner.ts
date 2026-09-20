import type { ScanStrategy } from '../domain/types';

export const OBSERVED_FOLLOWER_PAGE_SIZE = 24;

export interface ScanCostInput {
  followersTotal: number | null | undefined;
  loadedFollowers: number;
  unresolvedFollowing: number;
  observedFollowerPageSize?: number;
}

export interface ScanPlan {
  strategy: ScanStrategy;
  estimatedFollowerPageRequests: number | null;
  estimatedRelationshipRequests: number;
}

export function planRelationshipScan(input: ScanCostInput): ScanPlan {
  const pageSize = Math.max(
    1,
    Math.floor(input.observedFollowerPageSize ?? OBSERVED_FOLLOWER_PAGE_SIZE),
  );
  const relationshipRequests = Math.max(0, input.unresolvedFollowing);

  if (input.followersTotal == null) {
    return {
      strategy: 'full-lists',
      estimatedFollowerPageRequests: null,
      estimatedRelationshipRequests: relationshipRequests,
    };
  }

  const remainingFollowers = Math.max(
    0,
    input.followersTotal - Math.max(0, input.loadedFollowers),
  );
  const followerPageRequests = Math.ceil(remainingFollowers / pageSize);

  return {
    strategy: relationshipRequests <= followerPageRequests
      ? 'verify-following'
      : 'full-lists',
    estimatedFollowerPageRequests: followerPageRequests,
    estimatedRelationshipRequests: relationshipRequests,
  };
}
