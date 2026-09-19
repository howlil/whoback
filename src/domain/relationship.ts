import type { RelationshipAnalysis, RelationshipChanges, RelationshipSnapshot } from './types';

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizeUsername).filter(Boolean))].sort();
}

export function analyzeSnapshot(snapshot: RelationshipSnapshot): RelationshipAnalysis {
  const followers = unique(snapshot.followers);
  const following = unique(snapshot.following);
  const followerSet = new Set(followers);
  const followingSet = new Set(following);

  return {
    followersCount: followers.length,
    followingCount: following.length,
    mutual: following.filter((username) => followerSet.has(username)),
    notFollowingBack: following.filter((username) => !followerSet.has(username)),
    youDontFollowBack: followers.filter((username) => !followingSet.has(username)),
  };
}

export function diffSnapshots(previous: RelationshipSnapshot | undefined, current: RelationshipSnapshot): RelationshipChanges {
  if (!previous) {
    return { newFollowers: [], unfollowers: [], newFollowing: [], youUnfollowed: [] };
  }

  const previousFollowers = new Set(unique(previous.followers));
  const currentFollowers = new Set(unique(current.followers));
  const previousFollowing = new Set(unique(previous.following));
  const currentFollowing = new Set(unique(current.following));

  return {
    newFollowers: [...currentFollowers].filter((username) => !previousFollowers.has(username)).sort(),
    unfollowers: [...previousFollowers].filter((username) => !currentFollowers.has(username)).sort(),
    newFollowing: [...currentFollowing].filter((username) => !previousFollowing.has(username)).sort(),
    youUnfollowed: [...previousFollowing].filter((username) => !currentFollowing.has(username)).sort(),
  };
}
