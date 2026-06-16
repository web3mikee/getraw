import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

interface SoundCloudTranscoding {
  url: string;
  preset: string;
  duration?: number;
  format: {
    protocol: string;
    mime_type: string;
  };
  quality?: string;
}

interface SoundCloudUser {
  id: number;
  username: string;
  permalink_url?: string;
}

interface SoundCloudTrack {
  id: number;
  title: string;
  description?: string;
  duration?: number;
  playback_count?: number;
  likes_count?: number;
  comment_count?: number;
  created_at?: string;
  genre?: string;
  tag_list?: string;
  permalink_url?: string;
  user?: SoundCloudUser;
  artwork_url?: string;
  waveform_url?: string;
  media?: {
    transcodings?: SoundCloudTranscoding[];
  };
}

interface StreamResponse {
  url: string;
}

const CLIENT_ID_PATTERN =
  /,client_id:"([a-zA-Z0-9_-]{32,})"/;

async function extractClientId(pageUrl: string): Promise<string> {
  const pageResponse = await fetch(pageUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!pageResponse.ok) {
    throw new ExtractorError(`SoundCloud page fetch failed: ${pageResponse.status}`);
  }
  const html = await pageResponse.text();

  const scriptMatches = html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g);
  const scriptUrls: string[] = [];
  for (const match of scriptMatches) {
    scriptUrls.push(match[1]);
  }

  for (const scriptUrl of scriptUrls.slice(-3)) {
    const scriptResponse = await fetch(scriptUrl);
    if (!scriptResponse.ok) continue;
    const scriptText = await scriptResponse.text();
    const match = CLIENT_ID_PATTERN.exec(scriptText);
    if (match) return match[1];
  }

  throw new ExtractorError("Could not extract SoundCloud client_id from JS bundle");
}

export class SoundCloudExtractor extends BaseExtractor {
  readonly _VALID_URL =
    /^https?:\/\/(?:(?:www|m)\.)?soundcloud\.com\/([^/]+)\/(?!sets\/)([^/?#]+)/;
  readonly _NAME = "soundcloud";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const clientId = await extractClientId(url);

    const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`;
    const resolveResponse = await fetch(resolveUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!resolveResponse.ok) {
      throw new ExtractorError(`SoundCloud resolve failed: ${resolveResponse.status}`);
    }

    const track = (await resolveResponse.json()) as SoundCloudTrack;

    if (!track.id) {
      throw new ExtractorError("Could not resolve SoundCloud track");
    }

    const transcodings = track.media?.transcodings ?? [];
    const formats: Format[] = [];

    for (const transcoding of transcodings) {
      const streamResponse = await fetch(
        `${transcoding.url}?client_id=${clientId}`,
        { headers: { "User-Agent": "Mozilla/5.0" } },
      );
      if (!streamResponse.ok) continue;

      const stream = (await streamResponse.json()) as StreamResponse;
      if (!stream.url) continue;

      const isHLS = transcoding.format.protocol === "hls";
      const isOpus = transcoding.preset.includes("opus");
      const isAac = transcoding.preset.includes("aac") || transcoding.format.mime_type.includes("aac");

      formats.push({
        format_id: `${transcoding.format.protocol}-${transcoding.preset}`,
        url: stream.url,
        ext: isHLS ? (isOpus ? "opus" : "m4a") : "mp3",
        protocol: isHLS ? "m3u8" : "https",
        acodec: isOpus ? "opus" : isAac ? "aac" : "mp3",
        vcodec: "none",
        abr: isOpus ? 64 : 128,
        format_note: transcoding.preset,
        quality: isOpus ? 0 : 1,
      });
    }

    if (formats.length === 0) {
      throw new ExtractorError("No playable formats found for this SoundCloud track");
    }

    formats.sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));

    const thumbnails: Thumbnail[] = [];
    if (track.artwork_url) {
      thumbnails.push({ url: track.artwork_url.replace("-large", "-t500x500"), preference: 1 });
      thumbnails.push({ url: track.artwork_url });
    }

    const tags = track.tag_list
      ? track.tag_list.match(/"[^"]+"|[^ ]+/g)?.map((t) => t.replace(/"/g, "")) ?? []
      : [];

    return {
      id: String(track.id),
      title: track.title,
      description: track.description,
      uploader: track.user?.username,
      uploader_id: track.user ? String(track.user.id) : undefined,
      uploader_url: track.user?.permalink_url,
      duration: track.duration ? Math.round(track.duration / 1000) : undefined,
      view_count: track.playback_count,
      like_count: track.likes_count,
      comment_count: track.comment_count,
      upload_date: track.created_at?.replace(/-/g, "").slice(0, 8),
      webpage_url: track.permalink_url ?? url,
      categories: track.genre ? [track.genre] : undefined,
      tags,
      thumbnails,
      formats,
    };
  }
}
