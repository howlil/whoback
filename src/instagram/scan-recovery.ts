export const FOLLOWING_COUNT_DRIFT_TOLERANCE = 2;

export type FollowingCountRecovery =
  | { action: 'continue'; gap: number }
  | { action: 'retry'; gap: number };

export function planFollowingCountRecovery(
  observed: number,
  reported: number | null | undefined,
  retryCount = 0,
): FollowingCountRecovery {
  if (reported == null || reported <= observed) {
    return { action: 'continue', gap: 0 };
  }

  const gap = reported - observed;

  if (gap <= FOLLOWING_COUNT_DRIFT_TOLERANCE) {
    return { action: 'continue', gap };
  }

  if (retryCount < 1) {
    return { action: 'retry', gap };
  }

  return { action: 'continue', gap };
}
