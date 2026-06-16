import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { RedditExtractor } from "../../../src/extractors/reddit/index";
import { RedditGalleryExtractor } from "../../../src/extractors/reddit/gallery";
import { ExtractorError } from "../../../src/core/types";

const redditExtractor = new RedditExtractor();
const galleryExtractor = new RedditGalleryExtractor();

describe("RedditExtractor", () => {
  test("canHandle matches standard reddit video URL", () => {
    expect(redditExtractor.canHandle("https://www.reddit.com/r/videos/comments/abc123/my_video/")).toBe(true);
  });

  test("canHandle matches old.reddit.com URL", () => {
    expect(redditExtractor.canHandle("https://old.reddit.com/r/funny/comments/xyz789/title/")).toBe(true);
  });

  test("canHandle matches v.redd.it URL", () => {
    expect(redditExtractor.canHandle("https://v.redd.it/abc123def")).toBe(true);
  });

  test("canHandle rejects non-reddit URL", () => {
    expect(redditExtractor.canHandle("https://youtube.com/watch?v=abc")).toBe(false);
  });

  test("canHandle rejects reddit non-video URL", () => {
    expect(redditExtractor.canHandle("https://www.reddit.com/r/pics/")).toBe(false);
  });

  test("_NAME is reddit", () => {
    expect(redditExtractor._NAME).toBe("reddit");
  });

  test("extract throws ExtractorError on failed fetch", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 404 })));

    await expect(
      redditExtractor.extract("https://www.reddit.com/r/videos/comments/abc123/title/")
    ).rejects.toThrow(ExtractorError);

    globalThis.fetch = originalFetch;
  });

  test("extract parses reddit video JSON response", async () => {
    const originalFetch = globalThis.fetch;

    const mockPostData = {
      id: "abc123",
      title: "Test Video",
      author: "testuser",
      url: "https://v.redd.it/xyz",
      score: 1000,
      created_utc: 1700000000,
      secure_media: {
        reddit_video: {
          dash_url: "https://v.redd.it/xyz/DASHPlaylist.mpd",
          fallback_url: "https://v.redd.it/xyz/DASH_720.mp4",
          width: 1280,
          height: 720,
          duration: 30,
        },
      },
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            { data: { children: [{ data: mockPostData }] } },
            { data: { children: [] } },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const info = await redditExtractor.extract(
      "https://www.reddit.com/r/videos/comments/abc123/title/"
    );

    expect(info.id).toBe("abc123");
    expect(info.title).toBe("Test Video");
    expect(info.uploader).toBe("testuser");
    expect(info.duration).toBe(30);
    expect(info.formats).toBeDefined();
    expect(info.formats!.length).toBeGreaterThan(0);

    const hasVideoFormat = info.formats!.some((f) => f.format_id === "mp4-video-only");
    const hasDashFormat = info.formats!.some((f) => f.format_id === "dash");
    expect(hasVideoFormat).toBe(true);
    expect(hasDashFormat).toBe(true);

    globalThis.fetch = originalFetch;
  });

  test("extract throws ExtractorError when no video data", async () => {
    const originalFetch = globalThis.fetch;

    const mockPostData = {
      id: "abc123",
      title: "Text Post",
      author: "testuser",
      url: "https://www.reddit.com/r/text/comments/abc123/",
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([{ data: { children: [{ data: mockPostData }] } }]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(
      redditExtractor.extract("https://www.reddit.com/r/text/comments/abc123/title/")
    ).rejects.toThrow(ExtractorError);

    globalThis.fetch = originalFetch;
  });
});

describe("RedditGalleryExtractor", () => {
  test("canHandle matches gallery URL", () => {
    expect(galleryExtractor.canHandle("https://www.reddit.com/gallery/abc123")).toBe(true);
  });

  test("canHandle matches gallery post URL", () => {
    expect(
      galleryExtractor.canHandle(
        "https://www.reddit.com/r/aww/comments/abc123/my_gallery/"
      )
    ).toBe(true);
  });

  test("_NAME is reddit:gallery", () => {
    expect(galleryExtractor._NAME).toBe("reddit:gallery");
  });

  test("extract returns playlist type for gallery post", async () => {
    const originalFetch = globalThis.fetch;

    const mockPostData = {
      id: "gal123",
      title: "My Gallery",
      author: "galleryuser",
      score: 500,
      created_utc: 1700000000,
      gallery_data: {
        items: [
          { media_id: "img1", id: 1, caption: "First image" },
          { media_id: "img2", id: 2 },
        ],
      },
      media_metadata: {
        img1: {
          e: "Image",
          m: "image/jpg",
          id: "img1",
          s: { u: "https://i.redd.it/img1.jpg", x: 1920, y: 1080 },
          p: [{ u: "https://i.redd.it/img1_preview.jpg", x: 640, y: 360 }],
        },
        img2: {
          e: "Image",
          m: "image/png",
          id: "img2",
          s: { u: "https://i.redd.it/img2.png", x: 800, y: 600 },
          p: [],
        },
      },
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([{ data: { children: [{ data: mockPostData }] } }]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const info = await galleryExtractor.extract(
      "https://www.reddit.com/r/aww/comments/gal123/my_gallery/"
    );

    expect(info._type).toBe("playlist");
    expect(info.id).toBe("gal123");
    expect(info.title).toBe("My Gallery");
    expect(info.entries).toBeDefined();
    expect(info.entries!.length).toBe(2);
    expect(info.playlist_count).toBe(2);
    expect(info.entries![0].title).toBe("First image");

    globalThis.fetch = originalFetch;
  });

  test("extract throws ExtractorError when no gallery data", async () => {
    const originalFetch = globalThis.fetch;

    const mockPostData = {
      id: "txt123",
      title: "Text Post",
      author: "user",
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([{ data: { children: [{ data: mockPostData }] } }]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(
      galleryExtractor.extract("https://www.reddit.com/r/text/comments/txt123/title/")
    ).rejects.toThrow(ExtractorError);

    globalThis.fetch = originalFetch;
  });
});
