import { describe, test, expect } from "bun:test";
import { selectFormats, sortFormats, parseFormatString, formatFormatTable } from "../../src/core/format-sorter";
import type { Format } from "../../src/core/types";

const FORMATS: Format[] = [
  { format_id: "251", url: "https://example.com/audio", ext: "webm", acodec: "opus", abr: 160, vcodec: "none" },
  { format_id: "140", url: "https://example.com/audio2", ext: "m4a", acodec: "aac", abr: 128, vcodec: "none" },
  { format_id: "244", url: "https://example.com/480", ext: "webm", vcodec: "vp9", acodec: "none", height: 480, width: 854, tbr: 750 },
  { format_id: "247", url: "https://example.com/720", ext: "webm", vcodec: "vp9", acodec: "none", height: 720, width: 1280, tbr: 1500 },
  { format_id: "248", url: "https://example.com/1080", ext: "webm", vcodec: "vp9", acodec: "none", height: 1080, width: 1920, tbr: 2500 },
  { format_id: "22", url: "https://example.com/720av", ext: "mp4", vcodec: "h264", acodec: "aac", height: 720, width: 1280, tbr: 2000, abr: 192 },
];

describe("parseFormatString", () => {
  test("parses simple best", () => {
    const spec = parseFormatString("best");
    expect(spec.type).toBe("single");
    expect(spec.video?.best).toBe(true);
  });

  test("parses merge format", () => {
    const spec = parseFormatString("bv*+ba");
    expect(spec.type).toBe("merge");
    expect(spec.video?.best).toBe(true);
    expect(spec.audio?.best).toBe(true);
    expect(spec.audio?.audioOnly).toBe(true);
  });

  test("parses fallback chain", () => {
    const spec = parseFormatString("bv*+ba/b");
    expect(spec.type).toBe("merge");
    expect(spec.fallback).toBeDefined();
    expect(spec.fallback?.type).toBe("single");
  });

  test("parses height filter", () => {
    const spec = parseFormatString("1080p");
    expect(spec.video?.height).toBe(1080);
  });
});

describe("selectFormats", () => {
  test("selects best video + best audio for bv*+ba", () => {
    const selected = selectFormats(FORMATS, "bv*+ba");
    expect(selected).toHaveLength(2);
  });

  test("selects single best format for 'best'", () => {
    const selected = selectFormats(FORMATS, "best");
    expect(selected).toHaveLength(1);
  });

  test("selects by format ID", () => {
    const selected = selectFormats(FORMATS, "22");
    expect(selected).toHaveLength(1);
    expect(selected[0].format_id).toBe("22");
  });

  test("selects by height", () => {
    const selected = selectFormats(FORMATS, "1080p");
    expect(selected).toHaveLength(1);
    expect(selected[0].height).toBe(1080);
  });

  test("falls back when primary fails", () => {
    const selected = selectFormats(FORMATS, "4320p/best");
    expect(selected).toHaveLength(1);
  });

  test("returns empty for impossible format", () => {
    const selected = selectFormats(FORMATS, "nonexistent");
    expect(selected).toHaveLength(0);
  });
});

describe("sortFormats", () => {
  test("sorts by quality ascending", () => {
    const sorted = sortFormats(FORMATS);
    const heights = sorted
      .filter((f) => f.height !== undefined)
      .map((f) => f.height);
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]!).toBeGreaterThanOrEqual(heights[i - 1]!);
    }
  });
});

describe("formatFormatTable", () => {
  test("returns a formatted table string", () => {
    const table = formatFormatTable(FORMATS);
    expect(table).toContain("ID");
    expect(table).toContain("EXT");
    expect(table).toContain("251");
    expect(table).toContain("248");
  });
});
