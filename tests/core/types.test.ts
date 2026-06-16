import { describe, test, expect } from "bun:test";
import {
  BaseExtractor,
  ExtractorError,
  DownloadError,
  PostProcessError,
  DEFAULT_OPTIONS,
} from "../../src/core/types";
import type { InfoDict } from "../../src/core/types";

class TestExtractor extends BaseExtractor {
  readonly _VALID_URL = /^https:\/\/example\.com\/watch\?v=[\w-]+/;
  readonly _NAME = "test";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const id = new URL(url).searchParams.get("v") ?? "unknown";
    return {
      id,
      title: "Test Video",
      formats: [
        { format_id: "720p", url: "https://example.com/720.mp4", ext: "mp4", height: 720 },
        { format_id: "1080p", url: "https://example.com/1080.mp4", ext: "mp4", height: 1080 },
      ],
    };
  }
}

describe("BaseExtractor", () => {
  const extractor = new TestExtractor();

  test("canHandle returns true for matching URLs", () => {
    expect(extractor.canHandle("https://example.com/watch?v=abc123")).toBe(true);
  });

  test("canHandle returns false for non-matching URLs", () => {
    expect(extractor.canHandle("https://other.com/video")).toBe(false);
  });

  test("extract returns InfoDict with extractor metadata", async () => {
    const info = await extractor.extract("https://example.com/watch?v=test1");
    expect(info.id).toBe("test1");
    expect(info.title).toBe("Test Video");
    expect(info.extractor).toBe("test");
    expect(info.extractor_key).toBe("TestExtractor");
    expect(info.formats).toHaveLength(2);
  });

  test("extract throws ExtractorError for non-matching URL", async () => {
    await expect(extractor.extract("https://bad.com/video")).rejects.toThrow(ExtractorError);
  });
});

describe("Error classes", () => {
  test("ExtractorError has correct name", () => {
    const err = new ExtractorError("test");
    expect(err.name).toBe("ExtractorError");
    expect(err.message).toBe("test");
  });

  test("DownloadError has correct name", () => {
    const err = new DownloadError("test");
    expect(err.name).toBe("DownloadError");
  });

  test("PostProcessError has correct name", () => {
    const err = new PostProcessError("test");
    expect(err.name).toBe("PostProcessError");
  });
});

describe("DEFAULT_OPTIONS", () => {
  test("has sensible defaults", () => {
    expect(DEFAULT_OPTIONS.format).toBe("bv*+ba/b");
    expect(DEFAULT_OPTIONS.retries).toBe(3);
    expect(DEFAULT_OPTIONS.quiet).toBe(false);
    expect(DEFAULT_OPTIONS.verbose).toBe(false);
    expect(DEFAULT_OPTIONS.urls).toEqual([]);
  });
});
