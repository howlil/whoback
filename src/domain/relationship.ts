import type { RelationshipAnalysis, RelationshipChanges, RelationshipSnapshot } from './types';

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizeUsername).filter(Boolean))].sort();
}

export function analyzeSnapshot(snapshot: RelationshipSnapshot): RelationshipAnalysis {
  const following = unique(snapshot.following);
  const coverage = snapshot.coverage ?? 'full';

  if (coverage === 'following-only' && snapshot.followBack) {
    const mutual = following.filter((username) => snapshot.followBack?.[username] === true);
    const notFollowingBack = following.filter((username) => snapshot.followBack?.[username] === false);

    return {
      followersCount: snapshot.followersTotal ?? mutual.length,
      followingCount: snapshot.followingTotal ?? following.length,
      mutual,
      notFollowingBack,
      youDontFollowBack: [],
      followersComplete: false,
    };
  }

  const followers = unique(snapshot.followers);
  const followerSet = new Set(followers);
  const followingSet = new Set(following);

  return {
    followersCount: snapshot.followersTotal ?? followers.length,
    followingCount: snapshot.followingTotal ?? following.length,
    mutual: following.filter((username) => followerSet.has(username)),
    notFollowingBack: following.filter((username) => !followerSet.has(username)),
    youDontFollowBack: followers.filter((username) => !followingSet.has(username)),
    followersComplete: true,
  };
}

export function diffSnapshots(previous: RelationshipSnapshot | undefined, current: RelationshipSnapshot): RelationshipChanges {
  if (!previous) {
    return {
      newFollowers: [],
      unfollowers: [],
      newFollowing: [],
      youUnfollowed: [],
      followersComplete: false,
    };
  }

  const previousFollowing = new Set(unique(previous.following));
  const currentFollowing = new Set(unique(current.following));
  const followersComplete = (previous.coverage ?? 'full') === 'full'
    && (current.coverage ?? 'full') === 'full';

  if (!followersComplete) {
    return {
      newFollowers: [],
      unfollowers: [],
      newFollowing: [...currentFollowing].filter((username) => !previousFollowing.has(username)).sort(),
      youUnfollowed: [...previousFollowing].filter((username) => !currentFollowing.has(username)).sort(),
      followersComplete: false,
    };
  }

  const previousFollowers = new Set(unique(previous.followers));
  const currentFollowers = new Set(unique(current.followers));

  return {
    newFollowers: [...currentFollowers].filter((username) => !previousFollowers.has(username)).sort(),
    unfollowers: [...previousFollowers].filter((username) => !currentFollowers.has(username)).sort(),
    newFollowing: [...currentFollowing].filter((username) => !previousFollowing.has(username)).sort(),
    youUnfollowed: [...previousFollowing].filter((username) => !currentFollowing.has(username)).sort(),
    followersComplete: true,
  };
}
