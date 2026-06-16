import { describe, test, expect, mock } from "bun:test";
import { InstagramExtractor } from "../../../src/extractors/instagram/index";
import { InstagramReelsExtractor } from "../../../src/extractors/instagram/reels";
import { ExtractorError } from "../../../src/core/types";

const MOCK_MEDIA_NODE = {
  id: "123456789",
  shortcode: "CXyAbCdEfGh",
  is_video: true,
  video_url: "https://scontent.cdninstagram.com/video.mp4",
  display_url: "https://scontent.cdninstagram.com/thumb.jpg",
  dimensions: { width: 1080, height: 1920 },
  video_view_count: 250000,
  video_duration: 30.5,
  taken_at_timestamp: 1700000000,
  edge_liked_by: { count: 10000 },
  edge_media_to_comment: { count: 500 },
  edge_media_to_caption: {
    edges: [{ node: { text: "Amazing reel! #instagram #reels" } }],
  },
  owner: {
    id: "9876543210",
    username: "coolcreator",
    full_name: "Cool Creator",
    profile_pic_url: "https://scontent.cdninstagram.com/profile.jpg",
  },
  thumbnail_resources: [
    { src: "https://scontent.cdninstagram.com/thumb_150.jpg", config_width: 150, config_height: 150 },
    { src: "https://scontent.cdninstagram.com/thumb_640.jpg", config_width: 640, config_height: 640 },
  ],
};

describe("InstagramExtractor", () => {
  const extractor = new InstagramExtractor();

  test("canHandle matches instagram.com post URLs", () => {
    expect(extractor.canHandle("https://www.instagram.com/p/CXyAbCdEfGh/")).toBe(true);
    expect(extractor.canHandle("https://instagram.com/p/CXyAbCdEfGh")).toBe(true);
  });

  test("canHandle matches instagram.com reel URLs", () => {
    expect(extractor.canHandle("https://www.instagram.com/reel/CXyAbCdEfGh/")).toBe(true);
    expect(extractor.canHandle("https://instagram.com/reel/CXyAbCdEfGh")).toBe(true);
  });

  test("canHandle rejects non-post URLs", () => {
    expect(extractor.canHandle("https://instagram.com/user/")).toBe(false);
    expect(extractor.canHandle("https://youtube.com/watch?v=abc")).toBe(false);
  });

  test("_NAME is instagram", () => {
    expect(extractor._NAME).toBe("instagram");
  });

  test("extract returns info from API endpoint", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ graphql: { shortcode_media: MOCK_MEDIA_NODE } }),
      } as Response),
    );

    try {
      const info = await extractor.extract("https://www.instagram.com/p/CXyAbCdEfGh/");

      expect(info.id).toBe("123456789");
      expect(info.title).toBe("Amazing reel! #instagram #reels");
      expect(info.description).toBe("Amazing reel! #instagram #reels");
      expect(info.uploader).toBe("Cool Creator");
      expect(info.uploader_id).toBe("coolcreator");
      expect(info.uploader_url).toBe("https://www.instagram.com/coolcreator/");
      expect(info.view_count).toBe(250000);
      expect(info.like_count).toBe(10000);
      expect(info.comment_count).toBe(500);
      expect(info.duration).toBe(30.5);
      expect(info.extractor).toBe("instagram");
      expect(info.extractor_key).toBe("InstagramExtractor");

      expect(info.formats).toBeDefined();
      expect(info.formats!.length).toBe(1);
      expect(info.formats![0].url).toBe("https://scontent.cdninstagram.com/video.mp4");
      expect(info.formats![0].ext).toBe("mp4");

      expect(info.thumbnails).toBeDefined();
      expect(info.thumbnails!.length).toBeGreaterThan(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("extract falls back to page scraping when API fails", async () => {
    const mockHtml = `<!DOCTYPE html>
<html>
<body>
<script>
window._sharedData = {"entry_data":{"PostPage":[{"graphql":{"shortcode_media":${JSON.stringify(MOCK_MEDIA_NODE)}}}]}};
</script>
</body>
</html>`;

    const originalFetch = global.fetch;
    let callCount = 0;
    global.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 401, statusText: "Unauthorized" } as Response);
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      } as Response);
    });

    try {
      const info = await extractor.extract("https://www.instagram.com/p/CXyAbCdEfGh/");
      expect(info.id).toBe("123456789");
      expect(info.uploader_id).toBe("coolcreator");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("extract handles carousel posts", async () => {
    const carouselMedia = {
      ...MOCK_MEDIA_NODE,
      is_video: false,
      video_url: undefined,
      edge_sidecar_to_children: {
        edges: [
          {
            node: {
              id: "child1",
              shortcode: "child1short",
              is_video: true,
              video_url: "https://scontent.cdninstagram.com/video1.mp4",
              display_url: "https://scontent.cdninstagram.com/thumb1.jpg",
              dimensions: { width: 1080, height: 1080 },
            },
          },
          {
            node: {
              id: "child2",
              shortcode: "child2short",
              is_video: false,
              display_url: "https://scontent.cdninstagram.com/photo2.jpg",
              dimensions: { width: 1080, height: 1080 },
            },
          },
        ],
      },
    };

    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ graphql: { shortcode_media: carouselMedia } }),
      } as Response),
    );

    try {
      const info = await extractor.extract("https://www.instagram.com/p/CXyAbCdEfGh/");
      expect(info._type).toBe("playlist");
      expect(info.entries).toBeDefined();
      expect(info.entries!.length).toBe(2);

      const videoEntry = info.entries!.find((e) => e._type === "video");
      expect(videoEntry).toBeDefined();
      expect(videoEntry!.formats![0].url).toBe(
        "https://scontent.cdninstagram.com/video1.mp4",
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("extract throws when all strategies fail", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve("<html><body>No data</body></html>"),
      } as Response),
    );

    try {
      await expect(
        extractor.extract("https://www.instagram.com/p/NOTFOUND/"),
      ).rejects.toThrow(ExtractorError);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("InstagramReelsExtractor", () => {
  const extractor = new InstagramReelsExtractor();

  test("canHandle matches instagram.com/reels/ URL", () => {
    expect(extractor.canHandle("https://www.instagram.com/reels/")).toBe(true);
    expect(extractor.canHandle("https://instagram.com/reels/")).toBe(true);
    expect(extractor.canHandle("https://www.instagram.com/reel/")).toBe(true);
  });

  test("canHandle rejects non-reels-feed URLs", () => {
    expect(extractor.canHandle("https://www.instagram.com/p/CXyAbCdEfGh/")).toBe(false);
    expect(extractor.canHandle("https://www.instagram.com/user/")).toBe(false);
  });

  test("_NAME is instagram:reels", () => {
    expect(extractor._NAME).toBe("instagram:reels");
  });

  test("extract returns playlist from GraphQL response", async () => {
    const mockReelsResponse = {
      data: {
        xdt_api__v1__clips__home__connection_v2: {
          edges: [
            {
              node: {
                media: {
                  id: "reel1id",
                  shortcode: "reel1short",
                  is_video: true,
                  video_url: "https://scontent.cdninstagram.com/reel1.mp4",
                  display_url: "https://scontent.cdninstagram.com/reel1_thumb.jpg",
                  dimensions: { width: 1080, height: 1920 },
                  video_view_count: 10000,
                  video_duration: 15,
                  taken_at_timestamp: 1700000000,
                  edge_liked_by: { count: 500 },
                  edge_media_to_comment: { count: 50 },
                  edge_media_to_caption: { edges: [{ node: { text: "Cool reel!" } }] },
                  owner: { id: "111", username: "creator1", full_name: "Creator One" },
                },
              },
            },
          ],
          page_info: { end_cursor: null, has_next_page: false },
        },
      },
    };

    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockReelsResponse),
      } as Response),
    );

    try {
      const info = await extractor.extract("https://www.instagram.com/reels/");
      expect(info._type).toBe("playlist");
      expect(info.id).toBe("instagram-reels");
      expect(info.entries).toBeDefined();
      expect(info.entries!.length).toBe(1);

      const reel = info.entries![0];
      expect(reel.id).toBe("reel1id");
      expect(reel.title).toBe("Cool reel!");
      expect(reel.formats![0].url).toBe("https://scontent.cdninstagram.com/reel1.mp4");
      expect(reel.view_count).toBe(10000);
      expect(reel.duration).toBe(15);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
