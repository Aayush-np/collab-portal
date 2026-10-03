// Simple fixed-window, in-memory rate limiter (per server instance).
// Sufficient for a single-instance deployment; for multi-instance, back with Redis.

const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();

export const rateLimit = ({ windowMs, max, message }) => (req, res, next) => {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();

  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count += 1;

  if (entry.count > max) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
    return res.status(429).json({ error: message || 'Too many requests. Please try again later.' });
  }
  return next();
};
