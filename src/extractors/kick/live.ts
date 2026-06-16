import { BaseExtractor, ExtractorError } from "../../core/types";
import type { InfoDict, Format, Thumbnail } from "../../core/types";

const VALID_URL = /https?:\/\/(?:www\.)?kick\.com\/([^/?#]+)(?:\/(?!video|clips).*)?$/;

interface KickLivestreamData {
  id: number;
  slug: string;
  is_live: boolean;
  playback_url: string;
  session_title: string;
  viewer_count?: number;
  thumbnail?: { responsive?: string; url?: string } | null;
  category?: { name: string };
  started_at: string | null;
  user: { username: string; id: number };
}

interface KickChannelResponse {
  id: number;
  slug: string;
  livestream: KickLivestreamData | null;
  user: { username: string; id: number };
}

const KICK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://kick.com",
};

export class KickLiveExtractor extends BaseExtractor {
  readonly _VALID_URL = VALID_URL;
  readonly _NAME = "kick:live";

  protected async _real_extract(url: string): Promise<InfoDict> {
    const match = VALID_URL.exec(url);
    if (!match) throw new ExtractorError(`kick:live: invalid URL: ${url}`);

    const channelSlug = match[1];

    const apiUrl = `https://kick.com/api/v2/channels/${channelSlug}`;
    const resp = await fetch(apiUrl, { headers: KICK_HEADERS });

    if (!resp.ok) {
      throw new ExtractorError(`kick:live: channel API failed: ${resp.status} ${resp.statusText}`);
    }

    const channel = (await resp.json()) as KickChannelResponse;
    const live = channel.livestream;

    if (!live || !live.is_live) {
      throw new ExtractorError(`kick:live: ${channelSlug} is not currently live`);
    }

    const formats: Format[] = [
      {
        format_id: "hls",
        url: live.playback_url,
        ext: "mp4",
        protocol: "m3u8",
        http_headers: KICK_HEADERS,
      },
    ];

    const thumbnailUrl = live.thumbnail?.responsive ?? live.thumbnail?.url;
    const thumbnails: Thumbnail[] = thumbnailUrl ? [{ url: thumbnailUrl }] : [];

    const releaseTimestamp = live.started_at ? new Date(live.started_at).getTime() / 1000 : undefined;

    return {
      id: String(live.id),
      title: live.session_title,
      channel: channelSlug,
      channel_id: String(channel.id),
      channel_url: `https://kick.com/${channelSlug}`,
      uploader: channel.user.username,
      uploader_id: String(channel.user.id),
      view_count: live.viewer_count,
      release_timestamp: releaseTimestamp,
      thumbnails,
      formats,
      categories: live.category ? [live.category.name] : undefined,
      live_status: "is_live",
      webpage_url: url,
      _type: "video",
    };
  }
}
