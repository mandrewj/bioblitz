/**
 * JSON GET with retry for transient upstream failures: 429, 5xx, and
 * network-level errors (`TypeError: fetch failed`). Both iNat and GBIF
 * occasionally blip (e.g. GBIF "503 Backend fetch failed"), and a single
 * blip used to fail the whole weekly sync.
 *
 * Honors `Retry-After` (seconds) when present. Other 4xx are thrown
 * immediately — they indicate a bad request, not a flaky backend.
 */
export async function fetchJsonWithRetry(
  url: string,
  opts: {
    label: string;
    headers: Record<string, string>;
    limiter: () => Promise<void>;
    backoffSeconds?: number[];
  }
): Promise<unknown> {
  const backoff = opts.backoffSeconds ?? [10, 30, 90];
  for (let attempt = 0; ; attempt++) {
    await opts.limiter();
    let res: Response;
    try {
      res = await fetch(url, { headers: opts.headers });
    } catch (err) {
      if (attempt < backoff.length) {
        await sleep(backoff[attempt]);
        continue;
      }
      throw new Error(`${opts.label} network error ${url}: ${(err as Error).message}`);
    }
    if (res.ok) return res.json();

    const transient = res.status === 429 || res.status >= 500;
    if (transient && attempt < backoff.length) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : backoff[attempt]);
      continue;
    }

    const body = await res.text();
    throw new Error(`${opts.label} ${res.status} ${url}: ${body.slice(0, 200)}`);
  }
}

function sleep(seconds: number) {
  return new Promise((r) => setTimeout(r, seconds * 1000));
}
