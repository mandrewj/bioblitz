import { describe, expect, it, vi } from "vitest";
import { fetchJsonWithRetry } from "@/lib/http";

const opts = { label: "T", headers: {}, limiter: async () => {}, backoffSeconds: [0, 0] };

function res(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchJsonWithRetry", () => {
  it("retries a 503 and a network error, then succeeds", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(res(503))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(res(200, { ok: 1 })) as unknown as typeof fetch;
    await expect(fetchJsonWithRetry("u", opts)).resolves.toEqual({ ok: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 400", async () => {
    global.fetch = vi.fn().mockResolvedValue(res(400)) as unknown as typeof fetch;
    await expect(fetchJsonWithRetry("u", opts)).rejects.toThrow("T 400");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after the backoff schedule", async () => {
    global.fetch = vi.fn().mockResolvedValue(res(502)) as unknown as typeof fetch;
    await expect(fetchJsonWithRetry("u", opts)).rejects.toThrow("T 502");
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
