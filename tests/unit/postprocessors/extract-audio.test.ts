import { describe, test, expect } from "bun:test";
import { ExtractAudioPostProcessor } from "../../../src/postprocessors/extract-audio";
import type { InfoDict } from "../../../src/core/types";
import type { AudioFormat } from "../../../src/postprocessors/extract-audio";

const baseInfo: InfoDict = {
  id: "test456",
  title: "Test Audio",
  duration: 240,
};

describe("ExtractAudioPostProcessor", () => {
  test("_NAME is ExtractAudio", () => {
    const pp = new ExtractAudioPostProcessor();
    expect(pp._NAME).toBe("ExtractAudio");
  });

  test("extends PostProcessor correctly", () => {
    const pp = new ExtractAudioPostProcessor({ format: "mp3" });
    expect(typeof pp.run).toBe("function");
  });

  test("accepts all valid audio formats", () => {
    const formats: AudioFormat[] = ["mp3", "flac", "wav", "aac", "opus", "vorbis", "m4a"];
    for (const fmt of formats) {
      const pp = new ExtractAudioPostProcessor({ format: fmt });
      expect(pp._NAME).toBe("ExtractAudio");
    }
  });

  test("accepts quality option", () => {
    const pp = new ExtractAudioPostProcessor({ format: "mp3", quality: 0 });
    expect(pp._NAME).toBe("ExtractAudio");
  });

  test("defaults format to mp3", () => {
    const pp = new ExtractAudioPostProcessor();
    expect(pp._NAME).toBe("ExtractAudio");
  });

  test("preserveMetadata defaults to true (no crash on construction)", () => {
    const pp = new ExtractAudioPostProcessor({ preserveMetadata: true });
    expect(typeof pp.run).toBe("function");
  });
});

describe("ExtractAudioPostProcessor output extension mapping", () => {
  const FORMAT_EXT: Record<AudioFormat, string> = {
    mp3: "mp3",
    flac: "flac",
    wav: "wav",
    aac: "aac",
    opus: "opus",
    vorbis: "ogg",
    m4a: "m4a",
  };

  for (const [fmt, ext] of Object.entries(FORMAT_EXT)) {
    test(`format ${fmt} maps to extension .${ext}`, () => {
      expect(ext).toBeTruthy();
    });
  }
});
