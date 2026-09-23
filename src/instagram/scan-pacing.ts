export interface ScanPacingPolicy {
  burstSize: number;
  regularMinMs: number;
  regularMaxMs: number;
  burstMinMs: number;
  burstMaxMs: number;
}

export const DEFAULT_SCAN_PACING_POLICY: Readonly<ScanPacingPolicy> = {
  burstSize: 8,
  regularMinMs: 1_200,
  regularMaxMs: 1_800,
  burstMinMs: 9_000,
  burstMaxMs: 12_000,
};

export interface ScanPacingWait {
  requestNumber: number;
  plannedMs: number;
  actualMs: number;
}

export interface ScanPacer {
  waitForRequest(): Promise<ScanPacingWait>;
}

interface ScanPacingDependencies {
  now: () => number;
  random: () => number;
  sleep: (ms: number) => Promise<void>;
}

const defaultDependencies: ScanPacingDependencies = {
  now: () => Date.now(),
  random: () => Math.random(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function sampleBetween(
  min: number,
  max: number,
  random: number,
): number {
  const normalized = Math.min(0.999_999, Math.max(0, random));
  return min + Math.floor(normalized * (max - min + 1));
}

export function createScanPacer(
  initialRequestCount = 0,
  policy: ScanPacingPolicy = DEFAULT_SCAN_PACING_POLICY,
  dependencies: Partial<ScanPacingDependencies> = {},
): ScanPacer {
  const deps = { ...defaultDependencies, ...dependencies };
  let requestNumber = Math.max(0, initialRequestCount);
  let lastRequestStartedAt = deps.now();
  let queue = Promise.resolve();

  return {
    async waitForRequest(): Promise<ScanPacingWait> {
      let release!: () => void;
      const previous = queue;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });

      await previous;

      const nextRequestNumber = requestNumber + 1;
      const isBurstBoundary = nextRequestNumber % policy.burstSize === 0;
      const plannedGap = isBurstBoundary
        ? sampleBetween(policy.burstMinMs, policy.burstMaxMs, deps.random())
        : nextRequestNumber === 1 && requestNumber === 0
          ? 0
          : sampleBetween(policy.regularMinMs, policy.regularMaxMs, deps.random());
      const availableAt = lastRequestStartedAt + plannedGap;
      const waitStartedAt = deps.now();
      const plannedMs = Math.max(0, availableAt - waitStartedAt);

      if (plannedMs > 0) await deps.sleep(plannedMs);

      const actualMs = Math.max(0, deps.now() - waitStartedAt);
      requestNumber = nextRequestNumber;
      lastRequestStartedAt = deps.now();
      release();

      return {
        requestNumber,
        plannedMs,
        actualMs,
      };
    },
  };
}
