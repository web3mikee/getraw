import { describe, test, expect, mock } from "bun:test";
import { SoundCloudExtractor } from "../../../src/extractors/soundcloud/index";
import { SoundCloudPlaylistExtractor } from "../../../src/extractors/soundcloud/playlist";
import { ExtractorError } from "../../../src/core/types";

const trackExtractor = new SoundCloudExtractor();
const playlistExtractor = new SoundCloudPlaylistExtractor();

const FAKE_CLIENT_ID = "abc123def456ghi789jkl012mno345pq";

function makeHTMLWithClientId(clientId: string): string {
  return `
    <html>
      <head><title>SoundCloud</title></head>
      <body>
        <script src="https://a-v2.sndcdn.com/assets/50-abc123.js"></script>
      </body>
    </html>
  `.trim();
}

function makeJSBundle(clientId: string): string {
  return `(function(){var t=1,client_id:"${clientId}",exports={}}())`;
}

const mockTrackData = {
  id: 987654321,
  title: "My Track",
  description: "A great track",
  duration: 210000,
  playback_count: 50000,
  likes_count: 2000,
  comment_count: 100,
  created_at: "2024-01-20T10:00:00Z",
  genre: "Electronic",
  tag_list: '"deep house" techno ambient',
  permalink_url: "https://soundcloud.com/artist/my-track",
  user: {
    id: 111222333,
    username: "Artist Name",
    permalink_url: "https://soundcloud.com/artist",
  },
  artwork_url: "https://i1.sndcdn.com/artworks-large.jpg",
  media: {
    transcodings: [
      {
        url: "https://api-v2.soundcloud.com/media/soundcloud:tracks:987654321/hls",
        preset: "mp3_0_0",
        duration: 210000,
        format: { protocol: "hls", mime_type: "audio/mpeg" },
        quality: "sq",
      },
      {
        url: "https://api-v2.soundcloud.com/media/soundcloud:tracks:987654321/hls_aac",
        preset: "aac_1_0",
        duration: 210000,
        format: { protocol: "hls", mime_type: "audio/mp4" },
        quality: "sq",
      },
      {
        url: "https://api-v2.soundcloud.com/media/soundcloud:tracks:987654321/progressive",
        preset: "mp3_0_0",
        duration: 210000,
        format: { protocol: "progressive", mime_type: "audio/mpeg" },
        quality: "sq",
      },
    ],
  },
};

describe("SoundCloudExtractor", () => {
  test("canHandle matches track URL", () => {
    expect(trackExtractor.canHandle("https://soundcloud.com/artist/my-track")).toBe(true);
    expect(trackExtractor.canHandle("https://www.soundcloud.com/artist/track-name")).toBe(true);
    expect(trackExtractor.canHandle("https://m.soundcloud.com/artist/track-name")).toBe(true);
  });

  test("canHandle rejects playlist URL", () => {
    expect(trackExtractor.canHandle("https://soundcloud.com/artist/sets/my-playlist")).toBe(false);
  });

  test("canHandle rejects non-soundcloud URL", () => {
    expect(trackExtractor.canHandle("https://spotify.com/track/abc")).toBe(false);
  });

  test("_NAME is soundcloud", () => {
    expect(trackExtractor._NAME).toBe("soundcloud");
  });

  test("extract fetches client_id and resolves track", async () => {
    const originalFetch = globalThis.fetch;

    const streamUrls: Record<string, string> = {
      "https://api-v2.soundcloud.com/media/soundcloud:tracks:987654321/hls": "https://cf-hls-media.sndcdn.com/playlist.m3u8",
      "https://api-v2.soundcloud.com/media/soundcloud:tracks:987654321/hls_aac": "https://cf-hls-media.sndcdn.com/aac_playlist.m3u8",
      "https://api-v2.soundcloud.com/media/soundcloud:tracks:987654321/progressive": "https://cf-media.sndcdn.com/track.mp3",
    };

    globalThis.fetch = mock((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url.includes("soundcloud.com/artist/my-track") && !url.includes("api-v2")) {
        return Promise.resolve(
          new Response(makeHTMLWithClientId(FAKE_CLIENT_ID), {
            status: 200,
            headers: { "Content-Type": "text/html" },
          })
        );
      }
      if (url.includes("a-v2.sndcdn.com/assets")) {
        return Promise.resolve(
          new Response(makeJSBundle(FAKE_CLIENT_ID), {
            status: 200,
            headers: { "Content-Type": "application/javascript" },
          })
        );
      }
      if (url.includes("api-v2.soundcloud.com/resolve")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockTrackData), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      for (const [transcodeUrl, streamUrl] of Object.entries(streamUrls)) {
        if (url.startsWith(transcodeUrl)) {
          return Promise.resolve(
            new Response(JSON.stringify({ url: streamUrl }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const info = await trackExtractor.extract("https://soundcloud.com/artist/my-track");

    expect(info.id).toBe("987654321");
    expect(info.title).toBe("My Track");
    expect(info.description).toBe("A great track");
    expect(info.uploader).toBe("Artist Name");
    expect(info.duration).toBe(210);
    expect(info.view_count).toBe(50000);
    expect(info.like_count).toBe(2000);
    expect(info.upload_date).toBe("20240120");
    expect(info.categories).toEqual(["Electronic"]);
    expect(info.formats).toBeDefined();
    expect(info.formats!.length).toBeGreaterThan(0);

    const hlsFormats = info.formats!.filter((f) => f.protocol === "m3u8");
    expect(hlsFormats.length).toBeGreaterThan(0);

    expect(info.thumbnails).toBeDefined();
    expect(info.thumbnails!.some((t) => t.url.includes("t500x500"))).toBe(true);

    globalThis.fetch = originalFetch;
  });

  test("extract throws ExtractorError when page fetch fails", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock(() => Promise.resolve(new Response(null, { status: 500 })));

    await expect(
      trackExtractor.extract("https://soundcloud.com/artist/track")
    ).rejects.toThrow(ExtractorError);

    globalThis.fetch = originalFetch;
  });

  test("extract throws ExtractorError when no JS bundle found", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("soundcloud.com") && !url.includes("a-v2.sndcdn")) {
        return Promise.resolve(
          new Response("<html><body>no scripts here</body></html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          })
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    await expect(
      trackExtractor.extract("https://soundcloud.com/artist/track")
    ).rejects.toThrow(ExtractorError);

    globalThis.fetch = originalFetch;
  });
});

describe("SoundCloudPlaylistExtractor", () => {
  test("canHandle matches sets URL", () => {
    expect(
      playlistExtractor.canHandle("https://soundcloud.com/artist/sets/my-playlist")
    ).toBe(true);
  });

  test("canHandle rejects track URL", () => {
    expect(
      playlistExtractor.canHandle("https://soundcloud.com/artist/my-track")
    ).toBe(false);
  });

  test("_NAME is soundcloud:playlist", () => {
    expect(playlistExtractor._NAME).toBe("soundcloud:playlist");
  });

  test("extract returns playlist with tracks", async () => {
    const originalFetch = globalThis.fetch;

    const mockPlaylistData = {
      id: 111111111,
      title: "My Playlist",
      description: "A playlist",
      duration: 600000,
      track_count: 3,
      likes_count: 500,
      created_at: "2024-02-01T12:00:00Z",
      permalink_url: "https://soundcloud.com/artist/sets/my-playlist",
      user: { id: 111222333, username: "Artist Name", permalink_url: "https://soundcloud.com/artist" },
    };

    const mockTracksPage = {
      collection: [
        { id: 111, title: "Track One", permalink_url: "https://soundcloud.com/artist/track-one" },
        { id: 222, title: "Track Two", permalink_url: "https://soundcloud.com/artist/track-two" },
        { id: 333, title: "Track Three", permalink_url: "https://soundcloud.com/artist/track-three" },
      ],
      next_href: null,
    };

    let callCount = 0;
    globalThis.fetch = mock((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      callCount++;

      if (url.includes("soundcloud.com/artist/sets") && !url.includes("api-v2")) {
        return Promise.resolve(
          new Response(makeHTMLWithClientId(FAKE_CLIENT_ID), {
            status: 200,
            headers: { "Content-Type": "text/html" },
          })
        );
      }
      if (url.includes("a-v2.sndcdn.com/assets")) {
        return Promise.resolve(
          new Response(makeJSBundle(FAKE_CLIENT_ID), {
            status: 200,
            headers: { "Content-Type": "application/javascript" },
          })
        );
      }
      if (url.includes("api-v2.soundcloud.com/resolve")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockPlaylistData), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      if (url.includes("api-v2.soundcloud.com/playlists")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockTracksPage), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const info = await playlistExtractor.extract(
      "https://soundcloud.com/artist/sets/my-playlist"
    );

    expect(info._type).toBe("playlist");
    expect(info.id).toBe("111111111");
    expect(info.title).toBe("My Playlist");
    expect(info.uploader).toBe("Artist Name");
    expect(info.entries).toBeDefined();
    expect(info.entries!.length).toBe(3);
    expect(info.playlist_count).toBe(3);

    const firstEntry = info.entries![0];
    expect(firstEntry.id).toBe("111");
    expect(firstEntry.title).toBe("Track One");
    expect(firstEntry._type).toBe("url");
    expect(firstEntry.playlist_index).toBe(1);

    globalThis.fetch = originalFetch;
  });
});
