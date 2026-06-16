import { describe, it, expect } from "bun:test";
import { DashDownloader } from "../../../src/downloaders/dash";
import { DownloadError } from "../../../src/core/types";

describe("DashDownloader", () => {
  const downloader = new DashDownloader();

  it("canHandle dash and mpd protocols", () => {
    expect(downloader.canHandle("dash")).toBe(true);
    expect(downloader.canHandle("mpd")).toBe(true);
    expect(downloader.canHandle("http")).toBe(false);
    expect(downloader.canHandle("m3u8")).toBe(false);
  });

  it("has protocol set to dash", () => {
    expect(downloader.protocol).toBe("dash");
  });

  it("throws DownloadError when MPD fetch fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 404, statusText: "Not Found" });

    await expect(
      downloader.download("https://example.com/manifest.mpd", "/tmp/test.mp4", { retries: 1 }),
    ).rejects.toThrow(DownloadError);

    globalThis.fetch = originalFetch;
  });

  it("uses exponential backoff on retry", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
      new Response(null, { status: 503, statusText: "Service Unavailable" });

    const start = Date.now();
    await expect(
      downloader.download("https://example.com/manifest.mpd", "/tmp/test.mp4", { retries: 2 }),
    ).rejects.toThrow(DownloadError);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(1000);
    globalThis.fetch = originalFetch;
  });

  it("throws DownloadError on non-ok MPD response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("Forbidden", { status: 403, statusText: "Forbidden" });

    await expect(
      downloader.download("https://example.com/manifest.mpd", "/tmp/test.mp4", { retries: 1 }),
    ).rejects.toThrow(DownloadError);

    globalThis.fetch = originalFetch;
  });
});
