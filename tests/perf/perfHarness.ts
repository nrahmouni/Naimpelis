import { performance } from 'node:perf_hooks';

export interface LatencyStats {
  label: string;
  samples: number;
  totalMs: number;
  minMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  opsPerSec: number;
  heapDeltaMb: number;
}

export function getHeapUsedMb(): number {
  return Number((process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2));
}

export function computePercentileStats(
  label: string,
  durationsMs: number[],
  totalMs: number,
  heapDeltaMb = 0
): LatencyStats {
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const n = Math.max(1, sorted.length);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const idx = (p: number) => Math.min(n - 1, Math.max(0, Math.floor((n - 1) * p)));
  const round = (v: number) => Number(v.toFixed(4));

  return {
    label,
    samples: sorted.length,
    totalMs: Number(totalMs.toFixed(2)),
    minMs: round(sorted[0] ?? 0),
    meanMs: round(sum / n),
    p50Ms: round(sorted[idx(0.5)] ?? 0),
    p95Ms: round(sorted[idx(0.95)] ?? 0),
    p99Ms: round(sorted[idx(0.99)] ?? 0),
    maxMs: round(sorted[n - 1] ?? 0),
    opsPerSec: Math.round((sorted.length / Math.max(0.001, totalMs)) * 1000),
    heapDeltaMb: Number(heapDeltaMb.toFixed(2)),
  };
}

export function benchmarkSyncOps(
  label: string,
  iterations: number,
  fn: (i: number) => void,
  warmupIterations = Math.min(200, Math.max(20, Math.floor(iterations * 0.05)))
): LatencyStats {
  for (let w = 0; w < warmupIterations; w += 1) {
    fn(w);
  }
  const durations: number[] = new Array(iterations);
  const heapBefore = getHeapUsedMb();
  const totalStart = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    fn(i);
    durations[i] = performance.now() - t0;
  }

  const totalMs = performance.now() - totalStart;
  const heapDeltaMb = getHeapUsedMb() - heapBefore;
  const stats = computePercentileStats(label, durations, totalMs, heapDeltaMb);
  logPerfResult(stats);
  return stats;
}

export function benchmarkBatchThroughput(
  label: string,
  operationsCount: number,
  fn: () => void
): {
  label: string;
  operationsCount: number;
  totalMs: number;
  opsPerSec: number;
  heapDeltaMb: number;
} {
  const heapBefore = getHeapUsedMb();
  const t0 = performance.now();
  fn();
  const totalMs = Math.max(0.001, performance.now() - t0);
  const heapDeltaMb = Number((getHeapUsedMb() - heapBefore).toFixed(2));
  const opsPerSec = Math.round((operationsCount / totalMs) * 1000);
  const out = {
    label,
    operationsCount,
    totalMs: Number(totalMs.toFixed(2)),
    opsPerSec,
    heapDeltaMb,
  };
  console.info(
    `[PERF] ${label} | ops=${operationsCount} | total=${out.totalMs}ms | throughput=${opsPerSec.toLocaleString('en-US')} ops/s | heapDelta=${heapDeltaMb}MB`
  );
  return out;
}

export async function benchmarkAsyncSamples(
  label: string,
  samples: number,
  concurrency: number,
  fn: (idx: number) => Promise<void>
): Promise<LatencyStats> {
  const durations: number[] = new Array(samples);
  let cursor = 0;
  const heapBefore = getHeapUsedMb();
  const totalStart = performance.now();

  const workerCount = Math.max(1, Math.min(concurrency, samples));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < samples) {
        const myIdx = cursor++;
        const t0 = performance.now();
        await fn(myIdx);
        durations[myIdx] = performance.now() - t0;
      }
    })
  );

  const totalMs = performance.now() - totalStart;
  const heapDeltaMb = getHeapUsedMb() - heapBefore;
  const stats = computePercentileStats(label, durations, totalMs, heapDeltaMb);
  logPerfResult(stats);
  return stats;
}

export function logPerfResult(stats: LatencyStats): void {
  console.info(
    `[PERF] ${stats.label} | n=${stats.samples} | total=${stats.totalMs}ms | mean=${stats.meanMs}ms | p50=${stats.p50Ms}ms | p95=${stats.p95Ms}ms | p99=${stats.p99Ms}ms | max=${stats.maxMs}ms | ${stats.opsPerSec.toLocaleString('en-US')} ops/s | heapDelta=${stats.heapDeltaMb}MB`
  );
}
