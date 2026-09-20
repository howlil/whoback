import { describe, expect, it } from 'vitest';
import { analyzeSnapshot, diffSnapshots, normalizeUsername } from '../src/domain/relationship';

describe('relationship engine', () => {
  it('normalizes usernames', () => {
    expect(normalizeUsername(' @HowLil ')).toBe('howlil');
  });

  it('computes mutual and one-way relationships from a full snapshot', () => {
    const result = analyzeSnapshot({
      capturedAt: 1,
      followers: ['alice', 'bob', '@Carol'],
      following: ['alice', 'dave', 'CAROL'],
    });

    expect(result.mutual).toEqual(['alice', 'carol']);
    expect(result.notFollowingBack).toEqual(['dave']);
    expect(result.youDontFollowBack).toEqual(['bob']);
    expect(result.followersComplete).toBe(true);
  });

  it('computes exact not-back results without downloading the full follower list', () => {
    const result = analyzeSnapshot({
      capturedAt: 1,
      coverage: 'following-only',
      followers: [],
      following: ['alice', 'bob', 'carol'],
      followersTotal: 1_000_000,
      followingTotal: 3,
      followBack: {
        alice: true,
        bob: false,
        carol: true,
      },
    });

    expect(result.followersCount).toBe(1_000_000);
    expect(result.mutual).toEqual(['alice', 'carol']);
    expect(result.notFollowingBack).toEqual(['bob']);
    expect(result.youDontFollowBack).toEqual([]);
    expect(result.followersComplete).toBe(false);
  });

  it('does not invent follower-history changes from partial snapshots', () => {
    const previous = {
      capturedAt: 1,
      followers: ['alice', 'bob'],
      following: ['alice', 'charlie'],
    };
    const current = {
      capturedAt: 2,
      coverage: 'following-only' as const,
      followers: [],
      following: ['alice', 'eve'],
      followBack: { alice: true, eve: false },
    };

    expect(diffSnapshots(previous, current)).toEqual({
      newFollowers: [],
      unfollowers: [],
      newFollowing: ['eve'],
      youUnfollowed: ['charlie'],
      followersComplete: false,
    });
  });

  it('computes follower changes when both snapshots are full', () => {
    const previous = { capturedAt: 1, followers: ['alice', 'bob'], following: ['alice', 'charlie'] };
    const current = { capturedAt: 2, followers: ['alice', 'dora'], following: ['alice', 'eve'] };

    expect(diffSnapshots(previous, current)).toEqual({
      newFollowers: ['dora'],
      unfollowers: ['bob'],
      newFollowing: ['eve'],
      youUnfollowed: ['charlie'],
      followersComplete: true,
    });
  });
});
