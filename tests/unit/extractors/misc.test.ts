import { describe, expect, test, mock } from "bun:test";
import { DailymotionExtractor } from "../../../src/extractors/dailymotion";
import { RumbleExtractor } from "../../../src/extractors/rumble";
import { BandcampExtractor } from "../../../src/extractors/bandcamp";
import { SpotifyExtractor } from "../../../src/extractors/spotify";
import { PeerTubeExtractor } from "../../../src/extractors/peertube";
import { OdyseeExtractor } from "../../../src/extractors/odysee";
import { StreamableExtractor } from "../../../src/extractors/streamable";
import { ImgurExtractor } from "../../../src/extractors/imgur";
import { CoubExtractor } from "../../../src/extractors/coub";
import { TEDExtractor } from "../../../src/extractors/ted";
import { ArchiveOrgExtractor } from "../../../src/extractors/archive-org";
import { DropboxExtractor } from "../../../src/extractors/dropbox";
import { GoogleDriveExtractor } from "../../../src/extractors/google-drive";

describe("DailymotionExtractor URL matching", () => {
  const extractor = new DailymotionExtractor();

  const validUrls = [
    "https://www.dailymotion.com/video/x7xvpcd",
    "https://www.dailymotion.com/video/x7xvpcd_some-title",
    "http://www.dailymotion.com/video/abc123",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://dailymotion.com/",
    "https://www.dailymotion.com/",
    "https://vimeo.com/123",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("dailymotion");
  });
});

describe("DailymotionExtractor parsing", () => {
  test("parses metadata and formats from API response", async () => {
    const extractor = new DailymotionExtractor();

    const mockApiResponse = {
      id: "x7xvpcd",
      title: "Test Video",
      description: "A test video",
      duration: 120,
      owner: { screenname: "TestUser", id: "usr123" },
      created_time: 1700000000,
      views_total: 5000,
      likes_total: 200,
      thumbnail_url: "https://s1.dmcdn.net/thumb.jpg",
      qualities: {
        "720": [{ type: "video/mp4", url: "https://cdn.dmcdn.net/720p.mp4" }],
        "480": [{ type: "video/mp4", url: "https://cdn.dmcdn.net/480p.mp4" }],
        auto: [{ type: "application/x-mpegURL", url: "https://cdn.dmcdn.net/master.m3u8" }],
      },
    };

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockApiResponse), { status: 200 }))
    ) as typeof fetch;

    const info = await extractor.extract("https://www.dailymotion.com/video/x7xvpcd");

    expect(info.id).toBe("x7xvpcd");
    expect(info.title).toBe("Test Video");
    expect(info.duration).toBe(120);
    expect(info.uploader).toBe("TestUser");
    expect(info.view_count).toBe(5000);
    expect(info.formats).toBeDefined();
    expect(info.formats!.length).toBeGreaterThan(0);
    expect(info.formats!.some((f) => f.ext === "mp4")).toBe(true);
    expect(info.thumbnails).toBeDefined();
    expect(info.thumbnails![0].url).toBe("https://s1.dmcdn.net/thumb.jpg");
  });
});

describe("RumbleExtractor URL matching", () => {
  const extractor = new RumbleExtractor();

  const validUrls = [
    "https://rumble.com/vabc123-some-title.html",
    "https://www.rumble.com/vabc123-test.html",
    "https://rumble.com/embed/vabc123",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://rumble.com/",
    "https://rumble.com/user/",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("rumble");
  });
});

describe("BandcampExtractor URL matching", () => {
  const extractor = new BandcampExtractor();

  const validUrls = [
    "https://artist.bandcamp.com/track/some-track",
    "https://artist.bandcamp.com/album/some-album",
    "https://someartist.bandcamp.com/track/my-song",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://bandcamp.com/",
    "https://artist.bandcamp.com/",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("bandcamp");
  });
});

describe("BandcampExtractor parsing", () => {
  test("parses single track from data-tralbum", async () => {
    const extractor = new BandcampExtractor();

    const tralbumData = {
      current: { id: 12345, title: "My Track", type: "track" },
      artist: "Test Artist",
      art_id: 999,
      trackinfo: [
        {
          id: 12345,
          title: "My Track",
          duration: 180,
          has_audio: true,
          track_num: 1,
          file: { "mp3-128": "https://t4.bcbits.com/stream/abc123" },
        },
      ],
    };

    const htmlContent = `<html><head><title>My Track by Test Artist</title></head><body>
      <div data-tralbum="${JSON.stringify(tralbumData).replace(/"/g, "&quot;")}"></div>
    </body></html>`;

    global.fetch = mock(() =>
      Promise.resolve(new Response(htmlContent, { status: 200 }))
    ) as typeof fetch;

    const info = await extractor.extract("https://artist.bandcamp.com/track/my-track");

    expect(info.id).toBe("12345");
    expect(info.title).toBe("My Track");
    expect(info.uploader).toBe("Test Artist");
    expect(info.duration).toBe(180);
    expect(info.formats).toBeDefined();
    expect(info.formats!.length).toBeGreaterThan(0);
    expect(info.formats![0].ext).toBe("mp3");
  });

  test("parses album as playlist", async () => {
    const extractor = new BandcampExtractor();

    const tralbumData = {
      current: { id: 99999, title: "My Album", type: "album" },
      artist: "Test Artist",
      trackinfo: [
        {
          id: 1,
          title: "Track One",
          duration: 120,
          has_audio: true,
          track_num: 1,
          file: { "mp3-128": "https://t4.bcbits.com/stream/track1" },
        },
        {
          id: 2,
          title: "Track Two",
          duration: 200,
          has_audio: true,
          track_num: 2,
          file: { "mp3-128": "https://t4.bcbits.com/stream/track2" },
        },
      ],
    };

    const htmlContent = `<html><body>
      <div data-tralbum="${JSON.stringify(tralbumData).replace(/"/g, "&quot;")}"></div>
    </body></html>`;

    global.fetch = mock(() =>
      Promise.resolve(new Response(htmlContent, { status: 200 }))
    ) as typeof fetch;

    const info = await extractor.extract("https://artist.bandcamp.com/album/my-album");

    expect(info._type).toBe("playlist");
    expect(info.entries).toHaveLength(2);
    expect(info.playlist_count).toBe(2);
    expect(info.entries![0].title).toBe("Track One");
    expect(info.entries![1].title).toBe("Track Two");
  });
});

describe("SpotifyExtractor URL matching", () => {
  const extractor = new SpotifyExtractor();

  const validUrls = [
    "https://open.spotify.com/episode/5678abc",
    "https://open.spotify.com/episode/1234567890abcdef",
  ];

  const invalidUrls = [
    "https://open.spotify.com/track/abc",
    "https://open.spotify.com/album/abc",
    "https://open.spotify.com/",
    "https://www.youtube.com/watch?v=abc",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("spotify");
  });
});

describe("SpotifyExtractor parsing", () => {
  test("extracts audio preview from page data", async () => {
    const extractor = new SpotifyExtractor();

    const nextData = {
      props: {
        pageProps: {
          episode: {
            name: "Test Episode",
            description: "A podcast episode",
            duration_ms: 3600000,
            audio_preview_url: "https://p.scdn.co/mp3-preview/abc123",
            show: { name: "Test Podcast" },
            images: [{ url: "https://i.scdn.co/image/thumb.jpg", width: 300, height: 300 }],
          },
        },
      },
    };

    const html = `<html><head></head><body>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
    </body></html>`;

    global.fetch = mock(() =>
      Promise.resolve(new Response(html, { status: 200 }))
    ) as typeof fetch;

    const info = await extractor.extract("https://open.spotify.com/episode/5678abc");

    expect(info.id).toBe("5678abc");
    expect(info.title).toBe("Test Episode");
    expect(info.uploader).toBe("Test Podcast");
    expect(info.duration).toBe(3600);
    expect(info.url).toBe("https://p.scdn.co/mp3-preview/abc123");
    expect(info.formats![0].format_note).toContain("preview");
  });
});

describe("PeerTubeExtractor URL matching", () => {
  const extractor = new PeerTubeExtractor();

  const validUrls = [
    "https://peertube.social/videos/watch/abc123-def456",
    "https://video.ploud.fr/videos/watch/abc123",
    "https://peertube.example.com/w/abc123",
    "https://instance.tld/videos/embed/abc123",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://peertube.social/",
    "https://peertube.social/api/v1/videos",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("peertube");
  });
});

describe("PeerTubeExtractor parsing", () => {
  test("parses video files and HLS streams", async () => {
    const extractor = new PeerTubeExtractor();

    const apiResponse = {
      uuid: "abc123-def456",
      name: "PeerTube Video",
      description: "A video on PeerTube",
      duration: 300,
      views: 1000,
      likes: 50,
      publishedAt: "2024-01-01T00:00:00.000Z",
      thumbnailUrl: "/static/thumbnails/abc.jpg",
      account: { displayName: "Test User", name: "testuser", url: "https://peertube.social/accounts/testuser" },
      channel: { displayName: "Test Channel", name: "testchannel", url: "https://peertube.social/c/testchannel" },
      files: [
        {
          fileUrl: "https://peertube.social/static/web-videos/abc-1080.mp4",
          resolution: { id: 1080, label: "1080p" },
          size: 100000000,
          fps: 30,
        },
        {
          fileUrl: "https://peertube.social/static/web-videos/abc-720.mp4",
          resolution: { id: 720, label: "720p" },
          size: 50000000,
          fps: 30,
        },
      ],
      streamingPlaylists: [
        { playlistUrl: "https://peertube.social/static/streaming-playlists/hls/abc/master.m3u8", type: 1 },
      ],
    };

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(apiResponse), { status: 200 }))
    ) as typeof fetch;

    const info = await extractor.extract("https://peertube.social/videos/watch/abc123-def456");

    expect(info.id).toBe("abc123-def456");
    expect(info.title).toBe("PeerTube Video");
    expect(info.duration).toBe(300);
    expect(info.uploader).toBe("Test User");
    expect(info.formats).toBeDefined();
    const mp4Formats = info.formats!.filter((f) => !f.protocol);
    expect(mp4Formats.length).toBe(2);
    expect(mp4Formats.some((f) => f.height === 1080)).toBe(true);
    const hlsFormats = info.formats!.filter((f) => f.protocol === "m3u8");
    expect(hlsFormats.length).toBe(1);
  });
});

describe("OdyseeExtractor URL matching", () => {
  const extractor = new OdyseeExtractor();

  const validUrls = [
    "https://odysee.com/@SomeChannel:a/video-title:b",
    "https://www.odysee.com/@Channel:c/some-video:d",
    "https://lbry.tv/@Channel:a/video:b",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://odysee.com/",
    "https://odysee.com/@channel",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("odysee");
  });
});

describe("StreamableExtractor URL matching", () => {
  const extractor = new StreamableExtractor();

  const validUrls = [
    "https://streamable.com/abc123",
    "https://www.streamable.com/xyz789",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://streamable.com/",
    "https://notstreamable.com/abc",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("streamable");
  });
});

describe("StreamableExtractor parsing", () => {
  test("extracts video sources from __NEXT_DATA__", async () => {
    const extractor = new StreamableExtractor();

    const nextData = {
      props: {
        pageProps: {
          video: {
            title: "Streamable Test",
            thumbnail_url: "//cdn.streamable.com/thumb.jpg",
            duration: 15,
            files: {
              mp4: { url: "//cdn.streamable.com/video/mp4/abc123.mp4", width: 1920, height: 1080, bitrate: 5000 },
              "mp4-mobile": { url: "//cdn.streamable.com/video/mp4-mobile/abc123.mp4", width: 720, height: 480 },
            },
          },
        },
      },
    };

    const html = `<html><head><title>Streamable Test</title></head><body>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
    </body></html>`;

    global.fetch = mock(() =>
      Promise.resolve(new Response(html, { status: 200 }))
    ) as typeof fetch;

    const info = await extractor.extract("https://streamable.com/abc123");

    expect(info.id).toBe("abc123");
    expect(info.title).toBe("Streamable Test");
    expect(info.formats).toBeDefined();
    expect(info.formats!.some((f) => f.height === 1080)).toBe(true);
    expect(info.formats!.every((f) => f.url.startsWith("https://"))).toBe(true);
  });
});

describe("ImgurExtractor URL matching", () => {
  const extractor = new ImgurExtractor();

  const validUrls = [
    "https://imgur.com/a/abc123",
    "https://imgur.com/gallery/xyz789",
    "https://imgur.com/abc123",
    "https://i.imgur.com/abc123.gifv",
    "https://i.imgur.com/abc123.mp4",
    "https://i.imgur.com/abc123.gif",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://imgur.com/",
    "https://notimgur.com/abc",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("imgur");
  });

  test("converts .gifv URL to .mp4 directly", async () => {
    const extractor2 = new ImgurExtractor();
    const gifvUrl = "https://i.imgur.com/abc123.gifv";

    const info = await extractor2.extract(gifvUrl);
    expect(info.formats![0].url).toBe("https://i.imgur.com/abc123.mp4");
    expect(info.formats![0].ext).toBe("mp4");
  });
});

describe("CoubExtractor URL matching", () => {
  const extractor = new CoubExtractor();

  const validUrls = [
    "https://coub.com/view/abc123",
    "https://www.coub.com/view/xyz_789",
    "https://coub.com/embed/abc123",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://coub.com/",
    "https://notcoub.com/view/abc",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("coub");
  });
});

describe("CoubExtractor parsing", () => {
  test("parses video and audio as separate formats", async () => {
    const extractor = new CoubExtractor();

    const apiResponse = {
      id: 12345,
      title: "Funny Coub",
      duration: 10.5,
      views_count: 10000,
      likes_count: 500,
      created_at: "2024-01-15T10:00:00.000Z",
      channel: { title: "CoubCreator", permalink: "coubcreator" },
      file_versions: {
        html5: {
          video: {
            high: { url: "https://coubstorage.com/get/coubs/high.mp4", size: 5000000 },
            med: { url: "https://coubstorage.com/get/coubs/med.mp4", size: 2000000 },
          },
          audio: {
            high: { url: "https://coubstorage.com/get/coubs/audio.mp4", size: 1000000 },
          },
        },
      },
      image_versions: {
        template: "https://coubstorage.com/img/%{version}.jpg",
        versions: ["big"],
      },
    };

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(apiResponse), { status: 200 }))
    ) as typeof fetch;

    const info = await extractor.extract("https://coub.com/view/abc123");

    expect(info.id).toBe("12345");
    expect(info.title).toBe("Funny Coub");
    expect(info.uploader).toBe("CoubCreator");
    expect(info.formats).toBeDefined();

    const videoFormats = info.formats!.filter((f) => f.vcodec !== "none" && f.acodec === "none");
    expect(videoFormats.length).toBeGreaterThan(0);

    const audioFormats = info.formats!.filter((f) => f.vcodec === "none");
    expect(audioFormats.length).toBeGreaterThan(0);

    expect(info.formats!.some((f) => f.format_note?.includes("merge"))).toBe(true);
  });
});

describe("TEDExtractor URL matching", () => {
  const extractor = new TEDExtractor();

  const validUrls = [
    "https://www.ted.com/talks/some_speaker_talk_title",
    "https://ted.com/talks/another_great_talk",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://ted.com/",
    "https://ted.com/playlists/abc",
    "https://notted.com/talks/abc",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("ted");
  });
});

describe("TEDExtractor parsing", () => {
  test("parses talk data with video formats and subtitles", async () => {
    const extractor = new TEDExtractor();

    const playerData = {
      resources: {
        h264: [
          { bitrate: 2500, file: "https://download.ted.com/talks/talk-1080p.mp4", height: 1080, width: 1920 },
          { bitrate: 1200, file: "https://download.ted.com/talks/talk-720p.mp4", height: 720, width: 1280 },
        ],
        hls: { stream: "https://hls.ted.com/talks/talk.m3u8" },
      },
      duration: 900,
      thumb: "https://pe.tedcdn.com/thumb.jpg",
    };

    const nextData = {
      props: {
        pageProps: {
          talkData: {
            id: 9876,
            slug: "awesome_talk",
            title: "An Amazing Talk",
            description: "A fascinating presentation.",
            duration: 900,
            viewedCount: 500000,
            publishedAt: "2024-03-15T00:00:00.000Z",
            speakers: [{ firstname: "Jane", lastname: "Doe" }],
            playerData: JSON.stringify(playerData),
            subtitledDownloads: {
              en: { high: "https://download.ted.com/talks/en.srt", name: "English" },
              es: { high: "https://download.ted.com/talks/es.srt", name: "Spanish" },
            },
          },
        },
      },
    };

    const html = `<html><head><title>An Amazing Talk | TED Talk</title></head><body>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
    </body></html>`;

    global.fetch = mock(() =>
      Promise.resolve(new Response(html, { status: 200 }))
    ) as typeof fetch;

    const info = await extractor.extract("https://www.ted.com/talks/awesome_talk");

    expect(info.id).toBe("9876");
    expect(info.title).toBe("An Amazing Talk");
    expect(info.uploader).toBe("Jane Doe");
    expect(info.duration).toBe(900);
    expect(info.formats).toBeDefined();
    expect(info.formats!.some((f) => f.height === 1080)).toBe(true);
    expect(info.formats!.some((f) => f.protocol === "m3u8")).toBe(true);
    expect(info.subtitles).toBeDefined();
    expect(Object.keys(info.subtitles!)).toContain("en");
    expect(Object.keys(info.subtitles!)).toContain("es");
  });
});

describe("ArchiveOrgExtractor URL matching", () => {
  const extractor = new ArchiveOrgExtractor();

  const validUrls = [
    "https://archive.org/details/BigBuckBunny_124",
    "https://www.archive.org/details/some-video",
    "https://archive.org/download/some-item",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://archive.org/",
    "https://archive.org/search",
    "https://notarchive.org/details/abc",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("archive.org");
  });
});

describe("ArchiveOrgExtractor parsing", () => {
  test("parses video and audio files from metadata API", async () => {
    const extractor = new ArchiveOrgExtractor();

    const apiResponse = {
      metadata: {
        identifier: "BigBuckBunny_124",
        title: "Big Buck Bunny",
        creator: "Blender Foundation",
        date: "2008-04-10",
        description: "Big Buck Bunny short film",
      },
      server: "ia800100.us.archive.org",
      dir: "/0/items/BigBuckBunny_124",
      files: [
        { name: "BigBuckBunny.mp4", format: "h.264", size: "276134947", height: "1080", width: "1920", source: "original" },
        { name: "BigBuckBunny.ogv", format: "Ogg Video", size: "200000000", source: "derivative" },
        { name: "BigBuckBunny_thumb.jpg", format: "Thumbnail", size: "5000" },
      ],
    };

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(apiResponse), { status: 200 }))
    ) as typeof fetch;

    const info = await extractor.extract("https://archive.org/details/BigBuckBunny_124");

    expect(info.id).toBe("BigBuckBunny_124");
    expect(info.title).toBe("Big Buck Bunny");
    expect(info.uploader).toBe("Blender Foundation");
    expect(info.formats).toBeDefined();
    expect(info.formats!.some((f) => f.format_id === "BigBuckBunny.mp4")).toBe(true);
    expect(info.formats!.some((f) => f.quality === 2)).toBe(true);
    expect(info.formats![0].url).toContain("ia800100.us.archive.org");
  });
});

describe("DropboxExtractor URL matching", () => {
  const extractor = new DropboxExtractor();

  const validUrls = [
    "https://www.dropbox.com/s/abc123/video.mp4?dl=0",
    "https://dropbox.com/s/xyz789/file.mp4",
    "https://www.dropbox.com/sh/abc/def/video.mov",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://dropbox.com/",
    "https://dropbox.com/home",
    "https://notdropbox.com/s/abc",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("dropbox");
  });
});

describe("DropboxExtractor parsing", () => {
  test("converts share URL to direct download URL", async () => {
    const extractor = new DropboxExtractor();

    global.fetch = mock(() =>
      Promise.resolve(
        new Response(null, {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-length": "52428800",
          },
        })
      )
    ) as typeof fetch;

    const info = await extractor.extract("https://www.dropbox.com/s/abc123/my-video.mp4?dl=0");

    expect(info.id).toBeDefined();
    expect(info.title).toBe("my video");
    expect(info.formats).toBeDefined();
    expect(info.formats![0].url).toContain("dl=1");
    expect(info.formats![0].ext).toBe("mp4");
  });
});

describe("GoogleDriveExtractor URL matching", () => {
  const extractor = new GoogleDriveExtractor();

  const validUrls = [
    "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view",
    "https://docs.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view",
    "https://drive.google.com/open?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs",
    "https://drive.google.com/uc?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs&export=download",
  ];

  const invalidUrls = [
    "https://www.youtube.com/watch?v=abc",
    "https://drive.google.com/",
    "https://docs.google.com/spreadsheets/d/abc/edit",
    "https://google.com/drive/abc",
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

  test("has correct extractor name", () => {
    expect(extractor._NAME).toBe("google-drive");
  });
});

describe("GoogleDriveExtractor parsing", () => {
  test("constructs direct download URL for small files", async () => {
    const extractor = new GoogleDriveExtractor();

    global.fetch = mock(() =>
      Promise.resolve(
        new Response(null, {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-disposition": 'attachment; filename="test-video.mp4"',
            "content-length": "10485760",
          },
        })
      )
    ) as typeof fetch;

    const info = await extractor.extract("https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view");

    expect(info.id).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs");
    expect(info.title).toBe("test-video");
    expect(info.ext).toBe("mp4");
    expect(info.formats![0].url).toContain("export=download");
    expect(info.formats![0].url).toContain("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs");
    expect(info.formats![0].filesize).toBe(10485760);
  });

  test("handles virus scan confirm page for large files", async () => {
    const extractor = new GoogleDriveExtractor();

    const virusScanHtml = `<html><body>
      <form action="/uc?id=BIGFILE&export=download&confirm=t&uuid=abc123">
      <a href="/uc?id=BIGFILE&export=download&confirm=t">Download anyway</a>
      </form>
      <p>Google Drive can't scan this file for viruses.</p>
      <a href="?confirm=t&id=BIGFILE">Download</a>
    </body></html>`;

    let callCount = 0;
    global.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(virusScanHtml, {
            status: 200,
            headers: { "content-type": "text/html" },
          })
        );
      }
      return Promise.resolve(
        new Response(null, {
          status: 200,
          headers: {
            "content-type": "video/mp4",
            "content-disposition": 'attachment; filename="large-file.mp4"',
            "content-length": "1073741824",
          },
        })
      );
    }) as typeof fetch;

    const info = await extractor.extract("https://drive.google.com/file/d/BIGFILE/view");

    expect(info.id).toBe("BIGFILE");
    expect(info.ext).toBe("mp4");
    expect(info.formats![0].url).toContain("confirm=t");
  });
});
