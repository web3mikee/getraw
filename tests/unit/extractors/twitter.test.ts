import { describe, test, expect, mock, beforeEach } from "bun:test";
import { TwitterExtractor } from "../../../src/extractors/twitter/index";
import { TwitterSpacesExtractor } from "../../../src/extractors/twitter/spaces";
import { ExtractorError } from "../../../src/core/types";

describe("TwitterExtractor", () => {
  const extractor = new TwitterExtractor();

  test("canHandle matches twitter.com status URLs", () => {
    expect(extractor.canHandle("https://twitter.com/user/status/1234567890")).toBe(true);
    expect(extractor.canHandle("https://www.twitter.com/user/status/1234567890")).toBe(true);
  });

  test("canHandle matches x.com status URLs", () => {
    expect(extractor.canHandle("https://x.com/user/status/9876543210")).toBe(true);
    expect(extractor.canHandle("https://www.x.com/elonmusk/status/9876543210")).toBe(true);
  });

  test("canHandle rejects non-tweet URLs", () => {
    expect(extractor.canHandle("https://twitter.com/user")).toBe(false);
    expect(extractor.canHandle("https://youtube.com/watch?v=abc")).toBe(false);
    expect(extractor.canHandle("https://x.com/i/spaces/abc123")).toBe(false);
  });

  test("_NAME is twitter", () => {
    expect(extractor._NAME).toBe("twitter");
  });

  test("extract sets extractor metadata", async () => {
    const mockTweetData = {
      id_str: "1234567890",
      full_text: "Test tweet with video",
      user: { name: "Test User", screen_name: "testuser", id_str: "999" },
      created_at: "Mon Jan 01 12:00:00 +0000 2024",
      favorite_count: 100,
      views: { count: "5000" },
      mediaDetails: [
        {
          type: "video",
          media_url_https: "https://pbs.twimg.com/ext_tw_video_thumb/1234567890/pu/img/thumb.jpg",
          original_info: { width: 1280, height: 720 },
          video_info: {
            duration_millis: 30000,
            variants: [
              {
                content_type: "video/mp4",
                url: "https://video.twimg.com/ext_tw_video/1234567890/pu/vid/1280x720/video.mp4",
                bitrate: 2176000,
              },
              {
                content_type: "video/mp4",
                url: "https://video.twimg.com/ext_tw_video/1234567890/pu/vid/640x360/video.mp4",
                bitrate: 832000,
              },
              {
                content_type: "application/x-mpegURL",
                url: "https://video.twimg.com/ext_tw_video/1234567890/pu/pl/playlist.m3u8",
              },
            ],
          },
        },
      ],
    };

    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTweetData),
      } as Response),
    );

    try {
      const info = await extractor.extract("https://twitter.com/testuser/status/1234567890");

      expect(info.id).toBe("1234567890");
      expect(info.title).toBe("Test tweet with video");
      expect(info.uploader).toBe("Test User");
      expect(info.uploader_id).toBe("testuser");
      expect(info.view_count).toBe(5000);
      expect(info.like_count).toBe(100);
      expect(info.duration).toBe(30);
      expect(info.extractor).toBe("twitter");
      expect(info.extractor_key).toBe("TwitterExtractor");
      expect(info.formats).toBeDefined();
      expect(info.formats!.length).toBeGreaterThan(0);

      const mp4Formats = info.formats!.filter((f) => f.ext === "mp4" && !f.protocol);
      expect(mp4Formats.length).toBe(2);

      const highestBitrate = mp4Formats[0];
      expect(highestBitrate.tbr).toBe(2176);

      const hlsFormat = info.formats!.find((f) => f.protocol === "m3u8");
      expect(hlsFormat).toBeDefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("extract throws ExtractorError when API returns no data", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response),
    );

    try {
      await expect(
        extractor.extract("https://twitter.com/user/status/1234567890"),
      ).rejects.toThrow(ExtractorError);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("extract throws ExtractorError on API failure", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      } as Response),
    );

    try {
      await expect(
        extractor.extract("https://twitter.com/user/status/1234567890"),
      ).rejects.toThrow(ExtractorError);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("extract handles tweet without video", async () => {
    const mockTweetData = {
      id_str: "9999999999",
      full_text: "Tweet without video",
      user: { name: "User", screen_name: "user", id_str: "1" },
      created_at: "Mon Jan 01 12:00:00 +0000 2024",
    };

    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTweetData),
      } as Response),
    );

    try {
      const info = await extractor.extract("https://twitter.com/user/status/9999999999");
      expect(info.id).toBe("9999999999");
      expect(info.formats).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("TwitterSpacesExtractor", () => {
  const extractor = new TwitterSpacesExtractor();

  test("canHandle matches Twitter Spaces URLs", () => {
    expect(extractor.canHandle("https://twitter.com/i/spaces/1YqKDqPQjnkKV")).toBe(true);
    expect(extractor.canHandle("https://x.com/i/spaces/1YqKDqPQjnkKV")).toBe(true);
    expect(extractor.canHandle("https://www.twitter.com/i/spaces/abc123XYZ")).toBe(true);
  });

  test("canHandle rejects non-spaces URLs", () => {
    expect(extractor.canHandle("https://twitter.com/user/status/123")).toBe(false);
    expect(extractor.canHandle("https://twitter.com/user")).toBe(false);
  });

  test("_NAME is twitter:spaces", () => {
    expect(extractor._NAME).toBe("twitter:spaces");
  });
});
