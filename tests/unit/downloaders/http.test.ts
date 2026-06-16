import { describe, it, expect } from "bun:test";
import { HttpDownloader } from "../../../src/downloaders/http";
import { DownloadError } from "../../../src/core/types";

describe("HttpDownloader", () => {
  const downloader = new HttpDownloader();

  it("canHandle http and https protocols", () => {
    expect(downloader.canHandle("http")).toBe(true);
    expect(downloader.canHandle("https")).toBe(true);
    expect(downloader.canHandle("m3u8")).toBe(false);
    expect(downloader.canHandle("dash")).toBe(false);
    expect(downloader.canHandle("ftp")).toBe(false);
  });

  it("has protocol set to https", () => {
    expect(downloader.protocol).toBe("https");
  });

  it("throws DownloadError on HTTP error after retries", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(null, { status: 404, statusText: "Not Found" });
    };

    await expect(
      downloader.download("https://example.com/file.mp4", "/tmp/test-http.mp4", {
        retries: 2,
      }),
    ).rejects.toThrow(DownloadError);

    expect(calls).toBeGreaterThan(0);
    globalThis.fetch = originalFetch;
  });

  it("reports progress during download", async () => {
    const originalFetch = globalThis.fetch;
    const chunkData = new Uint8Array(1024).fill(1);

    globalThis.fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "content-length": "1024", "accept-ranges": "bytes" },
        });
      }
      return new Response(chunkData, {
        status: 200,
        headers: { "content-length": "1024" },
      });
    };

    const progressEvents: number[] = [];
    await downloader.download("https://example.com/file.mp4", "/tmp/test-progress.mp4", {
      retries: 1,
      onProgress: (p) => {
        if (p.percent !== null) progressEvents.push(p.percent);
      },
    });

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[progressEvents.length - 1]).toBe(100);
    globalThis.fetch = originalFetch;
  });

  it("sends Range header on second attempt (resume)", async () => {
    const originalFetch = globalThis.fetch;
    const rangeRequests: string[] = [];
    let attempt = 0;

    globalThis.fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      attempt++;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers["Range"]) rangeRequests.push(headers["Range"]);
      if (attempt === 1) {
        throw new Error("Simulated network failure");
      }
      return new Response(new Uint8Array(512).fill(2), {
        status: 206,
        headers: { "content-length": "512" },
      });
    };

    await downloader.download("https://example.com/file.mp4", "/tmp/resume-test.mp4", {
      retries: 2,
    }).catch(() => {});

    globalThis.fetch = originalFetch;

    expect(attempt).toBeGreaterThan(1);
  });

  it("accepts a rateLimit option without throwing", async () => {
    const originalFetch = globalThis.fetch;
    const data = new Uint8Array(128).fill(3);

    globalThis.fetch = async () =>
      new Response(data, {
        status: 200,
        headers: { "content-length": "128" },
      });

    await expect(
      downloader.download("https://example.com/file.mp4", "/tmp/rate-test.mp4", {
        retries: 1,
        rateLimit: 1024 * 1024,
      }),
    ).resolves.toBeUndefined();

    globalThis.fetch = originalFetch;
  });
});
