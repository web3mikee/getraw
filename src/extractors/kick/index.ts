import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const VALID_URL = /https?:\/\/(?:www\.)?kick\.com\/video\/([a-zA-Z0-9_-]+)/;

interface KickVodData {
  id: string;
  slug: string;
  title: string;
  channel: {
    slug: string;
    user_id: number;
    user: { username: string };
  };
  duration: number;
  views: number;
  created_at: string;
  thumbnail: { responsive?: string; url?: string } | string | null;
  source: string;
  categories?: Array<{ name: string }>;
  start_time?: string;
}

interface KickVodResponse {
  data: {
    id: string;
    slug: string;
    title: string;
    channel: {
      slug: string;
      user_id: number;
      user: { username: string };
    };
    duration: number;
    views: number;
    created_at: string;
    thumbnail: { responsive?: string; url?: string } | string | null;
    source: string;
    categories?: Array<{ name: string }>;
    start_time?: string;
  } | null;
}

const KICK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://kick.com",
};

export class KickExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "kick";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = VALID_URL.exec(url);
    if (!match) throw new ExtractorError(`kick: invalid URL: ${url}`);

    const videoId = match[1];

    const apiUrl = `https://kick.com/api/v1/video/${videoId}`;
    const resp = await fetch(apiUrl, { headers: KICK_HEADERS });

    if (!resp.ok) {
      throw new ExtractorError(`kick: API request failed: ${resp.status} ${resp.statusText}`);
    }

    const response = (await resp.json()) as KickVodResponse;
    const vod = response.data;

    if (!vod) {
      throw new ExtractorError(`kick: VOD not found: ${videoId}`);
    }

    const hlsUrl = vod.source;
    if (!hlsUrl) throw new ExtractorError(`kick: no source URL for VOD: ${videoId}`);

    const formats: Format[] = [
      {
        format_id: "hls",
        url: hlsUrl,
        ext: "mp4",
        protocol: "m3u8",
        http_headers: KICK_HEADERS,
      },
    ];

    let thumbnailUrl: string | undefined;
    if (typeof vod.thumbnail === "string") {
      thumbnailUrl = vod.thumbnail;
    } else if (vod.thumbnail && typeof vod.thumbnail === "object") {
      thumbnailUrl = vod.thumbnail.responsive ?? vod.thumbnail.url;
    }

    const thumbnails: Thumbnail[] = thumbnailUrl ? [{ url: thumbnailUrl }] : [];

    const uploadDate = vod.created_at
      ? new Date(vod.created_at).toISOString().slice(0, 10).replace(/-/g, "")
      : undefined;

    return {
      id: vod.id,
      title: vod.title,
      channel: vod.channel.slug,
      channel_url: `https://kick.com/${vod.channel.slug}`,
      uploader: vod.channel.user.username,
      uploader_id: String(vod.channel.user_id),
      uploader_url: `https://kick.com/${vod.channel.slug}`,
      duration: vod.duration,
      view_count: vod.views,
      upload_date: uploadDate,
      thumbnails,
      formats,
      categories: vod.categories?.map((c) => c.name),
      webpage_url: url,
      _type: "video",
    };
  }
}
