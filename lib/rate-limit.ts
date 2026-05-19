/** Token-bucket-style rate limiter: at most `limit` calls per `windowMs`. */
export function createLimiter(limit: number, windowMs: number) {
  const timestamps: number[] = [];
  return async function acquire() {
    while (true) {
      const now = Date.now();
      while (timestamps.length && now - timestamps[0] > windowMs) {
        timestamps.shift();
      }
      if (timestamps.length < limit) {
        timestamps.push(now);
        return;
      }
      const wait = windowMs - (now - timestamps[0]) + 5;
      await new Promise((r) => setTimeout(r, wait));
    }
  };
}
