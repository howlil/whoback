import { describe, expect, it } from 'vitest';
import {
  createScanPacer,
  type ScanPacingPolicy,
} from '../src/instagram/scan-pacing';

const policy: ScanPacingPolicy = {
  burstSize: 3,
  regularMinMs: 100,
  regularMaxMs: 100,
  burstMinMs: 500,
  burstMaxMs: 500,
};

function clock() {
  let current = 0;
  return {
    now: () => current,
    sleep: async (ms: number) => {
      current += ms;
    },
  };
}

describe('scan pacing', () => {
  it('starts immediately, spaces normal requests, then applies a burst pause', async () => {
    const time = clock();
    const pacer = createScanPacer(0, policy, {
      now: time.now,
      sleep: time.sleep,
      random: () => 0,
    });

    await expect(pacer.waitForRequest()).resolves.toMatchObject({
      requestNumber: 1,
      plannedMs: 0,
      actualMs: 0,
    });
    await expect(pacer.waitForRequest()).resolves.toMatchObject({
      requestNumber: 2,
      plannedMs: 100,
      actualMs: 100,
    });
    await expect(pacer.waitForRequest()).resolves.toMatchObject({
      requestNumber: 3,
      plannedMs: 500,
      actualMs: 500,
    });
  });

  it('continues the request sequence when resuming a checkpoint', async () => {
    const time = clock();
    const pacer = createScanPacer(3, policy, {
      now: time.now,
      sleep: time.sleep,
      random: () => 0,
    });

    await expect(pacer.waitForRequest()).resolves.toMatchObject({
      requestNumber: 4,
      plannedMs: 100,
      actualMs: 100,
    });
  });

  it('serializes concurrent callers through the same pacing window', async () => {
    const time = clock();
    const pacer = createScanPacer(0, policy, {
      now: time.now,
      sleep: time.sleep,
      random: () => 0,
    });

    const waits = await Promise.all([
      pacer.waitForRequest(),
      pacer.waitForRequest(),
      pacer.waitForRequest(),
    ]);

    expect(waits.map((wait) => wait.requestNumber)).toEqual([1, 2, 3]);
    expect(waits.map((wait) => wait.plannedMs)).toEqual([0, 100, 500]);
  });
});
