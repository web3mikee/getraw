import { describe, test, expect, mock } from "bun:test";
import { TikTokExtractor } from "../../../src/extractors/tiktok/index";
import { TikTokUserExtractor } from "../../../src/extractors/tiktok/user";
import { ExtractorError } from "../../../src/core/types";

const MOCK_ITEM_STRUCT = {
  id: "7123456789012345678",
  desc: "Cool video #fyp #trending",
  createTime: 1700000000,
  author: {
    uniqueId: "coolcreator",
    nickname: "Cool Creator",
    id: "123456789",
    avatarThumb: "https://p16-sign.tiktokcdn-us.com/avatar.jpg",
  },
  music: {
    title: "Original Sound",
    authorName: "coolcreator",
    id: "987654321",
  },
  video: {
    playAddr: "https://v19.tiktok.com/play/video.mp4",
    downloadAddr: "https://v19.tiktok.com/download/video.mp4",
    width: 1080,
    height: 1920,
    duration: 15,
    bitrate: 2000000,
    format: "mp4",
    codecType: "h264",
    cover: "https://p16.tiktok.com/cover.jpg",
    dynamicCover: "https://p16.tiktok.com/dynamic_cover.webp",
    originCover: "https://p16.tiktok.com/origin_cover.jpg",
  },
  stats: {
    diggCount: 50000,
    shareCount: 1000,
    commentCount: 500,
    playCount: 1000000,
  },
  textExtra: [{ hashtagName: "fyp" }, { hashtagName: "trending" }],
};

const MOCK_REHYDRATION_JSON = JSON.stringify({
  __DEFAULT_SCOPE__: {
    "webapp.video-detail": {
      itemInfo: {
        itemStruct: MOCK_ITEM_STRUCT,
      },
    },
  },
});

const MOCK_HTML = `<!DOCTYPE html>
<html>
<head><title>TikTok</title></head>
<body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${MOCK_REHYDRATION_JSON}</script>
</body>
</html>`;

describe("TikTokExtractor", () => {
  const extractor = new TikTokExtractor();

  test("canHandle matches tiktok.com video URLs", () => {
    expect(extractor.canHandle("https://www.tiktok.com/@user/video/7123456789012345678")).toBe(true);
    expect(extractor.canHandle("https://tiktok.com/@creator.name/video/1234567890123456789")).toBe(true);
  });

  test("canHandle matches vm.tiktok.com short URLs", () => {
    expect(extractor.canHandle("https://vm.tiktok.com/ZMeABCDEF/")).toBe(true);
    expect(extractor.canHandle("https://vm.tiktok.com/ABC123/")).toBe(true);
  });

  test("canHandle rejects non-tiktok URLs", () => {
    expect(extractor.canHandle("https://tiktok.com/@user")).toBe(false);
    expect(extractor.canHandle("https://youtube.com/watch?v=abc")).toBe(false);
  });

  test("_NAME is tiktok", () => {
    expect(extractor._NAME).toBe("tiktok");
  });

  test("extract returns correct info from rehydration data", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        url: "https://www.tiktok.com/@coolcreator/video/7123456789012345678",
        text: () => Promise.resolve(MOCK_HTML),
      } as Response),
    );

    try {
      const info = await extractor.extract(
        "https://www.tiktok.com/@coolcreator/video/7123456789012345678",
      );

      expect(info.id).toBe("7123456789012345678");
      expect(info.title).toBe("Cool video #fyp #trending");
      expect(info.description).toBe("Cool video #fyp #trending");
      expect(info.uploader).toBe("Cool Creator");
      expect(info.uploader_id).toBe("coolcreator");
      expect(info.uploader_url).toBe("https://www.tiktok.com/@coolcreator");
      expect(info.duration).toBe(15);
      expect(info.view_count).toBe(1000000);
      expect(info.like_count).toBe(50000);
      expect(info.comment_count).toBe(500);
      expect(info.tags).toEqual(["fyp", "trending"]);
      expect(info.extractor).toBe("tiktok");

      expect(info.formats).toBeDefined();
      expect(info.formats!.length).toBeGreaterThanOrEqual(1);

      const downloadFormat = info.formats!.find((f) => f.format_id === "download");
      expect(downloadFormat).toBeDefined();
      expect(downloadFormat!.url).toBe("https://v19.tiktok.com/download/video.mp4");
      expect(downloadFormat!.width).toBe(1080);
      expect(downloadFormat!.height).toBe(1920);

      expect(info.thumbnails).toBeDefined();
      expect(info.thumbnails!.length).toBeGreaterThan(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("extract throws ExtractorError when rehydration data is missing", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        url: "https://www.tiktok.com/@user/video/1234567890",
        text: () => Promise.resolve("<html><body>No data here</body></html>"),
      } as Response),
    );

    try {
      await expect(
        extractor.extract("https://www.tiktok.com/@user/video/1234567890"),
      ).rejects.toThrow(ExtractorError);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("extract throws ExtractorError on page fetch failure", async () => {
    const originalFetch = global.fetch;
    global.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
        url: "https://www.tiktok.com/@user/video/1234567890",
      } as Response),
    );

    try {
      await expect(
        extractor.extract("https://www.tiktok.com/@user/video/1234567890"),
      ).rejects.toThrow(ExtractorError);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("TikTokUserExtractor", () => {
  const extractor = new TikTokUserExtractor();

  test("canHandle matches tiktok.com user profile URLs", () => {
    expect(extractor.canHandle("https://www.tiktok.com/@coolcreator")).toBe(true);
    expect(extractor.canHandle("https://tiktok.com/@creator.name")).toBe(true);
    expect(extractor.canHandle("https://www.tiktok.com/@user123/")).toBe(true);
  });

  test("canHandle rejects video and other URLs", () => {
    expect(
      extractor.canHandle("https://www.tiktok.com/@user/video/123456789"),
    ).toBe(false);
    expect(extractor.canHandle("https://youtube.com/@channel")).toBe(false);
  });

  test("_NAME is tiktok:user", () => {
    expect(extractor._NAME).toBe("tiktok:user");
  });

  test("extract returns playlist InfoDict", async () => {
    const mockUserRehydration = JSON.stringify({
      __DEFAULT_SCOPE__: {
        "webapp.user-detail": {
          userInfo: {
            user: {
              id: "123456789",
              uniqueId: "coolcreator",
              nickname: "Cool Creator",
              signature: "Creating cool content",
            },
            stats: { videoCount: 2 },
          },
        },
      },
    });

    const mockUserHtml = `<!DOCTYPE html>
<html>
<body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${mockUserRehydration}</script>
</body>
</html>`;

    const mockVideoList = {
      itemList: [
        {
          id: "1111111111",
          desc: "First video",
          createTime: 1700000000,
          video: { cover: "https://p16.tiktok.com/cover1.jpg" },
        },
        {
          id: "2222222222",
          desc: "Second video",
          createTime: 1700000100,
          video: { cover: "https://p16.tiktok.com/cover2.jpg" },
        },
      ],
      hasMore: false,
      maxCursor: 2,
    };

    const originalFetch = global.fetch;
    let callCount = 0;
    global.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockUserHtml),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockVideoList),
      } as Response);
    });

    try {
      const info = await extractor.extract("https://www.tiktok.com/@coolcreator");
      expect(info._type).toBe("playlist");
      expect(info.id).toBe("123456789");
      expect(info.uploader_id).toBe("coolcreator");
      expect(info.entries).toBeDefined();
      expect(info.entries!.length).toBe(2);
      expect(info.entries![0].id).toBe("1111111111");
      expect(info.entries![1].id).toBe("2222222222");
      expect(info.playlist_count).toBe(2);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
