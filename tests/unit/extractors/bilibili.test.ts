import { describe, test, expect, mock, beforeEach } from "bun:test";
import { BilibiliExtractor } from "../../../src/extractors/bilibili/index";
import { BilibiliBangumiExtractor } from "../../../src/extractors/bilibili/bangumi";
import { ExtractorError } from "../../../src/core/types";

describe("BilibiliExtractor", () => {
  const extractor = new BilibiliExtractor();

  test("canHandle BV URL", () => {
    expect(extractor.canHandle("https://www.bilibili.com/video/BV1GJ411x7h7")).toBe(true);
  });

  test("canHandle av URL", () => {
    expect(extractor.canHandle("https://www.bilibili.com/video/av170001")).toBe(true);
  });

  test("rejects non-bilibili URLs", () => {
    expect(extractor.canHandle("https://youtube.com/watch?v=abc")).toBe(false);
    expect(extractor.canHandle("https://bilibili.com/bangumi/play/ep123")).toBe(false);
  });

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("bilibili");
  });

  test("throws ExtractorError for unsupported URL", async () => {
    await expect(extractor.extract("https://example.com/video")).rejects.toThrow(ExtractorError);
  });
});

describe("BilibiliBangumiExtractor", () => {
  const extractor = new BilibiliBangumiExtractor();

  test("canHandle ep URL", () => {
    expect(extractor.canHandle("https://www.bilibili.com/bangumi/play/ep123456")).toBe(true);
  });

  test("canHandle ss URL", () => {
    expect(extractor.canHandle("https://www.bilibili.com/bangumi/play/ss12345")).toBe(true);
  });

  test("rejects regular video URLs", () => {
    expect(extractor.canHandle("https://www.bilibili.com/video/BV1GJ411x7h7")).toBe(false);
  });

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("bilibili:bangumi");
  });

  test("throws ExtractorError for unsupported URL", async () => {
    await expect(extractor.extract("https://example.com/video")).rejects.toThrow(ExtractorError);
  });
});

describe("Bilibili URL pattern matching", () => {
  const bvExtractor = new BilibiliExtractor();

  test("matches bilibili.com/video/BV* format", () => {
    const urls = [
      "https://www.bilibili.com/video/BV1GJ411x7h7",
      "https://bilibili.com/video/BV1xx411c79H",
      "https://www.bilibili.com/video/BVabc123def456",
    ];
    for (const url of urls) {
      expect(bvExtractor.canHandle(url)).toBe(true);
    }
  });

  test("matches bilibili.com/video/av* format", () => {
    const urls = [
      "https://www.bilibili.com/video/av170001",
      "https://bilibili.com/video/av1",
    ];
    for (const url of urls) {
      expect(bvExtractor.canHandle(url)).toBe(true);
    }
  });

  test("does not match unrelated paths", () => {
    expect(bvExtractor.canHandle("https://www.bilibili.com/user/12345")).toBe(false);
    expect(bvExtractor.canHandle("https://www.bilibili.com/channel/xyz")).toBe(false);
  });
});
