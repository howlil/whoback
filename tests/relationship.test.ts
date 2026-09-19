import { describe, expect, it } from 'vitest';
import { analyzeSnapshot, diffSnapshots, normalizeUsername } from '../src/domain/relationship';

describe('relationship engine', () => {
  it('normalizes usernames', () => {
    expect(normalizeUsername(' @HowLil ')).toBe('howlil');
  });

  it('computes mutual and one-way relationships', () => {
    const result = analyzeSnapshot({ capturedAt: 1, followers: ['alice', 'bob', '@Carol'], following: ['alice', 'dave', 'CAROL'] });
    expect(result.mutual).toEqual(['alice', 'carol']);
    expect(result.notFollowingBack).toEqual(['dave']);
    expect(result.youDontFollowBack).toEqual(['bob']);
  });

  it('computes changes between snapshots', () => {
    const previous = { capturedAt: 1, followers: ['alice', 'bob'], following: ['alice', 'charlie'] };
    const current = { capturedAt: 2, followers: ['alice', 'dora'], following: ['alice', 'eve'] };
    expect(diffSnapshots(previous, current)).toEqual({ newFollowers: ['dora'], unfollowers: ['bob'], newFollowing: ['eve'], youUnfollowed: ['charlie'] });
  });
});
