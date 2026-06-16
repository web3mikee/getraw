import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const VALID_URL = /https?:\/\/(?:www\.)?kick\.com\/([^/?#]+)\/clips\/([^/?#]+)/;

interface KickClip {
  id: string;
  title: string;
  clip_url: string;
  thumbnail_url: string;
  duration: number;
  view_count: number;
  created_at: string;
  channel: {
    slug: string;
    user_id: number;
    user: { username: string };
  };
  category?: { name: string };
}

interface KickClipResponse {
  clip: KickClip;
}

const KICK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://kick.com",
};

export class KickClipsExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "kick:clips";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = VALID_URL.exec(url);
    if (!match) throw new ExtractorError(`kick:clips: invalid URL: ${url}`);

    const channelSlug = match[1];
    const clipId = match[2];

    const apiUrl = `https://kick.com/api/v2/clips/${clipId}`;
    const resp = await fetch(apiUrl, { headers: KICK_HEADERS });

    if (!resp.ok) {
      throw new ExtractorError(`kick:clips: API request failed: ${resp.status} ${resp.statusText}`);
    }

    const data = (await resp.json()) as KickClipResponse;
    const clip = data.clip;

    if (!clip) {
      throw new ExtractorError(`kick:clips: clip not found: ${clipId}`);
    }

    const formats: Format[] = [
      {
        format_id: "mp4",
        url: clip.clip_url,
        ext: "mp4",
        protocol: "https",
      },
    ];

    const thumbnails: Thumbnail[] = clip.thumbnail_url
      ? [{ url: clip.thumbnail_url }]
      : [];

    const uploadDate = clip.created_at
      ? new Date(clip.created_at).toISOString().slice(0, 10).replace(/-/g, "")
      : undefined;

    return {
      id: clip.id,
      title: clip.title,
      channel: channelSlug,
      channel_url: `https://kick.com/${channelSlug}`,
      uploader: clip.channel?.user?.username,
      uploader_id: String(clip.channel?.user_id ?? ""),
      duration: clip.duration,
      view_count: clip.view_count,
      upload_date: uploadDate,
      thumbnails,
      formats,
      categories: clip.category ? [clip.category.name] : undefined,
      webpage_url: url,
      _type: "video",
    };
  }
}
