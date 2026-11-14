/** Simple in-memory token bucket keyed by IP. */
export class TokenBucket {
  constructor({ capacity, refillPerSec }) {
    this.capacity = capacity;
    this.refill = refillPerSec;
    this.buckets = new Map();
  }
  take(key, cost = 1) {
    const t = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, at: t };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.at) / 1000) * this.refill);
    b.at = t;
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  }
  /** Drop full buckets so memory does not grow forever. */
  gc() {
    const t = Date.now();
    for (const [k, b] of this.buckets) {
      if (b.tokens + ((t - b.at) / 1000) * this.refill >= this.capacity) this.buckets.delete(k);
    }
  }
}