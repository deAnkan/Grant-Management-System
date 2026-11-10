import { constants } from "../constants.js";
import { sendError } from "../utils/response.utils.js";

// In-memory sliding buckets. Good enough for a single PM2 process; if the app is
// ever scaled horizontally, replace this with a Redis-backed store.
const buckets = new Map();
const MAX_TRACKED_KEYS = 50_000;
const SWEEP_INTERVAL_MS = 60 * 1000;

let lastSweepAt = 0;

const getClientIp = (req) => String(req.ip || req.socket?.remoteAddress || "unknown");

const sweepBuckets = (now) => {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // Hard cap so a flood of unique keys cannot exhaust memory.
  if (buckets.size > MAX_TRACKED_KEYS) {
    const excess = buckets.size - MAX_TRACKED_KEYS;
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  }

  lastSweepAt = now;
};

export const createRateLimiter = ({ windowMs, max, keyGenerator = getClientIp }) => {
  return (req, res, next) => {
    const now = Date.now();

    if (now - lastSweepAt >= SWEEP_INTERVAL_MS || buckets.size > MAX_TRACKED_KEYS) {
      sweepBuckets(now);
    }

    const key = String(keyGenerator(req));
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count <= max) return next();

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    return sendError(
      res,
      constants.TOO_MANY_REQUESTS,
      "Too many attempts. Please try again later.",
    );
  };
};

const identityKey = (req) => {
  const identity = String(
    req.body?.email || req.body?.employeeId || req.body?.otpSessionId || "",
  )
    .trim()
    .toLowerCase();
  return `${getClientIp(req)}:${identity}`;
};

export const registrationRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
});
export const loginRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: identityKey,
});
export const otpVerificationRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: identityKey,
});
