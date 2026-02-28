'use strict';

/**
 * Simple in-memory sliding-window rate limiter.
 * No external dependencies — suitable for single-process hub deployments.
 */

/**
 * @param {{ windowMs?: number, maxRequests?: number }} [opts]
 * @returns {{ check: (key: string) => { allowed: boolean, remaining: number, resetMs: number } }}
 */
function createRateLimiter(opts) {
  const windowMs = (opts && opts.windowMs) || 15 * 60 * 1000;
  const maxRequests = (opts && opts.maxRequests) || 30;
  const buckets = new Map();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      bucket.timestamps = bucket.timestamps.filter(ts => now - ts < windowMs);
      if (bucket.timestamps.length === 0) buckets.delete(key);
    }
  }, 60000);
  cleanupTimer.unref();

  return {
    check(key) {
      const now = Date.now();
      if (!buckets.has(key)) buckets.set(key, { timestamps: [] });
      const bucket = buckets.get(key);
      bucket.timestamps = bucket.timestamps.filter(ts => now - ts < windowMs);
      if (bucket.timestamps.length >= maxRequests) {
        const oldest = bucket.timestamps[0];
        return { allowed: false, remaining: 0, resetMs: oldest + windowMs - now };
      }
      bucket.timestamps.push(now);
      return { allowed: true, remaining: maxRequests - bucket.timestamps.length, resetMs: 0 };
    }
  };
}

module.exports = { createRateLimiter };
