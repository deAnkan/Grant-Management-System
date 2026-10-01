import { constants } from "../constants.js";
import { sendError } from "../utils/response.utils.js";

const buckets = new Map();

const getClientIp = (req) => String(req.ip || req.socket?.remoteAddress || "unknown");

export const createRateLimiter = ({ windowMs, max, keyGenerator = getClientIp }) => {
  const cleanupInterval = Math.max(windowMs, 60 * 1000);
  let lastCleanup = 0;

  return (req, res, next) => {
    const now = Date.now();
    const key = String(keyGenerator(req));
    const bucket = buckets.get(key);

    if (now - lastCleanup >= cleanupInterval) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
      lastCleanup = now;
    }

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count <= max) return next();

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    return sendError(res, constants.TOO_MANY_REQUESTS, "Too many attempts. Please try again later.");
  };
};

const identityKey = (req) => {
  const identity = String(req.body?.email || req.body?.employeeId || req.body?.otpSessionId || "").trim().toLowerCase();
  return `${getClientIp(req)}:${identity}`;
};

export const registrationRateLimit = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });
export const loginRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, keyGenerator: identityKey });
export const otpVerificationRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5, keyGenerator: identityKey });
