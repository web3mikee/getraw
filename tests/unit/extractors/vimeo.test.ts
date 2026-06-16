import { describe, test, expect, mock } from "bun:test";
import { VimeoExtractor } from "../../../src/extractors/vimeo/index";
import { ExtractorError } from "../../../src/core/types";

const extractor = new VimeoExtractor();

const mockVimeoConfig = {
  video: {
    id: 123456789,
    title: "My Vimeo Video",
    description: "A test video",
    duration: 120,
    owner: {
      name: "Video Creator",
      url: "https://vimeo.com/creator",
    },
    thumbs: {
      "640": "https://i.vimeocdn.com/video/thumb_640.jpg",
      "1280": "https://i.vimeocdn.com/video/thumb_1280.jpg",
    },
    width: 1920,
    height: 1080,
  },
  request: {
    files: {
      hls: {
        default_cdn: "fastly_skyfire",
        cdns: {
          fastly_skyfire: {
            url: "https://skyfire.vimeocdn.com/playlist.m3u8",
            avc_url: "https://skyfire.vimeocdn.com/playlist_avc.m3u8",
          },
          akfire_interconnect_quic: {
            url: "https://akfire.vimeocdn.com/playlist.m3u8",
          },
        },
      },
      dash: {
        default_cdn: "fastly_skyfire",
        cdns: {
          fastly_skyfire: {
            url: "https://skyfire.vimeocdn.com/manifest.mpd",
          },
        },
      },
      progressive: [
        {
          quality: "1080p",
          mime: "video/mp4",
          width: 1920,
          height: 1080,
          fps: 30,
          url: "https://vod-progressive.akamaized.net/video1080.mp4",
          size: 524288000,
        },
        {
          quality: "720p",
          mime: "video/mp4",
          width: 1280,
          height: 720,
          fps: 30,
          url: "https://vod-progressive.akamaized.net/video720.mp4",
          size: 262144000,
        },
        {
          quality: "360p",
          mime: "video/mp4",
          width: 640,
          height: 360,
          fps: 30,
          url: "https://vod-progressive.akamaized.net/video360.mp4",
          size: 52428800,
        },
      ],
    },
  },
};

describe("VimeoExtractor", () => {
  test("canHandle matches standard vimeo.com URL", () => {
    expect(extractor.canHandle("https://vimeo.com/123456789")).toBe(true);
  });

  test("canHandle matches player.vimeo.com URL", () => {
    expect(extractor.canHandle("https://player.vimeo.com/video/123456789")).toBe(true);
  });

  test("canHandle matches channel video URL", () => {
    expect(extractor.canHandle("https://vimeo.com/channels/mychannel/123456789")).toBe(true);
  });

  test("canHandle rejects non-vimeo URL", () => {
    expect(extractor.canHandle("https://youtube.com/watch?v=abc")).toBe(false);
  });

  test("canHandle rejects vimeo homepage", () => {
    expect(extractor.canHandle("https://vimeo.com/")).toBe(false);
  });

  test("_NAME is vimeo", () => {
    expect(extractor._NAME).toBe("vimeo");
  });

  test("extract parses all format types from config", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockVimeoConfig), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const info = await extractor.extract("https://vimeo.com/123456789");

    expect(info.id).toBe("123456789");
    expect(info.title).toBe("My Vimeo Video");
    expect(info.description).toBe("A test video");
    expect(info.duration).toBe(120);
    expect(info.uploader).toBe("Video Creator");
    expect(info.formats).toBeDefined();

    const progressive = info.formats!.filter((f) => f.format_id.startsWith("http-"));
    const hls = info.formats!.filter((f) => f.protocol === "m3u8");
    const dash = info.formats!.filter((f) => f.protocol === "dash");

    expect(progressive.length).toBe(3);
    expect(hls.length).toBeGreaterThan(0);
    expect(dash.length).toBeGreaterThan(0);

    const p1080 = progressive.find((f) => f.height === 1080);
    expect(p1080).toBeDefined();
    expect(p1080!.width).toBe(1920);
    expect(p1080!.filesize).toBe(524288000);
    expect(p1080!.vcodec).toBe("h264");

    const hlsDefault = hls.find((f) => f.source_preference === 1);
    expect(hlsDefault).toBeDefined();
    expect(hlsDefault!.url).toContain("skyfire");
    expect(hlsDefault!.url).toContain("_avc.m3u8");

    globalThis.fetch = originalFetch;
  });

  test("extract parses thumbnails from config", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockVimeoConfig), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const info = await extractor.extract("https://vimeo.com/123456789");

    expect(info.thumbnails).toBeDefined();
    expect(info.thumbnails!.length).toBe(2);
    const thumb640 = info.thumbnails!.find((t) => t.id === "640");
    expect(thumb640).toBeDefined();
    expect(thumb640!.width).toBe(640);

    globalThis.fetch = originalFetch;
  });

  test("extract throws ExtractorError when config fetch fails", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 403 }))
    );

    await expect(
      extractor.extract("https://vimeo.com/999999999")
    ).rejects.toThrow(ExtractorError);

    globalThis.fetch = originalFetch;
  });

  test("extract throws ExtractorError when no files in config", async () => {
    const originalFetch = globalThis.fetch;

    const emptyConfig = {
      video: { id: 1, title: "Test" },
      request: {},
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(emptyConfig), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(
      extractor.extract("https://vimeo.com/123456789")
    ).rejects.toThrow(ExtractorError);

    globalThis.fetch = originalFetch;
  });

  test("extract handles HLS only (no progressive)", async () => {
    const originalFetch = globalThis.fetch;

    const hlsOnlyConfig = {
      ...mockVimeoConfig,
      request: {
        files: {
          hls: mockVimeoConfig.request.files.hls,
        },
      },
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(hlsOnlyConfig), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const info = await extractor.extract("https://vimeo.com/123456789");
    expect(info.formats!.length).toBeGreaterThan(0);
    expect(info.formats!.every((f) => f.protocol === "m3u8")).toBe(true);

    globalThis.fetch = originalFetch;
  });

  test("webpage_url is always canonical vimeo URL", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockVimeoConfig), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const info = await extractor.extract("https://player.vimeo.com/video/123456789");
    expect(info.webpage_url).toBe("https://vimeo.com/123456789");

    globalThis.fetch = originalFetch;
  });
});
