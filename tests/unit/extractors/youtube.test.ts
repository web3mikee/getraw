import { describe, expect, test } from "bun:test";
import { YouTubeExtractor } from "../../../src/extractors/youtube/index";
import { InnerTubeClient } from "../../../src/extractors/youtube/innertube";
import type { StreamingData, CaptionTrack } from "../../../src/extractors/youtube/innertube";
import { parseCaptionTracks, convertToSrt, convertToVtt } from "../../../src/extractors/youtube/captions";
import type { TimedTextEvent } from "../../../src/extractors/youtube/captions";

describe("YouTubeExtractor URL matching", () => {
  const extractor = new YouTubeExtractor();

  const validUrls = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/v/dQw4w9WgXcQ",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf",
    "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw",
    "https://www.youtube.com/@username",
  ];

  const invalidUrls = [
    "https://www.example.com/watch?v=dQw4w9WgXcQ",
    "https://vimeo.com/123456",
    "https://www.youtube.com/",
    "https://www.youtube.com/results?search_query=test",
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

describe("InnerTubeClient format parsing", () => {
  const client = new InnerTubeClient();

  test("parses muxed and adaptive formats", () => {
    const streamingData: StreamingData = {
      formats: [
        {
          itag: 18,
          url: "https://rr.googlevideo.com/videoplayback?itag=18",
          mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
          bitrate: 500000,
          width: 640,
          height: 360,
          contentLength: "15000000",
          quality: "medium",
          qualityLabel: "360p",
          fps: 30,
          audioChannels: 2,
        },
      ],
      adaptiveFormats: [
        {
          itag: 137,
          url: "https://rr.googlevideo.com/videoplayback?itag=137",
          mimeType: 'video/mp4; codecs="avc1.640028"',
          bitrate: 4000000,
          width: 1920,
          height: 1080,
          contentLength: "50000000",
          quality: "hd1080",
          qualityLabel: "1080p",
          fps: 30,
          averageBitrate: 3500000,
        },
        {
          itag: 251,
          url: "https://rr.googlevideo.com/videoplayback?itag=251",
          mimeType: 'audio/webm; codecs="opus"',
          bitrate: 160000,
          contentLength: "5000000",
          audioQuality: "AUDIO_QUALITY_HIGH",
          audioSampleRate: "48000",
          audioChannels: 2,
          averageBitrate: 130000,
        },
      ],
    };

    const formats = client.parseFormats(streamingData);

    expect(formats).toHaveLength(3);

    const muxed = formats[0];
    expect(muxed.format_id).toBe("18");
    expect(muxed.ext).toBe("mp4");
    expect(muxed.width).toBe(640);
    expect(muxed.height).toBe(360);
    expect(muxed.vcodec).toBe("avc1.42001E");
    expect(muxed.acodec).toBe("mp4a.40.2");
    expect(muxed.resolution).toBe("640x360");

    const videoOnly = formats[1];
    expect(videoOnly.format_id).toBe("137");
    expect(videoOnly.ext).toBe("mp4");
    expect(videoOnly.width).toBe(1920);
    expect(videoOnly.height).toBe(1080);
    expect(videoOnly.vbr).toBe(3500);

    const audioOnly = formats[2];
    expect(audioOnly.format_id).toBe("251");
    expect(audioOnly.ext).toBe("webm");
    expect(audioOnly.vcodec).toBe("none");
    expect(audioOnly.acodec).toBe("opus");
    expect(audioOnly.abr).toBe(130);
    expect(audioOnly.audio_channels).toBe(2);
  });

  test("skips formats without url or signatureCipher", () => {
    const streamingData: StreamingData = {
      formats: [
        {
          itag: 18,
          mimeType: 'video/mp4; codecs="avc1.42001E"',
          bitrate: 500000,
        },
      ],
      adaptiveFormats: [],
    };

    const formats = client.parseFormats(streamingData);
    expect(formats).toHaveLength(0);
  });

  test("parses format with signatureCipher as having empty url", () => {
    const streamingData: StreamingData = {
      formats: [
        {
          itag: 18,
          signatureCipher: "s=test&sp=sig&url=https%3A%2F%2Fexample.com",
          mimeType: 'video/mp4; codecs="avc1.42001E"',
          bitrate: 500000,
          width: 640,
          height: 360,
        },
      ],
      adaptiveFormats: [],
    };

    const formats = client.parseFormats(streamingData);
    expect(formats).toHaveLength(1);
    expect(formats[0].url).toBe("");
  });
});

describe("Caption parsing", () => {
  test("separates manual and auto-generated captions", () => {
    const tracks: CaptionTrack[] = [
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=test&lang=en",
        name: { simpleText: "English" },
        vssId: ".en",
        languageCode: "en",
        isTranslatable: true,
      },
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=test&lang=en&kind=asr",
        name: { simpleText: "English (auto-generated)" },
        vssId: "a.en",
        languageCode: "en",
        kind: "asr",
        isTranslatable: true,
      },
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=test&lang=es",
        name: { simpleText: "Spanish" },
        vssId: ".es",
        languageCode: "es",
        isTranslatable: true,
      },
    ];

    const { subtitles, automatic_captions } = parseCaptionTracks(tracks);

    expect(Object.keys(subtitles)).toEqual(["en", "es"]);
    expect(Object.keys(automatic_captions)).toEqual(["en"]);

    expect(subtitles.en).toHaveLength(3);
    expect(subtitles.en[0].ext).toBe("json3");
    expect(subtitles.en[1].ext).toBe("vtt");
    expect(subtitles.en[2].ext).toBe("srv1");

    expect(automatic_captions.en).toHaveLength(3);
    expect(automatic_captions.en[0].name).toBe("English (auto-generated)");
  });
});

describe("Caption format conversion", () => {
  const events: TimedTextEvent[] = [
    {
      tStartMs: 0,
      dDurationMs: 2000,
      segs: [{ utf8: "Hello " }, { utf8: "world" }],
    },
    {
      tStartMs: 2500,
      dDurationMs: 3000,
      segs: [{ utf8: "This is a test" }],
    },
    {
      tStartMs: 6000,
      dDurationMs: 1000,
      segs: [],
    },
  ];

  test("converts to SRT format", () => {
    const srt = convertToSrt(events);
    const lines = srt.split("\n");

    expect(lines[0]).toBe("1");
    expect(lines[1]).toBe("00:00:00,000 --> 00:00:02,000");
    expect(lines[2]).toBe("Hello world");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe("2");
    expect(lines[5]).toBe("00:00:02,500 --> 00:00:05,500");
    expect(lines[6]).toBe("This is a test");
  });

  test("converts to VTT format", () => {
    const vtt = convertToVtt(events);
    const lines = vtt.split("\n");

    expect(lines[0]).toBe("WEBVTT");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("00:00:00.000 --> 00:00:02.000");
    expect(lines[3]).toBe("Hello world");
    expect(lines[4]).toBe("");
    expect(lines[5]).toBe("00:00:02.500 --> 00:00:05.500");
    expect(lines[6]).toBe("This is a test");
  });

  test("skips events with empty segments", () => {
    const srt = convertToSrt(events);
    expect(srt).not.toContain("3\n");
  });
});

describe("YouTubeExtractor metadata", () => {
  test("has correct extractor name", () => {
    const extractor = new YouTubeExtractor();
    expect(extractor._NAME).toBe("youtube");
  });
});
