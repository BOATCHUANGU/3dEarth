export interface TileSample {
  source: string;
  kind: 'base' | 'labels';
  outcome: 'ok' | 'cancelled' | 'timeout' | 'network' | 'decode' | 'denied' | `http-${number}`;
  queueMs: number;
  ttfbMs: number;
  totalMs: number;
  bytes: number;
  cache: string;
}

/** Bounded session diagnostics; never records tile coordinates, URLs, IPs or keys. */
export class TileMetrics {
  private samples: TileSample[] = [];
  record(sample: TileSample) {
    this.samples.push(sample);
    if (this.samples.length > 256) this.samples.shift();
  }
  snapshot() {
    return [...new Set(this.samples.map((sample) => sample.source))].map((source) => {
      const samples = this.samples.filter((sample) => sample.source === source);
      const succeeded = samples.filter((sample) => sample.outcome === 'ok');
      const percentile = (values: number[], fraction: number) => {
        values.sort((a, b) => a - b);
        return values.length
          ? Math.round(values[Math.max(0, Math.ceil(values.length * fraction) - 1)])
          : null;
      };
      return {
        source,
        requests: samples.length,
        succeeded: succeeded.length,
        failed: samples.filter(
          (sample) => sample.outcome !== 'ok' && sample.outcome !== 'cancelled',
        ).length,
        cancelled: samples.filter((sample) => sample.outcome === 'cancelled').length,
        timeouts: samples.filter((sample) => sample.outcome === 'timeout').length,
        p50Ms: percentile(
          succeeded.map((sample) => sample.totalMs),
          0.5,
        ),
        p95Ms: percentile(
          succeeded.map((sample) => sample.totalMs),
          0.95,
        ),
        ttfbP95Ms: percentile(
          succeeded.map((sample) => sample.ttfbMs),
          0.95,
        ),
        queueP95Ms: percentile(
          samples.map((sample) => sample.queueMs),
          0.95,
        ),
        bytes: samples.reduce((total, sample) => total + sample.bytes, 0),
        relayHits: samples.filter(
          (sample) => sample.cache === 'HIT' || sample.cache === 'COALESCED',
        ).length,
        errors: [
          ...new Set(
            samples
              .filter((sample) => !['ok', 'cancelled'].includes(sample.outcome))
              .map((sample) => sample.outcome),
          ),
        ],
      };
    });
  }
}
