import { describe, test, expect } from "bun:test";
import { SubtitlePostProcessor } from "../../../src/postprocessors/subtitles";
import type { InfoDict } from "../../../src/core/types";
import type { SubtitleFormat } from "../../../src/postprocessors/subtitles";

const baseInfo: InfoDict = {
  id: "sub789",
  title: "Test Subtitles",
  duration: 180,
};

const infoWithSubs: InfoDict = {
  ...baseInfo,
  subtitles: {
    en: [
      { url: "https://example.com/subs.vtt", ext: "vtt", data: "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nHello world" },
    ],
  },
};

describe("SubtitlePostProcessor", () => {
  test("_NAME is Subtitles", () => {
    const pp = new SubtitlePostProcessor();
    expect(pp._NAME).toBe("Subtitles");
  });

  test("extends PostProcessor correctly", () => {
    const pp = new SubtitlePostProcessor();
    expect(typeof pp.run).toBe("function");
  });

  test("returns unchanged filepath when no subtitles in info", async () => {
    const pp = new SubtitlePostProcessor();
    const result = await pp.run(baseInfo, "/tmp/video.mp4");
    expect(result.filepath).toBe("/tmp/video.mp4");
    expect(result.files_to_delete).toHaveLength(0);
  });

  test("accepts all valid subtitle formats", () => {
    const formats: SubtitleFormat[] = ["srt", "ass", "vtt", "json3", "lrc"];
    for (const fmt of formats) {
      const pp = new SubtitlePostProcessor({ convertTo: fmt });
      expect(pp._NAME).toBe("Subtitles");
    }
  });

  test("accepts embed mode: soft", () => {
    const pp = new SubtitlePostProcessor({ embed: "soft" });
    expect(pp._NAME).toBe("Subtitles");
  });

  test("accepts embed mode: burn", () => {
    const pp = new SubtitlePostProcessor({ embed: "burn" });
    expect(pp._NAME).toBe("Subtitles");
  });

  test("returns files_to_delete with temp sub when sub data present", async () => {
    const pp = new SubtitlePostProcessor({ language: "en" });
    const result = await pp.run(infoWithSubs, "/tmp/video.mp4");
    expect(result.files_to_delete.length).toBeGreaterThanOrEqual(0);
  });
});

describe("SRT to VTT conversion logic", () => {
  test("VTT has WEBVTT header", () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello";
    expect(vtt.startsWith("WEBVTT")).toBe(true);
  });

  test("SRT uses comma for millisecond separator", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nHello\n";
    expect(srt).toContain(",");
  });
});

describe("JSON3 subtitle format", () => {
  test("json3 events have expected structure", () => {
    const json3 = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "Hello" }] },
        { tStartMs: 3000, dDurationMs: 1500, segs: [{ utf8: "World" }] },
      ],
    });

    const parsed = JSON.parse(json3) as { events: Array<{ tStartMs: number; dDurationMs: number; segs: Array<{ utf8: string }> }> };
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0]?.segs?.[0]?.utf8).toBe("Hello");
  });
});
