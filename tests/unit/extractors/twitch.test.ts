import { describe, test, expect, mock } from "bun:test";
import { TwitchVODExtractor } from "../../../src/extractors/twitch/index";
import { TwitchClipExtractor } from "../../../src/extractors/twitch/clips";
import { TwitchLiveExtractor } from "../../../src/extractors/twitch/live";
import { ExtractorError } from "../../../src/core/types";

const vodExtractor = new TwitchVODExtractor();
const clipExtractor = new TwitchClipExtractor();
const liveExtractor = new TwitchLiveExtractor();

describe("TwitchVODExtractor", () => {
  test("canHandle matches VOD URL", () => {
    expect(vodExtractor.canHandle("https://www.twitch.tv/videos/1234567890")).toBe(true);
  });

  test("canHandle rejects clip URL", () => {
    expect(vodExtractor.canHandle("https://www.twitch.tv/streamer/clip/ClipSlug")).toBe(false);
  });

  test("canHandle rejects live URL", () => {
    expect(vodExtractor.canHandle("https://www.twitch.tv/streamer")).toBe(false);
  });

  test("_NAME is twitch:vod", () => {
    expect(vodExtractor._NAME).toBe("twitch:vod");
  });

  test("extract returns HLS format with access token", async () => {
    const originalFetch = globalThis.fetch;

    const mockTokenResponse = {
      data: { videoPlaybackAccessToken: { value: "token123", signature: "sig456" } },
    };
    const mockMetaResponse = {
      data: {
        video: {
          id: "1234567890",
          title: "Epic Stream VOD",
          description: "A great stream",
          lengthSeconds: 7200,
          viewCount: 50000,
          publishedAt: "2024-01-15T20:00:00Z",
          owner: { displayName: "Streamer", login: "streamer", id: "12345" },
          previewThumbnailURL: "https://vod-secure.twitch.tv/thumbnail.jpg",
        },
      },
    };

    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      const response = callCount === 1 ? mockTokenResponse : mockMetaResponse;
      return Promise.resolve(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const info = await vodExtractor.extract("https://www.twitch.tv/videos/1234567890");

    expect(info.id).toBe("1234567890");
    expect(info.title).toBe("Epic Stream VOD");
    expect(info.duration).toBe(7200);
    expect(info.uploader).toBe("Streamer");
    expect(info.formats).toBeDefined();
    expect(info.formats!.length).toBeGreaterThan(0);

    const hlsFormat = info.formats!.find((f) => f.protocol === "m3u8");
    expect(hlsFormat).toBeDefined();
    expect(hlsFormat!.url).toContain("usher.twitchapps.com");
    expect(hlsFormat!.url).toContain("sig456");
    expect(hlsFormat!.url).toContain("token123");

    globalThis.fetch = originalFetch;
  });

  test("extract throws ExtractorError on GQL failure", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 401 }))
    );

    await expect(
      vodExtractor.extract("https://www.twitch.tv/videos/9999999999")
    ).rejects.toThrow(ExtractorError);

    globalThis.fetch = originalFetch;
  });
});

describe("TwitchClipExtractor", () => {
  test("canHandle matches clip URL with channel", () => {
    expect(
      clipExtractor.canHandle("https://www.twitch.tv/streamer/clip/AwesomeClip")
    ).toBe(true);
  });

  test("canHandle matches clips.twitch.tv URL", () => {
    expect(clipExtractor.canHandle("https://clips.twitch.tv/AwesomeClip")).toBe(true);
  });

  test("canHandle rejects VOD URL", () => {
    expect(clipExtractor.canHandle("https://www.twitch.tv/videos/123456")).toBe(false);
  });

  test("_NAME is twitch:clip", () => {
    expect(clipExtractor._NAME).toBe("twitch:clip");
  });

  test("extract returns clip formats with quality variants", async () => {
    const originalFetch = globalThis.fetch;

    const mockResponse = {
      data: {
        clip: {
          id: "clip123",
          slug: "AwesomeClip",
          title: "Amazing Play",
          durationSeconds: 30,
          viewCount: 10000,
          createdAt: "2024-01-10T15:30:00Z",
          broadcaster: { displayName: "Streamer", login: "streamer", id: "12345" },
          thumbnailURL: "https://clips-media-assets2.twitch.tv/thumb.jpg",
          playbackAccessToken: { value: "cliptoken", signature: "clipsig" },
          videoQualities: [
            { quality: "1080", frameRate: 60, sourceURL: "https://clips-media.twitch.tv/clip-1080.mp4" },
            { quality: "720", frameRate: 30, sourceURL: "https://clips-media.twitch.tv/clip-720.mp4" },
            { quality: "480", frameRate: 30, sourceURL: "https://clips-media.twitch.tv/clip-480.mp4" },
          ],
        },
      },
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const info = await clipExtractor.extract("https://clips.twitch.tv/AwesomeClip");

    expect(info.id).toBe("clip123");
    expect(info.title).toBe("Amazing Play");
    expect(info.duration).toBe(30);
    expect(info.formats).toBeDefined();
    expect(info.formats!.length).toBe(3);

    const highestQuality = info.formats!.find((f) => f.format_id === "clip-1080");
    expect(highestQuality).toBeDefined();
    expect(highestQuality!.height).toBe(1080);
    expect(highestQuality!.url).toContain("clipsig");

    globalThis.fetch = originalFetch;
  });
});

describe("TwitchLiveExtractor", () => {
  test("canHandle matches live channel URL", () => {
    expect(liveExtractor.canHandle("https://www.twitch.tv/streamer")).toBe(true);
    expect(liveExtractor.canHandle("https://twitch.tv/streamer")).toBe(true);
  });

  test("canHandle rejects VOD URL", () => {
    expect(liveExtractor.canHandle("https://www.twitch.tv/videos/123456")).toBe(false);
  });

  test("_NAME is twitch:live", () => {
    expect(liveExtractor._NAME).toBe("twitch:live");
  });

  test("extract returns HLS live stream URL", async () => {
    const originalFetch = globalThis.fetch;

    const mockTokenResponse = {
      data: { streamPlaybackAccessToken: { value: "livetoken", signature: "livesig" } },
    };
    const mockStreamResponse = {
      data: {
        user: {
          stream: {
            id: "stream123",
            title: "Playing Games Live",
            viewersCount: 5000,
            previewImageURL: "https://static-cdn.jtvnw.net/previews-ttv/thumb.jpg",
            broadcaster: { displayName: "Streamer", login: "streamer", id: "12345" },
            game: { name: "Minecraft" },
          },
        },
      },
    };

    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      const response = callCount === 1 ? mockTokenResponse : mockStreamResponse;
      return Promise.resolve(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const info = await liveExtractor.extract("https://www.twitch.tv/streamer");

    expect(info.id).toBe("streamer");
    expect(info.title).toBe("Playing Games Live");
    expect(info.live_status).toBe("is_live");
    expect(info.view_count).toBe(5000);
    expect(info.formats).toBeDefined();

    const liveFormat = info.formats!.find((f) => f.protocol === "m3u8");
    expect(liveFormat).toBeDefined();
    expect(liveFormat!.url).toContain("usher.twitchapps.com");
    expect(liveFormat!.url).toContain("livesig");

    globalThis.fetch = originalFetch;
  });

  test("extract throws when no access token returned", async () => {
    const originalFetch = globalThis.fetch;

    const mockTokenResponse = { data: { streamPlaybackAccessToken: null } };
    const mockStreamResponse = { data: { user: null } };

    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      const response = callCount === 1 ? mockTokenResponse : mockStreamResponse;
      return Promise.resolve(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await expect(
      liveExtractor.extract("https://www.twitch.tv/offlinechannel")
    ).rejects.toThrow(ExtractorError);

    globalThis.fetch = originalFetch;
  });
});
