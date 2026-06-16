import { describe, test, expect } from "bun:test";
import { KickExtractor } from "../../../src/extractors/kick/index";
import { KickClipsExtractor } from "../../../src/extractors/kick/clips";
import { KickLiveExtractor } from "../../../src/extractors/kick/live";
import { ExtractorError } from "../../../src/core/types";

describe("KickExtractor (VOD)", () => {
  const extractor = new KickExtractor();

  test("canHandle kick.com/video/* URLs", () => {
    expect(extractor.canHandle("https://kick.com/video/abc123")).toBe(true);
    expect(extractor.canHandle("https://www.kick.com/video/xyz-456")).toBe(true);
  });

  test("rejects non-video kick URLs", () => {
    expect(extractor.canHandle("https://kick.com/xqc")).toBe(false);
    expect(extractor.canHandle("https://kick.com/xqc/clips/abc")).toBe(false);
    expect(extractor.canHandle("https://youtube.com/watch?v=abc")).toBe(false);
  });

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("kick");
  });

  test("throws ExtractorError for unsupported URL", async () => {
    await expect(extractor.extract("https://example.com/video")).rejects.toThrow(ExtractorError);
  });
});

describe("KickClipsExtractor", () => {
  const extractor = new KickClipsExtractor();

  test("canHandle kick.com/*/clips/* URLs", () => {
    expect(extractor.canHandle("https://kick.com/xqc/clips/clip-abc123")).toBe(true);
    expect(extractor.canHandle("https://www.kick.com/streamer/clips/xyz-987")).toBe(true);
  });

  test("rejects non-clips kick URLs", () => {
    expect(extractor.canHandle("https://kick.com/video/abc123")).toBe(false);
    expect(extractor.canHandle("https://kick.com/xqc")).toBe(false);
  });

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("kick:clips");
  });

  test("throws ExtractorError for unsupported URL", async () => {
    await expect(extractor.extract("https://example.com/video")).rejects.toThrow(ExtractorError);
  });
});

describe("KickLiveExtractor", () => {
  const extractor = new KickLiveExtractor();

  test("canHandle kick.com/channelname URLs", () => {
    expect(extractor.canHandle("https://kick.com/xqc")).toBe(true);
    expect(extractor.canHandle("https://www.kick.com/adinross")).toBe(true);
  });

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("kick:live");
  });

  test("throws ExtractorError for unsupported URL", async () => {
    await expect(extractor.extract("https://example.com/video")).rejects.toThrow(ExtractorError);
  });
});

describe("Kick URL disambiguation", () => {
  const vodExtractor = new KickExtractor();
  const clipsExtractor = new KickClipsExtractor();
  const liveExtractor = new KickLiveExtractor();

  test("VOD extractor handles /video/ path", () => {
    const url = "https://kick.com/video/testvideo123";
    expect(vodExtractor.canHandle(url)).toBe(true);
    expect(clipsExtractor.canHandle(url)).toBe(false);
  });

  test("clips extractor handles /clips/ path", () => {
    const url = "https://kick.com/streamer/clips/testclip456";
    expect(clipsExtractor.canHandle(url)).toBe(true);
    expect(vodExtractor.canHandle(url)).toBe(false);
  });
});
