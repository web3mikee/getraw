import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { HlsDownloader } from "../../../src/downloaders/hls";
import { DownloadError } from "../../../src/core/types";

const MEDIA_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
seg0.ts
#EXTINF:10.0,
seg1.ts
#EXTINF:10.0,
seg2.ts
#EXT-X-ENDLIST
`;

const MASTER_PLAYLIST = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720
high/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360
low/index.m3u8
`;

describe("HlsDownloader", () => {
  const downloader = new HlsDownloader();

  it("canHandle m3u8 and hls protocols", () => {
    expect(downloader.canHandle("m3u8")).toBe(true);
    expect(downloader.canHandle("hls")).toBe(true);
    expect(downloader.canHandle("http")).toBe(false);
    expect(downloader.canHandle("dash")).toBe(false);
  });

  it("has protocol set to m3u8", () => {
    expect(downloader.protocol).toBe("m3u8");
  });

  it("throws DownloadError when manifest fetch fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 404, statusText: "Not Found" });

    await expect(
      downloader.download("https://example.com/stream.m3u8", "/tmp/test.ts", { retries: 1 }),
    ).rejects.toThrow(DownloadError);

    globalThis.fetch = originalFetch;
  });

  it("throws DownloadError when segment download fails", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;

    globalThis.fetch = async (url: RequestInfo | URL) => {
      callCount++;
      const urlStr = String(url);
      if (urlStr.includes("stream.m3u8")) {
        return new Response(MEDIA_PLAYLIST, { status: 200 });
      }
      return new Response(null, { status: 500, statusText: "Server Error" });
    };

    await expect(
      downloader.download("https://example.com/stream.m3u8", "/tmp/test.ts", { retries: 1 }),
    ).rejects.toThrow(DownloadError);

    globalThis.fetch = originalFetch;
  });

  it("selects highest bandwidth variant from master playlist", async () => {
    const originalFetch = globalThis.fetch;
    const fetchedUrls: string[] = [];

    globalThis.fetch = async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      fetchedUrls.push(urlStr);

      if (urlStr.endsWith("master.m3u8")) {
        return new Response(MASTER_PLAYLIST, { status: 200 });
      }
      if (urlStr.includes("high/index.m3u8")) {
        return new Response(MEDIA_PLAYLIST, { status: 200 });
      }
      if (urlStr.includes("seg")) {
        return new Response(new Uint8Array(100).fill(0), { status: 200 });
      }
      return new Response(null, { status: 404 });
    };

    await downloader.download("https://example.com/master.m3u8", "/tmp/hls-out.ts", {
      retries: 1,
    }).catch(() => {});

    const fetchedHighVariant = fetchedUrls.some((u) => u.includes("high/index.m3u8"));
    expect(fetchedHighVariant).toBe(true);

    const fetchedLowVariant = fetchedUrls.some((u) => u.includes("low/index.m3u8"));
    expect(fetchedLowVariant).toBe(false);

    globalThis.fetch = originalFetch;
  });

  it("uses exponential backoff on retry", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;

    globalThis.fetch = async () => {
      callCount++;
      return new Response(null, { status: 503, statusText: "Service Unavailable" });
    };

    const start = Date.now();
    await expect(
      downloader.download("https://example.com/stream.m3u8", "/tmp/test.ts", { retries: 2 }),
    ).rejects.toThrow(DownloadError);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(1000);
    globalThis.fetch = originalFetch;
  });
});
