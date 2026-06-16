import { describe, test, expect } from "bun:test";
import { NiconicoExtractor } from "../../../src/extractors/niconico/index";
import { ExtractorError } from "../../../src/core/types";

describe("NiconicoExtractor", () => {
  const extractor = new NiconicoExtractor();

  test("canHandle nicovideo.jp/watch/sm* URLs", () => {
    expect(extractor.canHandle("https://www.nicovideo.jp/watch/sm9")).toBe(true);
    expect(extractor.canHandle("https://nicovideo.jp/watch/sm12345678")).toBe(true);
  });

  test("canHandle nicovideo.jp/watch/nm* URLs", () => {
    expect(extractor.canHandle("https://www.nicovideo.jp/watch/nm1234")).toBe(true);
    expect(extractor.canHandle("https://nicovideo.jp/watch/nm5678")).toBe(true);
  });

  test("rejects non-niconico URLs", () => {
    expect(extractor.canHandle("https://youtube.com/watch?v=sm9")).toBe(false);
    expect(extractor.canHandle("https://nicovideo.jp/user/12345")).toBe(false);
    expect(extractor.canHandle("https://nicovideo.jp/watch/lv12345")).toBe(false);
  });

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("niconico");
  });

  test("throws ExtractorError for unsupported URL", async () => {
    await expect(extractor.extract("https://example.com/watch/sm1")).rejects.toThrow(ExtractorError);
  });
});

describe("Niconico URL pattern matching", () => {
  const extractor = new NiconicoExtractor();

  const validUrls = [
    "https://www.nicovideo.jp/watch/sm9",
    "https://nicovideo.jp/watch/sm12345678",
    "https://www.nicovideo.jp/watch/nm1234",
    "https://nicovideo.jp/watch/nm9999999",
  ];

  const invalidUrls = [
    "https://www.nicovideo.jp/watch/lv12345",
    "https://www.nicovideo.jp/user/12345",
    "https://nicovideo.jp/",
    "https://youtube.com/watch/sm9",
  ];

  for (const url of validUrls) {
    test(`matches: ${url}`, () => {
      expect(extractor.canHandle(url)).toBe(true);
    });
  }

  for (const url of invalidUrls) {
    test(`rejects: ${url}`, () => {
      expect(extractor.canHandle(url)).toBe(false);
    });
  }
});
