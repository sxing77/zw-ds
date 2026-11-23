import 'server-only';

interface Bucket {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Map<string, Bucket>>();
const MAX_KEYS_PER_STORE = 5_000;

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

export function checkRateLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number; remaining: number } {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map<string, Bucket>();
    stores.set(namespace, store);
  }

  const now = Date.now();
  if (store.size > MAX_KEYS_PER_STORE) {
    for (const [k, v] of store) {
      if (v.resetAt <= now) store.delete(k);
    }
  }

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0, remaining: Math.max(0, limit - 1) };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  current.count += 1;
  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, limit - current.count),
  };
}
